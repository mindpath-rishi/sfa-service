import { config } from 'dotenv';
import mongoose from 'mongoose';
import { resolve } from 'path';

/**
 * Turns on two uniqueness rules the schemas always declared but the database
 * never enforced, because a plain index with the same name was built first:
 *
 *   non_sale:          one non-sale per visit          (visitId, unique)
 *   interaction_logs:  one ARRIVED interaction per salesman
 *
 * Dry run by default; pass --apply to change indexes. Aborts without changes
 * if existing data already breaks either rule.
 *
 *   npm run migrate:unique-visit-indexes            # report only
 *   npm run migrate:unique-visit-indexes -- --apply
 */

const environment = process.env.NODE_ENV?.trim() || 'development';
config({
  path: [
    resolve(__dirname, `../.env.${environment}`),
    resolve(__dirname, '../.env'),
  ],
  quiet: true,
});

const apply = process.argv.includes('--apply');

const migrateUniqueVisitIndexes = async () => {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    throw new Error('MONGO_URI is required');
  }

  const connection = await mongoose.createConnection(uri).asPromise();

  try {
    const nonSale = connection.collection('non_sale');
    const interactions = connection.collection('interaction_logs');

    /* ---------------- CHECK EXISTING DATA ---------------- */

    const duplicateVisits = await nonSale
      .aggregate([
        { $group: { _id: '$visitId', count: { $sum: 1 } } },
        { $match: { count: { $gt: 1 } } },
      ])
      .toArray();

    const duplicateArrivals = await interactions
      .aggregate([
        { $match: { status: 'ARRIVED' } },
        { $group: { _id: '$employeeId', count: { $sum: 1 } } },
        { $match: { count: { $gt: 1 } } },
      ])
      .toArray();

    if (duplicateVisits.length || duplicateArrivals.length) {
      console.error('Existing data breaks the rules; nothing was changed.');
      console.error('Visits with several non-sales:', duplicateVisits);
      console.error('Salesmen with several ARRIVED:', duplicateArrivals);
      process.exitCode = 1;
      return;
    }

    /* ---------------- non_sale.visitId ---------------- */

    const visitIndex = (await nonSale.indexes()).find(
      (index) => index.name === 'visitId_1',
    );

    if (visitIndex?.unique) {
      console.log('non_sale: visitId_1 is already unique');
    } else {
      console.log(
        `non_sale: ${visitIndex ? 'replace plain' : 'create'} visitId_1 with a unique index`,
      );
      if (apply) {
        // MongoDB 4.4 cannot hold two indexes on the same key, so the plain
        // one has to go first; the gap is only as long as the index build.
        if (visitIndex) await nonSale.dropIndex('visitId_1');
        await nonSale.createIndex(
          { visitId: 1 },
          { name: 'visitId_1', unique: true },
        );
      }
    }

    /* ---------------- interaction_logs ---------------- */

    const hasArrivalIndex = (await interactions.indexes()).some(
      (index) => index.name === 'employeeId_arrived_unique',
    );

    if (hasArrivalIndex) {
      console.log('interaction_logs: employeeId_arrived_unique already exists');
    } else {
      console.log('interaction_logs: create employeeId_arrived_unique');
      if (apply) {
        await interactions.createIndex(
          { employeeId: 1, status: 1 },
          {
            name: 'employeeId_arrived_unique',
            unique: true,
            partialFilterExpression: { status: 'ARRIVED' },
          },
        );
      }
    }

    console.log(apply ? 'Done.' : 'Dry run only; re-run with --apply.');
  } finally {
    await connection.close();
  }
};

migrateUniqueVisitIndexes().catch((error) => {
  console.error(error);
  process.exit(1);
});
