var DEFAULT_PROVINCE_ID = 'PROV-85B722';
var ROLE_NAME = 'SALESMAN';
var DRY_RUN = false; // true = preview only

var role = db.roles.findOne({ name: new RegExp('^' + ROLE_NAME + '$', 'i'), status: 'ACTIVE', isDeleted: { $ne: true } });
var defaultProvince = db.province_master.findOne({ provinceId: DEFAULT_PROVINCE_ID, isDeleted: { $ne: true } });
if (!role || !defaultProvince) throw new Error('Role ' + ROLE_NAME + ' or province ' + DEFAULT_PROVINCE_ID + ' not found');

var mappedVanIds = db.position_master.distinct('vanIds', { isDeleted: { $ne: true } });
var vans = db.vans.find({ vanId: { $nin: mappedVanIds }, status: 'ACTIVE', isDeleted: { $ne: true } }).sort({ vanId: 1 }).toArray();
print('Vans without a position: ' + vans.length);

function titleCase(v) { return String(v || '').trim().replace(/\s+/g, ' ').toLowerCase().replace(/\b\w/g, function (c) { return c.toUpperCase(); }); }

function nextPositionId() {
  var latest = db.position_master.find({ positionId: /^P\d{5,}$/ }).sort({ positionId: -1 }).limit(1).toArray()[0];
  db.id_counters.updateOne({ _id: 'positionId' }, { $max: { sequence: latest ? Number(latest.positionId.slice(1)) : 0 } }, { upsert: true });
  var c = db.id_counters.findOneAndUpdate({ _id: 'positionId' }, { $inc: { sequence: 1 } }, { returnNewDocument: true, returnDocument: 'after' });
  if (c && c.value) c = c.value;
  var s = String(c.sequence); while (s.length < 5) s = '0' + s;
  return 'P' + s;
}

var created = 0, defaulted = 0, skipped = 0;
vans.forEach(function (van) {
  var province = van.provinceId ? db.province_master.findOne({ provinceId: van.provinceId, isDeleted: { $ne: true } }) : null;
  if (!province) {
    // Province missing or not in province_master: use the default for both van and position.
    province = defaultProvince;
    defaulted++;
    if (!DRY_RUN) db.vans.updateOne({ vanId: van.vanId }, { $set: { provinceId: DEFAULT_PROVINCE_ID, updatedAt: new Date() } });
  }
  var name = titleCase(van.name || van.vanNumber || van.vanId);
  if (db.position_master.findOne({ name: name })) name = titleCase(name + ' ' + (van.vanNumber || van.vanId));
  if (db.position_master.findOne({ name: name })) { print('SKIP ' + van.vanId + ': name exists (' + name + ')'); skipped++; return; }
  if (DRY_RUN) { print('DRY ' + van.vanId + ' -> "' + name + '" province=' + province.provinceId); created++; return; }
  var now = new Date();
  var positionId = nextPositionId();
  db.position_master.insertOne({ positionId: positionId, name: name, parentCategoryId: van.categoryIds || [], countryId: province.countryId, provinceId: province.provinceId, roleId: role.roleId, hierarchyDepth: 1, hierarchyPath: [], vanIds: [van.vanId], offlineAccessAllowed: false, status: 'ACTIVE', isDeleted: false, createdAt: now, updatedAt: now });
  print('OK ' + van.vanId + ' -> ' + positionId + ' "' + name + '" province=' + province.provinceId);
  created++;
});
print((DRY_RUN ? 'Would create ' : 'Created ') + created + ', default province: ' + defaulted + ', skipped: ' + skipped);
