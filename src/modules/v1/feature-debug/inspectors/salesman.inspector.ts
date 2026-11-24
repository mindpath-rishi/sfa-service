import type { Db } from 'mongodb';
import { APP_LOGS_COLLECTION } from 'src/core/logger/log-sink';
import type { DebugCheck, DebugFinding, DebugReport, FeatureInspector } from '../feature-debug.types';
import { check, clean, logsSection, offerRepair, phoneCheck, startOfDay } from './shared';
import { repair } from '../repairs';

const findEmployee = (db: Db, id: string) =>
  db.collection('employees').findOne({ $or: [{ employeeId: id }, { manNumber: id }, { mobile: id }] });

/** Why can't this salesman log in / see their van / get notifications? */
export const salesmanInspector: FeatureInspector = {
  key: 'salesman',
  label: 'Salesman & device',
  description: 'Account, login, position, van assignment, devices and open work',
  idLabel: 'Employee ID, MAN number or mobile',
  idPlaceholder: 'EID24343401',

  async inspect(db: Db, { id }): Promise<DebugReport> {
    const employee = await findEmployee(db, id);
    const employeeId = String(employee?.employeeId ?? id);
    const [user, position, devices, activeDays, openArrivals, lastLocation, serverErrors] = await Promise.all([
      db.collection('users').findOne({ profileId: employeeId }, { projection: { password: 0 } }),
      db.collection('position_master').findOne({ employeeId, isDeleted: { $ne: true } }, { sort: { updatedAt: -1 } }),
      db.collection('user_devices').find({ userId: employeeId }).sort({ lastLoginAt: -1 }).limit(10).toArray(),
      db.collection('work_sessions').find({ userId: employeeId, status: { $ne: 'COMPLETED' }, isDeleted: { $ne: true } }).toArray(),
      db.collection('interaction_logs').find({ employeeId, status: 'ARRIVED' }).toArray(),
      db.collection('live_location_points').findOne({ 'm.userId': employeeId }, { sort: { t: -1 }, projection: { t: 1 } }),
      db.collection(APP_LOGS_COLLECTION).countDocuments({ userId: employeeId, statusCode: { $gte: 500 }, time: { $gte: new Date(Date.now() - 24 * 36e5) } }).catch(() => 0),
    ]);

    const checks: DebugCheck[] = [];
    if (!employee) {
      checks.push(check('Employee', 'FAIL', `No employee with ID, MAN number or mobile "${id}"`));
      return { feature: 'salesman', id, found: false, title: `Salesman ${id} not found`, checks, sections: [], links: { logs: { userId: id } } };
    }

    checks.push(employee.status === 'ACTIVE' ? check('Employee', 'PASS', `${employee.name} is ACTIVE`) : check('Employee', 'FAIL', `Employee status is ${employee.status}`, 'Inactive employees cannot log in or sync.'));
    checks.push(
      !user
        ? check('Login account', 'FAIL', 'No login account for this employee', 'Create a login in MIS → Employees.')
        : user.status !== 'ACTIVE'
          ? check('Login account', 'FAIL', `Login "${user.loginId}" is ${user.status}`)
          : check('Login account', 'PASS', `Login "${user.loginId}", last login ${user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString() : 'never'}`),
    );

    if (!position) {
      checks.push(check('Position', 'FAIL', 'Not assigned to any position', 'Without a position the salesman has no role, van or reporting line.'));
    } else {
      checks.push(check('Position', position.status === 'ACTIVE' ? 'PASS' : 'FAIL', `${position.name ?? position.positionId} (${position.roleId}), ${position.status}`));
      const vans: string[] = position.vanIds ?? [];
      checks.push(
        vans.length === 1
          ? check('Van', 'PASS', `Assigned van ${vans[0]}`, undefined, { feature: 'van-stock', id: vans[0] })
          : vans.length
            ? check('Van', String(position.roleId).toUpperCase().includes('SALES') ? 'WARN' : 'INFO', `${vans.length} vans on this position`)
            : check('Van', String(position.roleId).toUpperCase().includes('SALES') ? 'FAIL' : 'INFO', 'No van on this position', 'A salesman needs exactly one van to start a day.'),
      );
      checks.push(check('Offline access', 'INFO', position.offlineAccessAllowed ? 'Enabled: the app can work and sync offline' : 'Disabled: the app works online only'));
    }

    const activeDevices = devices.filter((device) => device.isActive);
    checks.push(
      activeDevices.length
        ? check('Devices', 'PASS', `${activeDevices.length} signed-in device(s); last ${activeDevices[0].deviceType ?? ''} ${activeDevices[0].os ?? ''} at ${new Date(activeDevices[0].lastLoginAt ?? activeDevices[0].updatedAt).toLocaleString()}`)
        : check('Devices', 'WARN', 'No signed-in device', 'The salesman is logged out everywhere.'),
    );
    checks.push(
      activeDevices.some((device) => device.fcmToken)
        ? check('Push notifications', 'PASS', 'At least one device can receive notifications')
        : check('Push notifications', 'WARN', 'No device has a push token', 'Approvals and alerts will not reach the phone. Reopen the app with notifications allowed.'),
    );

    if (activeDays.length > 1) {
      checks.push(check('Open days', 'FAIL', `${activeDays.length} work sessions are open at once`, 'End the older ones.', { feature: 'day', id: String(activeDays[0].workSessionId) }));
    } else if (activeDays.length === 1) {
      const started = new Date(activeDays[0].dayStartTime);
      const stale = started < startOfDay();
      checks.push(check('Open day', stale ? 'FAIL' : 'PASS', `${activeDays[0].workSessionId} started ${started.toLocaleString()}`, stale ? 'The day was never ended.' : undefined, { feature: 'day', id: String(activeDays[0].workSessionId) }));
    } else {
      checks.push(check('Open day', 'INFO', 'No day in progress'));
    }

    if (openArrivals.length > 1) {
      checks.push(check('Shop arrivals', 'FAIL', `${openArrivals.length} arrivals are open at once`, 'Only one shop can be in progress; the app may be stuck on a visit.'));
    }

    checks.push(
      lastLocation?.t
        ? check('Last location', 'INFO', `Last location update ${new Date(lastLocation.t).toLocaleString()}`)
        : check('Last location', 'INFO', 'No location recorded'),
    );
    if (serverErrors) {
      checks.push(check('Server errors', 'WARN', `${serverErrors} server error(s) for this user in the last 24 hours`, 'Open the logs below or in System Logs.'));
    }
    checks.push(check('Data sync', 'INFO', 'See the Data sync inspector for uploads, downloads and stuck items', undefined, { feature: 'sync', id: employeeId }));
    const phone = await phoneCheck(db, employeeId);
    checks.push(phone.check);

    if (activeDays.length) offerRepair(checks, activeDays.length > 1 ? 'Open days' : 'Open day', repair('END_DAY', String(activeDays[activeDays.length - 1].workSessionId)), ['FAIL']);
    offerRepair(checks, 'Shop arrivals', repair('CLOSE_ARRIVALS', employeeId), ['FAIL']);

    return {
      feature: 'salesman',
      id: employeeId,
      found: true,
      title: `${employee.name} (${employeeId})`,
      subtitle: [employee.mobile, position?.name, position?.roleId].filter(Boolean).join(' · '),
      checks,
      sections: [
        { key: 'employee', title: 'Employee', kind: 'record', record: clean(employee) },
        { key: 'position', title: 'Position', kind: 'record', record: position ? clean({ ...position, vanIds: (position.vanIds ?? []).slice(0, 20) }) : null },
        { key: 'devices', title: 'Devices', kind: 'table', columns: ['deviceType', 'os', 'deviceId', 'isActive', 'lastLoginAt', 'fcmToken'], rows: devices.map((device) => clean({ ...device, fcmToken: device.fcmToken ? 'yes' : 'no' })) as any },
        { key: 'open-days', title: 'Open work sessions', kind: 'table', columns: ['workSessionId', 'vanId', 'dayStartTime', 'status'], rows: activeDays.map(clean) as any, linkColumn: { column: 'workSessionId', feature: 'day' } },
        await logsSection(db, { userId: employeeId, from: new Date(Date.now() - 24 * 36e5) }),
      ],
      links: { logs: { userId: employeeId }, syncOwnerId: employeeId },
      tools: [
        repair('REQUEST_DIAGNOSTICS', employeeId),
        repair('FORCE_RESYNC', employeeId),
        repair('DEBUG_LOGGING', employeeId),
        repair('LOGOUT_DEVICES', employeeId),
      ],
    };
  },

  async scan(db: Db): Promise<DebugFinding[]> {
    const findings: DebugFinding[] = [];

    const multiDays = await db.collection('work_sessions').aggregate([
      { $match: { status: { $ne: 'COMPLETED' }, isDeleted: { $ne: true } } },
      { $group: { _id: '$userId', count: { $sum: 1 }, name: { $first: '$userName' } } },
      { $match: { count: { $gt: 1 } } },
      { $limit: 100 },
    ]).toArray();
    for (const row of multiDays) {
      findings.push({ severity: 'FAIL', problem: 'Several open days', detail: `${row.name ?? row._id} has ${row.count} open work sessions`, target: { feature: 'salesman', id: row._id } });
    }

    const multiArrivals = await db.collection('interaction_logs').aggregate([
      { $match: { status: 'ARRIVED' } },
      { $group: { _id: '$employeeId', count: { $sum: 1 } } },
      { $match: { count: { $gt: 1 } } },
      { $limit: 100 },
    ]).toArray();
    for (const row of multiArrivals) {
      findings.push({ severity: 'FAIL', problem: 'Several open shop arrivals', detail: `${row._id} has ${row.count} arrivals in progress`, target: { feature: 'salesman', id: row._id } });
    }

    const erroring = await db.collection(APP_LOGS_COLLECTION).aggregate([
      { $match: { statusCode: { $gte: 500 }, userId: { $exists: true }, time: { $gte: new Date(Date.now() - 24 * 36e5) } } },
      { $group: { _id: '$userId', count: { $sum: 1 }, last: { $max: '$time' }, sample: { $last: '$errorMessage' } } },
      { $sort: { count: -1 } },
      { $limit: 50 },
    ]).toArray().catch(() => []);
    for (const row of erroring) {
      findings.push({ severity: 'WARN', problem: 'Server errors for user', detail: `${row.count} error(s) in 24h, e.g. ${row.sample ?? 'unknown'}`, time: row.last, target: { feature: 'salesman', id: row._id } });
    }

    return findings;
  },
};
