import { config } from 'dotenv';
import mongoose from 'mongoose';
import { resolve } from 'path';

const environment = process.env.NODE_ENV?.trim() || 'development';
config({
  path: [
    resolve(__dirname, `../.env.${environment}`),
    resolve(__dirname, '../.env'),
  ],
  quiet: true,
});

const migrateSalesPositionHierarchy = async () => {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    throw new Error('MONGO_URI is required');
  }

  const connection = await mongoose.createConnection(uri).asPromise();

  try {
    const sales = connection.collection('sales');
    const employeeResult = await sales.updateMany(
      { employees: { $exists: true } },
      { $unset: { employees: '' } },
    );
    const hierarchyResult = await sales.updateMany(
      { positionHierarchy: { $type: 'array' } },
      {
        $unset: {
          'positionHierarchy.$[]._id': '',
          'positionHierarchy.$[].isDeleted': '',
          'positionHierarchy.$[].createdOffline': '',
          'positionHierarchy.$[].syncSource': '',
          'positionHierarchy.$[].createdAt': '',
          'positionHierarchy.$[].updatedAt': '',
        },
      },
    );
    const indexes = new Set(
      (await sales.indexes()).map((index) => String(index.name)),
    );
    for (const legacyIndex of [
      'idx_employee_sales_date',
      'idx_employee_position_sales_date',
    ]) {
      if (indexes.has(legacyIndex)) {
        await sales.dropIndex(legacyIndex);
      }
    }
    await sales.createIndex(
      { 'positionHierarchy.employeeId': 1, date: 1 },
      { name: 'idx_position_hierarchy_employee_sales_date' },
    );

    console.info(
      `Sales hierarchy migration completed: employees removed from ${employeeResult.modifiedCount} sale(s), hierarchy metadata removed from ${hierarchyResult.modifiedCount} sale(s).`,
    );
  } finally {
    await connection.close();
  }
};

migrateSalesPositionHierarchy().catch((error: unknown) => {
  console.error(
    error instanceof Error ? error.message : 'Sales hierarchy migration failed',
  );
  process.exitCode = 1;
});
