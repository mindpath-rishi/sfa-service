import { SyncService } from './sync.service';

describe('SyncService', () => {
  const insertOne = jest.fn();
  const findOne = jest.fn();
  const updateOne = jest.fn();
  const toArray = jest.fn();
  // Waiting MIS decisions (offline_sync_resolutions) for the uploaded items.
  const resolutionRows = jest.fn().mockResolvedValue([]);
  const collection = {
    insertOne,
    findOne,
    updateOne,
    find: jest.fn(() => ({
      toArray: resolutionRows,
      sort: () => ({ limit: () => ({ toArray }) }),
    })),
  };
  const connection = { collection: jest.fn(() => collection) };
  const service = new SyncService(connection as never, { send: jest.fn(), sendToUser: jest.fn() } as never);

  beforeEach(() => {
    jest.clearAllMocks();
    resolutionRows.mockResolvedValue([]);
  });

  it('creates a transaction with its stable local UUID and owner', async () => {
    findOne.mockResolvedValue(null);
    insertOne.mockResolvedValue({ insertedId: 'server-1' });
    const result = await service.upload(
      [
        {
          queueId: 'q1',
          entity: 'orders',
          operation: 'CREATE',
          localId: 'local-1',
          payload: { total: 10, date: '2026-06-30T04:00:00.000Z' },
        },
      ],
      'salesman-1',
    );

    const saleInsert = insertOne.mock.calls.find(([doc]) => doc.uuid === 'local-1');
    expect(saleInsert?.[0]).toEqual(
      expect.objectContaining({
        uuid: 'local-1',
        version: 1,
        employeeId: 'salesman-1',
        date: new Date('2026-06-30T04:00:00.000Z'),
        status: 'COMPLETED',
      }),
    );
    // ownerId is a queue-only marker and is not stored on the record
    expect(saleInsert?.[0]).not.toHaveProperty('ownerId');
    expect(result.results[0]).toEqual(
      expect.objectContaining({ success: true, serverId: 'server-1' }),
    );
  });

  it('treats a repeated CREATE as idempotent', async () => {
    findOne.mockResolvedValue({ _id: 'server-1', version: 2 });
    const result = await service.upload(
      [
        {
          queueId: 'q1',
          entity: 'orders',
          operation: 'CREATE',
          localId: 'local-1',
          payload: {},
        },
      ],
      'salesman-1',
    );

    // Only the audit entry is written; no second sale record is created
    expect(insertOne.mock.calls.some(([doc]) => doc.uuid === 'local-1')).toBe(false);
    expect(result.results[0]).toEqual(
      expect.objectContaining({ success: true, version: 2 }),
    );
  });

  it('applies an older offline update and keeps the replaced server version in the audit log', async () => {
    findOne.mockResolvedValue({ _id: 'server-1', version: 4 });
    const result = await service.upload(
      [
        {
          queueId: 'q1',
          entity: 'orders',
          operation: 'UPDATE',
          localId: 'local-1',
          payload: { version: 2 },
        },
      ],
      'salesman-1',
    );

    // Offline data wins: the record is updated to the next server version
    expect(updateOne).toHaveBeenCalledWith(
      { _id: 'server-1' },
      expect.objectContaining({
        $set: expect.objectContaining({ version: 5, lastSyncSource: 'OFFLINE' }),
      }),
    );
    // Nothing is lost: the server version it replaced is recorded in the audit log
    const audit = insertOne.mock.calls.find(([doc]) => doc.auditId);
    expect(audit?.[0]).toEqual(
      expect.objectContaining({ before: expect.objectContaining({ version: 4 }) }),
    );
    expect(result.results[0]).toEqual(
      expect.objectContaining({ success: true, conflictResolved: true, version: 5 }),
    );
  });

  it('rejects an older offline DELETE instead of deleting newer server data', async () => {
    findOne.mockResolvedValue({ _id: 'server-1', version: 4 });
    const result = await service.upload(
      [
        {
          queueId: 'q1',
          entity: 'orders',
          operation: 'DELETE',
          localId: 'local-1',
          payload: { version: 2 },
        },
      ],
      'salesman-1',
    );

    // The newer server record is not soft-deleted
    expect(
      updateOne.mock.calls.some(
        ([filter, update]) => filter._id === 'server-1' && update?.$set?.isDeleted === true,
      ),
    ).toBe(false);
    expect(result.results[0]).toEqual(
      expect.objectContaining({ success: false, conflict: true, error: 'VERSION_CONFLICT' }),
    );
  });

  it("applies the salesman's DELETE when a Super Admin chose it in MIS", async () => {
    findOne.mockResolvedValue({ _id: 'server-1', version: 4 });
    resolutionRows.mockResolvedValue([
      { _id: 'res-1', resolutionId: 'SRES1', queueId: 'q1', localId: 'local-1', action: 'APPLY_CLIENT' },
    ]);

    const result = await service.upload(
      [{ queueId: 'q1', entity: 'orders', operation: 'DELETE', localId: 'local-1', payload: { version: 2 } }],
      'salesman-1',
    );

    expect(
      updateOne.mock.calls.some(
        ([filter, update]) => filter._id === 'server-1' && update?.$set?.isDeleted === true,
      ),
    ).toBe(true);
    expect(result.results[0]).toEqual(expect.objectContaining({ success: true, version: 5 }));
    // The decision is marked as applied
    expect(updateOne).toHaveBeenCalledWith(
      { _id: 'res-1' },
      { $set: expect.objectContaining({ status: 'APPLIED' }) },
    );
  });

  it('acknowledges a discarded change without touching the server data', async () => {
    findOne.mockResolvedValue({ _id: 'server-1', version: 4 });
    resolutionRows.mockResolvedValue([
      { _id: 'res-2', resolutionId: 'SRES2', queueId: 'q1', localId: 'local-1', action: 'DISCARD' },
    ]);

    const result = await service.upload(
      [{ queueId: 'q1', entity: 'orders', operation: 'DELETE', localId: 'local-1', payload: { version: 2 } }],
      'salesman-1',
    );

    // Only updatedAt is bumped so the next download restores the server copy
    expect(
      updateOne.mock.calls.some(([, update]) => update?.$set?.isDeleted === true),
    ).toBe(false);
    expect(updateOne).toHaveBeenCalledWith(
      { _id: 'server-1' },
      { $set: { updatedAt: expect.any(Date) } },
    );
    expect(result.results[0]).toEqual(
      expect.objectContaining({ success: true, discarded: true, serverId: 'server-1', version: 4 }),
    );
    expect(updateOne).toHaveBeenCalledWith(
      { _id: 'res-2' },
      { $set: expect.objectContaining({ status: 'APPLIED' }) },
    );
  });

  it('keeps syncing when the decision lookup fails', async () => {
    resolutionRows.mockRejectedValue(new Error('db down'));
    findOne.mockResolvedValue(null);
    insertOne.mockResolvedValue({ insertedId: 'server-1' });

    const result = await service.upload(
      [{ queueId: 'q1', entity: 'orders', operation: 'CREATE', localId: 'local-1', payload: { total: 1 } }],
      'salesman-1',
    );
    expect(result.results[0]).toEqual(expect.objectContaining({ success: true }));
  });

  it('recovers an orphaned attendance update as a synced work session', async () => {
    findOne.mockResolvedValue(null);
    insertOne.mockResolvedValue({ insertedId: 'server-work-1' });

    const result = await service.upload(
      [
        {
          queueId: 'q-work',
          entity: 'attendance',
          operation: 'UPDATE',
          localId: 'WORK-94713BED',
          payload: {
            status: 'COMPLETED',
            dayStartTime: '2026-06-30T04:00:00.000Z',
            dayEndTime: '2026-06-30T12:00:00.000Z',
          },
        },
      ],
      'salesman-1',
    );

    expect(insertOne).toHaveBeenCalledWith(
      expect.objectContaining({
        workSessionId: 'WORK-94713BED',
        userId: 'salesman-1',
        status: 'COMPLETED',
      }),
    );
    expect(result.results[0]).toEqual(
      expect.objectContaining({ success: true, serverId: 'server-work-1' }),
    );
  });

  it('recovers an orphaned activity update as a synced activity', async () => {
    findOne.mockResolvedValue(null);
    insertOne.mockResolvedValue({ insertedId: 'server-activity-1' });

    const result = await service.upload(
      [
        {
          queueId: 'q-activity',
          entity: 'activities',
          operation: 'UPDATE',
          localId: 'ACTI-12345678',
          payload: {
            workSessionId: 'WORK-94713BED',
            name: 'Retailing',
            status: 'COMPLETED',
            startTime: '2026-06-30T04:00:00.000Z',
            endTime: '2026-06-30T05:00:00.000Z',
          },
        },
      ],
      'salesman-1',
    );

    expect(insertOne).toHaveBeenCalledWith(
      expect.objectContaining({
        activityId: 'ACTI-12345678',
        userId: 'salesman-1',
        status: 'COMPLETED',
      }),
    );
    expect(result.results[0]).toEqual(
      expect.objectContaining({ success: true, serverId: 'server-activity-1' }),
    );
  });

  it('prevents mobile clients from uploading master data', async () => {
    const result = await service.upload(
      [
        {
          queueId: 'q1',
          entity: 'products',
          operation: 'CREATE',
          localId: 'local-1',
          payload: {},
        },
      ],
      'salesman-1',
    );
    expect(result.results[0]).toEqual(
      expect.objectContaining({
        success: false,
        error: 'Master data is read-only',
      }),
    );
  });
});
