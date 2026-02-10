import { Schema } from 'mongoose';
import { RequestContextStore } from 'src/core/context/request-context';
import { AuditAction } from 'src/shared/enums/app.enums';
const IGNORED_FIELDS = ['updatedAt', 'createdAt', '__v'];

export const auditPlugin = (schema: Schema, entity: string) => {
  /* ================= CREATE ================= */
  schema.post('save', function (doc: any) {

    const ctx = RequestContextStore.getStore();
    if (!ctx?.userId) return;

    const AuditLog = (doc.constructor as any).db.model('AuditLog');

    AuditLog.create({
      entity,
      entityId: doc.customerId || doc.employeeId || doc._id.toString(),
      action: AuditAction.CREATE,
      after: doc.toObject(),
      performedBy: {
        employeeId: ctx.userId,
        name: ctx.name,
        role: ctx.role,
      },
    }).catch(() => null);
  });

  /* ================= BEFORE ================= */
  schema.pre('updateOne', async function () {
    const ctx = RequestContextStore.getStore();
    if (!ctx?.userId) return;

    const update: any = this.getUpdate();
    const set = update?.$set ?? {};

    console.log(update)
    const keys = Object.keys(update).filter(
      (k) => !IGNORED_FIELDS.includes(k),
    );
    if (!keys.length) return;
    
    const original = await this.model
    .findOne(this.getQuery())
    .lean();
    
    console.log(original, "update")

    if (!original) return;

    const before: Record<string, any> = {};
    for (const k of keys) {
      before[k] = original[k];
    }

    (this as any)._auditBefore = before;
  });

  /* ================= AFTER ================= */
  schema.post('updateOne', function () {
    const ctx = RequestContextStore.getStore();
    if (!ctx?.userId) return;

    const update: any = this.getUpdate();
    const set = update?.$set ?? {};

    const after = Object.fromEntries(
      Object.entries(set).filter(
        ([k]) => !IGNORED_FIELDS.includes(k),
      ),
    );

    if (!Object.keys(after).length) return;

    const AuditLog = (this.model as any).db.model('AuditLog');
    const query: any = this.getQuery();

    AuditLog.create({
      entity,
      entityId:
        query.customerId ||
        query.employeeId ||
        query._id?.toString(),
      action:
        after.isDeleted === true
          ? AuditAction.DELETE
          : after.isDeleted === false
          ? AuditAction.RESTORE
          : AuditAction.UPDATE,
      before: (this as any)._auditBefore,
      after,
      performedBy: {
        employeeId: ctx.userId,
        name: ctx.name,
        role: ctx.role,
      },
    }).catch(() => null);
  });
};
