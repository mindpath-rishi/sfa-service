import { RequestContextStore } from 'src/core/context/request-context';
import { LiveLocationService } from './live-location.service';

describe('LiveLocationService – stationary ping & device contact', () => {
  let service: LiveLocationService;
  let pointsAdd: jest.Mock;
  let deviceUpdate: jest.Mock;
  let broadcasts: unknown[];

  beforeEach(() => {
    pointsAdd = jest.fn().mockResolvedValue(true);
    deviceUpdate = jest.fn().mockResolvedValue({});
    broadcasts = [];
    const models: Record<string, unknown> = {
      WorkSession: { exists: jest.fn().mockResolvedValue({ _id: 'ws' }) },
      DeviceStatus: { updateOne: deviceUpdate },
    };
    const mongo = { getModel: (name: string) => models[name] };
    const settings = { forUser: () => ({ maxAccuracyM: 50 }) };
    service = new LiveLocationService(
      mongo as never,
      { add: pointsAdd } as never,
      settings as never,
    );
    service.setRealtimeListener((u) => broadcasts.push(u));
  });

  const track = (body: Record<string, unknown>) =>
    RequestContextStore.run({ userId: 'EMP-1' } as never, () =>
      service.track(body as never),
    );

  const location = (capturedAt = new Date()) => ({
    latitude: 12,
    longitude: 77,
    accuracy: 10,
    capturedAt: capturedAt.toISOString(),
  });

  it('a ping is broadcast and marks the user online, but is not stored', async () => {
    await track({ workSessionId: 'WS1', source: 'NATIVE_BACKGROUND', ping: true, location: location() });
    await new Promise((r) => setImmediate(r));

    expect(pointsAdd).not.toHaveBeenCalled();
    expect(broadcasts).toHaveLength(1);
    expect(deviceUpdate).toHaveBeenCalledWith(
      { userId: 'EMP-1' },
      { $set: expect.objectContaining({ lastLocationAt: expect.any(Date) }) },
      { upsert: true },
    );
  });

  it('a normal point is stored and records battery', async () => {
    await track({
      workSessionId: 'WS1',
      location: location(),
      batteryLevel: 63.4,
      isCharging: true,
    });
    await new Promise((r) => setImmediate(r));

    expect(pointsAdd).toHaveBeenCalledTimes(1);
    expect(deviceUpdate).toHaveBeenCalledWith(
      { userId: 'EMP-1' },
      {
        $set: expect.objectContaining({ batteryLevel: 63, isCharging: true }),
      },
      { upsert: true },
    );
  });

  it('ignores battery / online from old queued points', async () => {
    const old = new Date(Date.now() - 30 * 60_000);
    await track({ workSessionId: 'WS1', location: location(old), batteryLevel: 10 });
    await new Promise((r) => setImmediate(r));

    expect(pointsAdd).toHaveBeenCalledTimes(1); // still stored for the route
    expect(deviceUpdate).not.toHaveBeenCalled();
  });

  it('writes device contact at most once a minute while nothing changes', async () => {
    await service.recordDeviceContact('EMP-1', { batteryLevel: 50 });
    await service.recordDeviceContact('EMP-1', { batteryLevel: 50 });
    expect(deviceUpdate).toHaveBeenCalledTimes(1);
    await service.recordDeviceContact('EMP-1', { batteryLevel: 49 });
    expect(deviceUpdate).toHaveBeenCalledTimes(2);
  });
});
