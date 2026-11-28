import { RoadSnapService } from './road-snap.service';

/**
 * OSRM fake: "matches" every coordinate onto a road ~100 m north of it,
 * which is what used to move a user standing inside a building onto the road.
 */
const ROAD_OFFSET_LAT = 0.0009; // ~100 m

describe('RoadSnapService – stays keep their real position', () => {
  const originalFetch = global.fetch;
  const originalUrl = process.env.OSRM_URL;
  let service: RoadSnapService;
  let calls: string[];

  beforeEach(() => {
    process.env.OSRM_URL = 'http://osrm.test';
    calls = [];
    global.fetch = jest.fn((url: string) => {
      calls.push(url);
      const coords = url
        .split('/driving/')[1]
        .split('?')[0]
        .split(';')
        .map((pair) => pair.split(',').map(Number));
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            code: 'Ok',
            matchings: [
              {
                geometry: {
                  coordinates: coords.map(([lng, lat]) => [lng, lat + ROAD_OFFSET_LAT]),
                },
              },
            ],
          }),
      });
    }) as unknown as typeof fetch;

    const cache = {
      findOne: jest.fn().mockResolvedValue(null),
      updateOne: jest.fn().mockResolvedValue({}),
      createIndex: jest.fn().mockResolvedValue('ok'),
    };
    const mongo = { getDb: () => ({ collection: () => cache }) };
    const settings = { current: { roadSnapEnabled: true } };
    service = new RoadSnapService(mongo as never, settings as never);
  });

  afterEach(() => {
    global.fetch = originalFetch;
    process.env.OSRM_URL = originalUrl;
  });

  const at = (min: number) => new Date(Date.UTC(2026, 10, 28, 8, min));

  it('draws a 10-minute stay exactly where the user was, not on the road', async () => {
    const shop = { latitude: 12.0, longitude: 77.0 };
    const points = [
      { latitude: 11.99, longitude: 77.0, capturedAt: at(0) }, // ~1.1 km south, driving
      { latitude: 11.995, longitude: 77.0, capturedAt: at(2) },
      { ...shop, capturedAt: at(4) },
      { latitude: 12.00005, longitude: 77.0, capturedAt: at(9) }, // drift inside the shop
      { ...shop, capturedAt: at(14) },
    ];

    const { path, snapped } = await service.snap('s1', points, true);

    expect(snapped).toBe(true);
    // The stay point is in the path at its real (unsnapped) position, and it is the end
    expect(path[path.length - 1]).toEqual([12.0, 77.0]);
    // Only the drive was sent to OSRM; the stay was not road-matched on its own
    expect(calls).toHaveLength(1);
  });

  it('still road-matches a drive with no stay', async () => {
    const points = [
      { latitude: 11.99, longitude: 77.0, capturedAt: at(0) },
      { latitude: 11.995, longitude: 77.0, capturedAt: at(1) },
      { latitude: 12.0, longitude: 77.0, capturedAt: at(2) },
    ];
    const { path } = await service.snap('s2', points, true);
    expect(path[path.length - 1][0]).toBeCloseTo(12.0 + ROAD_OFFSET_LAT, 5);
  });
});
