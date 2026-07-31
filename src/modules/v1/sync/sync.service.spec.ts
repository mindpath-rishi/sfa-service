import { SyncService } from './sync.service';

describe('SyncService', () => {
  const insertOne = jest.fn();
  const findOne = jest.fn();
  const updateOne = jest.fn();
  const toArray = jest.fn();
  const collection = {
    insertOne,
    findOne,
    updateOne,
    find: jest.fn(() => ({ sort: () => ({ limit: () => ({ toArray }) }) })),
  };
  const connection = { collection: jest.fn(() => collection) };
  const service = new SyncService(connection as never);

  beforeEach(() => jest.clearAllMocks());

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

    expect(insertOne).toHaveBeenCalledWith(
      expect.objectContaining({
        uuid: 'local-1',
        ownerId: 'salesman-1',
        version: 1,
        employeeId: 'salesman-1',
        date: new Date('2026-06-30T04:00:00.000Z'),
        status: 'COMPLETED',
      }),
    );
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

    expect(insertOne).not.toHaveBeenCalled();
    expect(result.results[0]).toEqual(
      expect.objectContaining({ success: true, version: 2 }),
    );
  });

  it('rejects stale updates instead of overwriting server data', async () => {
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

    expect(updateOne).not.toHaveBeenCalled();
    expect(result.results[0]).toEqual(
      expect.objectContaining({
        success: false,
        conflict: true,
        error: 'VERSION_CONFLICT',
      }),
    );
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
