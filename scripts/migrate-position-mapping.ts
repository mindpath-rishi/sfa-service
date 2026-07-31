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

const migratePositionMapping = async () => {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    throw new Error('MONGO_URI is required');
  }

  const connection = await mongoose.createConnection(uri).asPromise();

  try {
    const database = connection.db;
    if (!database) {
      throw new Error('MongoDB connection is not initialized');
    }
    const legacyCollectionName = ['design', 'ation_master'].join('');
    const legacyIdField = ['design', 'ationId'].join('');
    const legacyPermissionPrefix = ['DESIGN', 'ATION_'].join('');
    const collectionNames = new Set(
      (await database.listCollections().toArray()).map(
        (collection) => collection.name,
      ),
    );
    const positionsCollection = connection.collection('position_master');
    if (
      collectionNames.has(legacyCollectionName) &&
      collectionNames.has('position_master')
    ) {
      const legacyPositionsCollection =
        connection.collection(legacyCollectionName);
      const legacyPositions = await legacyPositionsCollection
        .find({})
        .toArray();
      let insertedPositions = 0;
      let mergedPositions = 0;

      for (const legacyPosition of legacyPositions) {
        const positionId = String(
          legacyPosition.positionId || legacyPosition[legacyIdField] || '',
        ).trim();
        if (!positionId) {
          throw new Error(
            `Legacy position record ${legacyPosition._id} has no position ID.`,
          );
        }

        const transformedPosition: Record<string, unknown> = {
          ...legacyPosition,
          positionId,
        };
        delete transformedPosition._id;
        delete transformedPosition[legacyIdField];

        const matchConditions: Record<string, unknown>[] = [{ positionId }];
        if (legacyPosition.name) {
          matchConditions.push({ name: legacyPosition.name });
        }
        const existingPosition = await positionsCollection.findOne({
          $or: matchConditions,
        });

        if (!existingPosition) {
          await positionsCollection.insertOne(transformedPosition);
          insertedPositions += 1;
          continue;
        }
        if (String(existingPosition.positionId || '') !== positionId) {
          throw new Error(
            `Position name ${legacyPosition.name} maps to conflicting IDs (${positionId}, ${existingPosition.positionId}); resolve before migration.`,
          );
        }

        const missingFields = Object.fromEntries(
          Object.entries(transformedPosition).filter(
            ([key, value]) =>
              key !== 'positionId' &&
              value !== undefined &&
              value !== null &&
              (existingPosition[key] === undefined ||
                existingPosition[key] === null ||
                existingPosition[key] === ''),
          ),
        );
        if (Object.keys(missingFields).length) {
          await positionsCollection.updateOne(
            { _id: existingPosition._id },
            { $set: missingFields },
          );
        }
        mergedPositions += 1;
      }

      const backupCollectionName = `position_master_pre_migration_backup_${Date.now()}`;
      await database.renameCollection(
        legacyCollectionName,
        backupCollectionName,
      );
      console.info(
        `Merged ${insertedPositions} legacy position(s), enriched ${mergedPositions} existing position(s), and preserved the legacy collection as ${backupCollectionName}.`,
      );
    }
    if (collectionNames.has(legacyCollectionName)) {
      const refreshedCollectionNames = new Set(
        (await database.listCollections().toArray()).map(
          (collection) => collection.name,
        ),
      );
      if (!refreshedCollectionNames.has('position_master')) {
        await database.renameCollection(
          legacyCollectionName,
          'position_master',
        );
      }
    }

    const vansCollection = connection.collection('vans');
    const employeesCollection = connection.collection('employees');
    const rolesCollection = connection.collection('roles');

    await vansCollection.updateMany(
      {
        $or: [
          { isDeleted: true },
          { driverEmployeeId: null },
          { driverEmployeeId: '' },
        ],
      },
      { $unset: { driverEmployeeId: '', driverName: '' } },
    );
    const duplicateDriverMappings = await vansCollection
      .aggregate<{ _id: string; vanIds: string[] }>([
        {
          $match: {
            driverEmployeeId: { $type: 'string', $ne: '' },
            isDeleted: { $ne: true },
          },
        },
        {
          $group: {
            _id: '$driverEmployeeId',
            vanIds: { $addToSet: '$vanId' },
            count: { $sum: 1 },
          },
        },
        { $match: { count: { $gt: 1 } } },
      ])
      .toArray();
    if (duplicateDriverMappings.length) {
      const details = duplicateDriverMappings
        .map((mapping) => `${mapping._id}: ${mapping.vanIds.join(', ')}`)
        .join('; ');
      throw new Error(
        `A driver is mapped to multiple vans. Resolve these mappings before migration: ${details}`,
      );
    }
    const existingDriverIndex = (await vansCollection.indexes()).find(
      (index) =>
        index.key?.driverEmployeeId === 1 &&
        Object.keys(index.key).length === 1,
    );
    if (existingDriverIndex?.name && existingDriverIndex.unique !== true) {
      await vansCollection.dropIndex(existingDriverIndex.name);
    }
    await vansCollection.createIndex(
      { driverEmployeeId: 1 },
      {
        name: 'driverEmployeeId_1',
        unique: true,
        sparse: true,
      },
    );

    await employeesCollection.updateMany(
      { employeeType: { $exists: false } },
      { $set: { employeeType: 'STAFF' } },
    );

    await positionsCollection.updateMany(
      {
        positionId: { $exists: false },
        [legacyIdField]: { $exists: true },
      },
      [
        { $set: { positionId: `$${legacyIdField}` } },
        { $unset: legacyIdField },
      ],
    );
    await employeesCollection.updateMany(
      {
        positionId: { $exists: false },
        [legacyIdField]: { $exists: true },
      },
      [
        { $set: { positionId: `$${legacyIdField}` } },
        { $unset: legacyIdField },
      ],
    );

    const rolesWithLegacyPermissions = await rolesCollection
      .find({ permissions: { $regex: `^${legacyPermissionPrefix}` } })
      .project({ roleId: 1, permissions: 1 })
      .toArray();
    for (const role of rolesWithLegacyPermissions) {
      const permissions = Array.isArray(role.permissions)
        ? role.permissions.map((permission) =>
            typeof permission === 'string' &&
            permission.startsWith(legacyPermissionPrefix)
              ? `POSITION_${permission.slice(legacyPermissionPrefix.length)}`
              : permission,
          )
        : [];
      await rolesCollection.updateOne(
        { _id: role._id },
        { $set: { permissions } },
      );
    }

    const employeePositions = await employeesCollection
      .find(
        {
          $or: [
            { locationId: { $exists: true } },
            { positionId: { $exists: true } },
          ],
        },
        { projection: { employeeId: 1, locationId: 1, positionId: 1 } },
      )
      .toArray();
    const positionByEmployeeId = new Map(
      employeePositions.map((employee) => [
        String(employee.employeeId),
        String(employee.locationId || employee.positionId),
      ]),
    );
    const employeeByPositionId = new Map<string, string>();
    for (const employee of employeePositions) {
      const employeeId = String(employee.employeeId);
      const positionId = String(employee.locationId || employee.positionId);
      const mappedEmployeeId = employeeByPositionId.get(positionId);
      if (mappedEmployeeId && mappedEmployeeId !== employeeId) {
        throw new Error(
          `Position ${positionId} has multiple employees (${mappedEmployeeId}, ${employeeId}); resolve before migration.`,
        );
      }
      employeeByPositionId.set(positionId, employeeId);
    }
    const employeeRoles = await employeesCollection
      .find(
        {
          $or: [
            { locationId: { $exists: true } },
            { positionId: { $exists: true } },
          ],
          roleId: { $exists: true },
        },
        {
          projection: {
            locationId: 1,
            positionId: 1,
            roleId: 1,
            reportingEmployeeId: 1,
          },
        },
      )
      .toArray();
    const roleByPositionId = new Map<string, string>();
    const reportingEmployeeByPositionId = new Map<string, string>();
    for (const employee of employeeRoles) {
      const positionId = String(employee.locationId || employee.positionId);
      const roleId = String(employee.roleId);
      const existingRoleId = roleByPositionId.get(positionId);
      if (existingRoleId && existingRoleId !== roleId) {
        throw new Error(
          `Position ${positionId} has multiple employee roles (${existingRoleId}, ${roleId}); resolve before migration.`,
        );
      }
      roleByPositionId.set(positionId, roleId);
      if (employee.reportingEmployeeId) {
        const reportingEmployeeId = String(employee.reportingEmployeeId);
        const reportingPositionId =
          positionByEmployeeId.get(reportingEmployeeId);
        if (!reportingPositionId) continue;
        const existingReportingEmployeeId =
          reportingEmployeeByPositionId.get(positionId);
        if (
          existingReportingEmployeeId &&
          existingReportingEmployeeId !== reportingPositionId
        ) {
          throw new Error(
            `Position ${positionId} has multiple reporting positions (${existingReportingEmployeeId}, ${reportingPositionId}); resolve before migration.`,
          );
        }
        reportingEmployeeByPositionId.set(positionId, reportingPositionId);
      }
    }
    for (const [positionId, roleId] of roleByPositionId) {
      await positionsCollection.updateOne(
        { positionId: positionId },
        {
          $set: {
            roleId,
            ...(reportingEmployeeByPositionId.has(positionId)
              ? {
                  reportTo: reportingEmployeeByPositionId.get(positionId),
                }
              : {}),
          },
        },
      );
    }
    let employeeAssignments = 0;
    for (const [positionId, employeeId] of employeeByPositionId) {
      const result = await positionsCollection.updateOne(
        { positionId: positionId },
        { $set: { employeeId } },
      );
      employeeAssignments += result.modifiedCount;
    }
    const employeesWithOfflineAccess = await employeesCollection
      .find(
        { offlineAccessAllowed: { $type: 'bool' } },
        { projection: { employeeId: 1, offlineAccessAllowed: 1 } },
      )
      .toArray();
    let offlineAccessAssignments = 0;
    for (const employee of employeesWithOfflineAccess) {
      if (!employee.employeeId) continue;
      const result = await positionsCollection.updateOne(
        {
          employeeId: employee.employeeId,
          isDeleted: { $ne: true },
        },
        {
          $set: {
            offlineAccessAllowed: employee.offlineAccessAllowed === true,
          },
        },
      );
      offlineAccessAssignments += result.modifiedCount;
    }
    await positionsCollection.updateMany(
      { offlineAccessAllowed: { $exists: false } },
      { $set: { offlineAccessAllowed: false } },
    );
    await employeesCollection.updateMany(
      { offlineAccessAllowed: { $exists: true } },
      { $unset: { offlineAccessAllowed: '' } },
    );
    const legacyReportingPositions = await positionsCollection
      .find(
        { reportingEmployeeId: { $exists: true, $ne: '' } },
        { projection: { positionId: 1, reportingEmployeeId: 1 } },
      )
      .toArray();
    for (const position of legacyReportingPositions) {
      const reportTo = positionByEmployeeId.get(
        String(position.reportingEmployeeId),
      );
      await positionsCollection.updateOne(
        { positionId: position.positionId },
        {
          ...(reportTo ? { $set: { reportTo } } : {}),
          $unset: { reportingEmployeeId: '' },
        },
      );
    }
    const vans = await vansCollection
      .find(
        {
          $or: [
            { locationId: { $exists: true } },
            { associatedUsers: { $exists: true, $ne: [] } },
          ],
        },
        { projection: { vanId: 1, locationId: 1, associatedUsers: 1 } },
      )
      .toArray();

    let positionAssignments = 0;
    for (const van of vans) {
      const positionIds = new Set<string>();
      if (van.locationId) positionIds.add(String(van.locationId));

      const userIds = Array.isArray(van.associatedUsers)
        ? van.associatedUsers.map(String)
        : [];
      if (userIds.length) {
        const employeesForVan = await employeesCollection
          .find(
            {
              employeeId: { $in: userIds },
              $or: [
                { locationId: { $exists: true } },
                { positionId: { $exists: true } },
              ],
            },
            { projection: { locationId: 1, positionId: 1 } },
          )
          .toArray();
        employeesForVan.forEach((employee) => {
          const employeePositionId = employee.locationId || employee.positionId;
          if (employeePositionId) positionIds.add(String(employeePositionId));
        });
      }

      for (const positionId of positionIds) {
        const result = await positionsCollection.updateOne(
          { positionId: positionId },
          { $addToSet: { vanIds: van.vanId } },
        );
        positionAssignments += result.modifiedCount;
      }
    }

    const cleanedVans = await vansCollection.updateMany(
      {},
      { $unset: { locationId: '', associatedUsers: '' } },
    );
    const cleanedEmployees = await employeesCollection.updateMany(
      {},
      {
        $unset: {
          locationId: '',
          positionId: '',
          roleId: '',
          reportingEmployeeId: '',
        },
      },
    );

    console.info(
      `Position mapping migration completed: ${employeeAssignments} employee-to-position mapping(s), ${roleByPositionId.size} position role(s), ${positionAssignments} position van assignment(s), ${offlineAccessAssignments} offline-access setting(s) moved to positions, ${cleanedVans.modifiedCount} van(s) and ${cleanedEmployees.modifiedCount} employee(s) cleaned.`,
    );
  } finally {
    await connection.close();
  }
};

migratePositionMapping().catch((error: unknown) => {
  console.error(
    error instanceof Error
      ? error.message
      : 'Position mapping migration failed',
  );
  process.exitCode = 1;
});
