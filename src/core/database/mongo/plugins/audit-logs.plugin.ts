/**
 * Audit Log Plugin
 * ----------------
 * Records CREATE / UPDATE / DELETE / RESTORE entries in `audit_logs` for any
 * schema it is attached to (see audit-registry.ts for the audited modules).
 *
 * Covers:
 * - doc.save()                (create, and updates of existing documents)
 * - Model.insertMany()        (create)
 * - updateOne / updateMany / findOneAndUpdate / replaceOne / findOneAndReplace
 * - deleteOne / deleteMany / findOneAndDelete
 *
 * How:
 * - Before a write, the matching documents are read; after it, they are read
 *   again and only the fields that actually changed are stored. This works for
 *   every update operator ($set, $unset, $inc, $push, ...).
 * - Reads and the audit write use the caller's session, so an aborted
 *   transaction leaves no audit entry and in-transaction documents are seen.
 * - Secrets (passwords, tokens) are redacted.
 * - Writes without a logged-in user (ERP syncs, schedulers) are recorded
 *   as SYSTEM.
 * - Audit failures never fail the business operation.
 *
 * Not covered: Model.bulkWrite() (only used for stock ledgers, not audited).
 */

import type { ClientSession, Model, Schema } from 'mongoose';
import { RequestContextStore } from 'src/core/context/request-context';
import { AuditAction } from 'src/shared/enums/app.enums';
import { AuditLog, AuditLogSchema } from '../schema/audit-log.schema';

export type AuditPluginOptions = {
  /** Module key stored as `entity`, e.g. "routes" */
  entity: string;
  /** Business ID field stored as `entityId`, e.g. "routeId" (falls back to _id) */
  idField?: string;
};

const IGNORED_FIELDS = new Set(['_id', '__v', 'createdAt', 'updatedAt']);
const REDACTED_FIELDS = new Set([
  'password',
  'passwordHash',
  'refreshToken',
  'accessToken',
  'token',
  'otp',
  'fcmToken',
]);
const REDACTED = '[REDACTED]';
/** Max documents audited for a single updateMany / deleteMany */
const MAX_DOCS_PER_OPERATION = 500;

const UPDATE_HOOKS = [
  'updateOne',
  'updateMany',
  'findOneAndUpdate',
  'replaceOne',
  'findOneAndReplace',
] as const;
const DELETE_HOOKS = ['deleteOne', 'deleteMany', 'findOneAndDelete'] as const;
const SINGLE_DOC_HOOKS = new Set([
  'updateOne',
  'findOneAndUpdate',
  'replaceOne',
  'findOneAndReplace',
  'deleteOne',
  'findOneAndDelete',
]);

type AuditEntry = {
  entity: string;
  entityId: string;
  action: AuditAction;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  performedBy: { employeeId: string; name?: string; role?: string };
  metadata?: Record<string, unknown>;
};

/* ======================================================
 * HELPERS
 * ====================================================== */

/** Plain JSON copy (ObjectId/Date -> string) with secrets redacted */
const sanitize = (value: unknown): any => {
  if (value === undefined) return undefined;
  const plain = JSON.parse(JSON.stringify(value));
  const redact = (node: any) => {
    if (!node || typeof node !== 'object') return;
    for (const key of Object.keys(node)) {
      if (REDACTED_FIELDS.has(key)) node[key] = REDACTED;
      else redact(node[key]);
    }
  };
  redact(plain);
  return plain;
};

const toPlain = (doc: any) =>
  typeof doc?.toObject === 'function' ? doc.toObject() : doc;

const performedBy = () => {
  const ctx = RequestContextStore.getStore();
  return ctx?.userId
    ? { employeeId: ctx.userId, name: ctx.name, role: ctx.role }
    : { employeeId: 'SYSTEM', name: 'System' };
};

const entityIdOf = (doc: any, idField?: string): string =>
  String(
    (idField && doc?.[idField]) ?? doc?._id?.toString?.() ?? doc?._id ?? '',
  );

/** Only the top-level fields whose value changed */
const diff = (beforeDoc: any, afterDoc: any) => {
  const before = sanitize(beforeDoc) ?? {};
  const after = sanitize(afterDoc) ?? {};
  const changedBefore: Record<string, unknown> = {};
  const changedAfter: Record<string, unknown> = {};

  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (IGNORED_FIELDS.has(key)) continue;
    if (JSON.stringify(before[key]) === JSON.stringify(after[key])) continue;
    changedBefore[key] = before[key] ?? null;
    changedAfter[key] = after[key] ?? null;
  }

  return Object.keys(changedAfter).length
    ? { before: changedBefore, after: changedAfter }
    : null;
};

const updateAction = (before: any, after: any) => {
  if (after?.isDeleted === true && before?.isDeleted !== true) {
    return AuditAction.DELETE;
  }
  if (after?.isDeleted === false && before?.isDeleted === true) {
    return AuditAction.RESTORE;
  }
  return AuditAction.UPDATE;
};

const auditModel = (model: Model<any>): Model<any> =>
  (model.db.models[AuditLog.name] as Model<any> | undefined) ??
  (model.db.model(AuditLog.name, AuditLogSchema) as unknown as Model<any>);

const writeEntries = async (
  model: Model<any>,
  entries: AuditEntry[],
  session?: ClientSession | null,
) => {
  if (!entries.length) return;
  try {
    await auditModel(model).insertMany(
      entries as unknown as Record<string, unknown>[],
      session ? { session } : {},
    );
  } catch {
    // Auditing must never break the business operation
  }
};

/* ======================================================
 * PLUGIN
 * ====================================================== */

export const auditPlugin = (
  schema: Schema,
  options: AuditPluginOptions | string,
) => {
  const { entity, idField } =
    typeof options === 'string' ? { entity: options } : options;

  const entry = (
    doc: any,
    action: AuditAction,
    change: { before?: unknown; after?: unknown },
    metadata?: Record<string, unknown>,
  ): AuditEntry => ({
    entity,
    entityId: entityIdOf(doc, idField),
    action,
    before: change.before as Record<string, unknown> | undefined,
    after: change.after as Record<string, unknown> | undefined,
    performedBy: performedBy(),
    ...(metadata ? { metadata } : {}),
  });

  /* ---------------- doc.save() ---------------- */
  schema.pre('save', async function (this: any) {
    this.$locals.auditWasNew = this.isNew;
    if (this.isNew) return;
    try {
      this.$locals.auditBefore = await (this.constructor as Model<any>)
        .findById(this._id)
        .session(this.$session() ?? null)
        .lean();
    } catch {
      this.$locals.auditBefore = undefined;
    }
  });

  schema.post('save', async function (this: any, doc: any) {
    const model = doc.constructor as Model<any>;
    const session = doc.$session?.() ?? null;
    const after = toPlain(doc);

    if (doc.$locals?.auditWasNew) {
      await writeEntries(
        model,
        [entry(after, AuditAction.CREATE, { after: sanitize(after) })],
        session,
      );
      return;
    }

    const before = doc.$locals?.auditBefore;
    const change = before ? diff(before, after) : null;
    if (!change) return;
    await writeEntries(
      model,
      [entry(after, updateAction(before, after), change)],
      session,
    );
  });

  /* ---------------- insertMany ---------------- */
  schema.post('insertMany', async function (this: any, docs: any) {
    const list = Array.isArray(docs) ? docs : [docs];
    if (!list.length) return;
    const model = this as Model<any>;
    const session = list[0]?.$session?.() ?? null;
    await writeEntries(
      model,
      list.map((doc) => {
        const after = toPlain(doc);
        return entry(after, AuditAction.CREATE, { after: sanitize(after) });
      }),
      session,
    );
  });

  /* ---------------- updates ---------------- */
  for (const hook of UPDATE_HOOKS) {
    schema.pre(
      hook as any,
      { document: false, query: true },
      async function (this: any) {
        const session: ClientSession | null =
          this.getOptions()?.session ?? null;
        try {
          const limit = SINGLE_DOC_HOOKS.has(hook) ? 1 : MAX_DOCS_PER_OPERATION;
          const before = await this.model
            .find(this.getFilter())
            .session(session)
            .limit(limit)
            .lean();
          this._auditBefore = before;
          this._auditSession = session;
        } catch {
          this._auditBefore = undefined;
        }
      },
    );

    schema.post(
      hook as any,
      { document: false, query: true },
      async function (this: any) {
        const befores: any[] | undefined = this._auditBefore;
        if (!befores) return;
        const model = this.model as Model<any>;
        const session: ClientSession | null = this._auditSession ?? null;

        try {
          // Upsert that created a new document
          if (!befores.length) {
            if (!this.getOptions()?.upsert) return;
            const created = await model
              .findOne(this.getFilter())
              .session(session)
              .lean();
            if (created) {
              await writeEntries(
                model,
                [entry(created, AuditAction.CREATE, { after: sanitize(created) })],
                session,
              );
            }
            return;
          }

          const afters: any[] = await model
            .find({ _id: { $in: befores.map((doc) => doc._id) } })
            .session(session)
            .lean();
          const afterById = new Map(afters.map((doc) => [String(doc._id), doc]));
          const metadata =
            hook === 'updateMany' && befores.length >= MAX_DOCS_PER_OPERATION
              ? { truncated: true, auditedDocs: befores.length }
              : undefined;

          const entries = befores
            .map((before) => {
              const after = afterById.get(String(before._id));
              if (!after) return null;
              const change = diff(before, after);
              return change
                ? entry(after, updateAction(before, after), change, metadata)
                : null;
            })
            .filter((value): value is AuditEntry => Boolean(value));

          await writeEntries(model, entries, session);
        } catch {
          // ignore audit errors
        }
      },
    );
  }

  /* ---------------- hard deletes ---------------- */
  for (const hook of DELETE_HOOKS) {
    schema.pre(
      hook as any,
      { document: false, query: true },
      async function (this: any) {
        const session: ClientSession | null =
          this.getOptions()?.session ?? null;
        try {
          const limit = SINGLE_DOC_HOOKS.has(hook) ? 1 : MAX_DOCS_PER_OPERATION;
          this._auditBefore = await this.model
            .find(this.getFilter())
            .session(session)
            .limit(limit)
            .lean();
          this._auditSession = session;
        } catch {
          this._auditBefore = undefined;
        }
      },
    );

    schema.post(
      hook as any,
      { document: false, query: true },
      async function (this: any) {
        const befores: any[] | undefined = this._auditBefore;
        if (!befores?.length) return;
        await writeEntries(
          this.model,
          befores.map((before) =>
            entry(before, AuditAction.DELETE, { before: sanitize(before) }, {
              hardDelete: true,
            }),
          ),
          this._auditSession ?? null,
        );
      },
    );
  }
};
