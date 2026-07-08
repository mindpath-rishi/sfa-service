// import { Schema } from 'mongoose';
// import { RequestContextStore } from 'src/core/context/request-context';
// import { AuditAction } from 'src/shared/enums/app.enums';
// const IGNORED_FIELDS = ['updatedAt', 'createdAt', '__v'];

// export const auditPlugin = (schema: Schema, entity: string) => {
//   /* ================= CREATE ================= */
//   schema.post('save', function (doc: any) {

//     const ctx = RequestContextStore.getStore();
//     if (!ctx?.userId) return;

//     const AuditLog = (doc.constructor as any).db.model('AuditLog');

//     AuditLog.create({
//       entity,
//       entityId: doc.customerId || doc.employeeId || doc._id.toString(),
//       action: AuditAction.CREATE,
//       after: doc.toObject(),
//       performedBy: {
//         employeeId: ctx.userId,
//         name: ctx.name,
//         role: ctx.role,
//       },
//     }).catch(() => null);
//   });

//   /* ================= BEFORE ================= */
//   schema.pre('updateOne', async function () {
//     const ctx = RequestContextStore.getStore();
//     if (!ctx?.userId) return;

//     const update: any = this.getUpdate();
//     const set = update?.$set ?? {};

//     console.log(update)
//     const keys = Object.keys(update).filter(
//       (k) => !IGNORED_FIELDS.includes(k),
//     );
//     if (!keys.length) return;

//     const original = await this.model
//     .findOne(this.getQuery())
//     .lean();

//     console.log(original, "update")

//     if (!original) return;

//     const before: Record<string, any> = {};
//     for (const k of keys) {
//       before[k] = original[k];
//     }

//     (this as any)._auditBefore = before;
//   });

//   /* ================= AFTER ================= */
//   schema.post('updateOne', function () {
//     const ctx = RequestContextStore.getStore();
//     if (!ctx?.userId) return;

//     const update: any = this.getUpdate();
//     const set = update?.$set ?? {};

//     const after = Object.fromEntries(
//       Object.entries(set).filter(
//         ([k]) => !IGNORED_FIELDS.includes(k),
//       ),
//     );

//     if (!Object.keys(after).length) return;

//     const AuditLog = (this.model as any).db.model('AuditLog');
//     const query: any = this.getQuery();

//     AuditLog.create({
//       entity,
//       entityId:
//         query.customerId ||
//         query.employeeId ||
//         query._id?.toString(),
//       action:
//         after.isDeleted === true
//           ? AuditAction.DELETE
//           : after.isDeleted === false
//           ? AuditAction.RESTORE
//           : AuditAction.UPDATE,
//       before: (this as any)._auditBefore,
//       after,
//       performedBy: {
//         employeeId: ctx.userId,
//         name: ctx.name,
//         role: ctx.role,
//       },
//     }).catch(() => null);
//   });
// };

import { Schema } from 'mongoose';
import { RequestContextStore } from 'src/core/context/request-context';
import { AuditAction } from 'src/shared/enums/app.enums';

const IGNORED_FIELDS = ['updatedAt', 'createdAt', '__v'];

const getEntityId = (docOrQuery: any): string | undefined => {
  return (
    docOrQuery?.customerId ||
    docOrQuery?.employeeId ||
    docOrQuery?._id?.toString?.() ||
    docOrQuery?._id
  );
};

const getValueByPath = (obj: any, path: string) => {
  return path.split('.').reduce((acc, key) => acc?.[key], obj);
};

const isEqual = (a: any, b: any) => {
  return JSON.stringify(a) === JSON.stringify(b);
};

const extractSetFields = (update: any): Record<string, any> => {
  if (!update) return {};

  /**
   * Case 1:
   * Model.updateOne({ _id }, { $set: { name: 'Test' } })
   */
  if (update.$set) {
    return update.$set;
  }

  /**
   * Case 2:
   * Model.updateOne({ _id }, { name: 'Test' })
   */
  return Object.fromEntries(
    Object.entries(update).filter(([key]) => !key.startsWith('$')),
  );
};

export const auditPlugin = (schema: Schema, entity: string) => {
  /* ================= BEFORE SAVE ================= */
  schema.pre('save', function () {
    (this as any)._wasNew = this.isNew;
  });

  /* ================= CREATE ================= */
  schema.post('save', function (doc: any) {
    const ctx = RequestContextStore.getStore();
    if (!ctx?.userId) return;

    /**
     * Important:
     * post('save') also runs on document.save() update.
     * So CREATE audit should run only when document was new.
     */
    if (!(doc as any)._wasNew) return;

    const AuditLog = (doc.constructor as any).db.model('AuditLog');

    AuditLog.create({
      entity,
      entityId: getEntityId(doc),
      action: AuditAction.CREATE,
      after: doc.toObject(),
      performedBy: {
        employeeId: ctx.userId,
        name: ctx.name,
        role: ctx.role,
      },
    }).catch(() => null);
  });

  /* ================= BEFORE UPDATE ================= */
  schema.pre('updateOne', async function () {
    const ctx = RequestContextStore.getStore();
    if (!ctx?.userId) return;

    const update: any = this.getUpdate();
    const set = extractSetFields(update);

    const keys = Object.keys(set).filter(
      (key) => !IGNORED_FIELDS.includes(key),
    );

    if (!keys.length) return;

    const original = await this.model.findOne(this.getQuery()).lean();

    if (!original) return;

    const before: Record<string, any> = {};
    const after: Record<string, any> = {};

    for (const key of keys) {
      const oldValue = getValueByPath(original, key);
      const newValue = set[key];

      /**
       * Do not create audit entry if value is same.
       */
      if (!isEqual(oldValue, newValue)) {
        before[key] = oldValue;
        after[key] = newValue;
      }
    }

    if (!Object.keys(after).length) return;

    (this as any)._auditBefore = before;
    (this as any)._auditAfter = after;
    (this as any)._auditEntityId = getEntityId(original);
  });

  /* ================= AFTER UPDATE ================= */
  schema.post('updateOne', function (result: any) {
    const ctx = RequestContextStore.getStore();
    if (!ctx?.userId) return;

    const before = (this as any)._auditBefore;
    const after = (this as any)._auditAfter;
    const entityId = (this as any)._auditEntityId;

    if (!after || !Object.keys(after).length) return;

    /**
     * Optional safety:
     * If MongoDB says no document was modified, do not create audit log.
     */
    if (result?.modifiedCount === 0) return;

    const AuditLog = (this.model as any).db.model('AuditLog');

    AuditLog.create({
      entity,
      entityId,
      action:
        after.isDeleted === true
          ? AuditAction.DELETE
          : after.isDeleted === false
            ? AuditAction.RESTORE
            : AuditAction.UPDATE,
      before,
      after,
      performedBy: {
        employeeId: ctx.userId,
        name: ctx.name,
        role: ctx.role,
      },
    }).catch(() => null);
  });
};
