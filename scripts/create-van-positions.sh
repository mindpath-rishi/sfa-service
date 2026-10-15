#!/usr/bin/env bash
#
# Create a SALESMAN position for every active van that is not yet mapped to
# any position (position_master.vanIds). The position's province is the van's
# province when it exists in province_master, otherwise DEFAULT_PROVINCE_ID.
#
# Usage:
#   scripts/create-van-positions.sh              # apply
#   DRY_RUN=true scripts/create-van-positions.sh # preview only
#
# Env:
#   MONGO_URI            defaults to MONGO_URI from .env.$NODE_ENV / .env
#   DEFAULT_PROVINCE_ID  defaults to PROV-85B722
#   ROLE_NAME            role looked up by name, defaults to SALESMAN
#   ROLE_ID              overrides ROLE_NAME lookup
#   REPORT_TO            optional parent positionId for the new positions
#   MONGO_SHELL          defaults to mongosh, falls back to mongo

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
ENVIRONMENT="${NODE_ENV:-development}"

read_env() {
  local key="$1" file
  for file in "$ROOT_DIR/.env.$ENVIRONMENT" "$ROOT_DIR/.env"; do
    if [[ -f "$file" ]]; then
      local value
      value="$(grep -E "^${key}=" "$file" | tail -n1 | cut -d= -f2- | sed -e 's/^["'\'']//' -e 's/["'\'']$//')"
      if [[ -n "$value" ]]; then
        echo "$value"
        return
      fi
    fi
  done
}

MONGO_URI="${MONGO_URI:-$(read_env MONGO_URI)}"
DEFAULT_PROVINCE_ID="${DEFAULT_PROVINCE_ID:-PROV-85B722}"
ROLE_NAME="${ROLE_NAME:-SALESMAN}"
ROLE_ID="${ROLE_ID:-}"
REPORT_TO="${REPORT_TO:-}"
DRY_RUN="${DRY_RUN:-false}"

if [[ -z "$MONGO_URI" ]]; then
  echo "MONGO_URI is required" >&2
  exit 1
fi

if [[ -z "${MONGO_SHELL:-}" ]]; then
  if command -v mongosh >/dev/null 2>&1; then
    MONGO_SHELL=mongosh
  elif command -v mongo >/dev/null 2>&1; then
    MONGO_SHELL=mongo
  else
    echo "mongosh (or mongo) is required; set MONGO_SHELL to override" >&2
    exit 1
  fi
fi

echo "Environment      : $ENVIRONMENT"
echo "Default province : $DEFAULT_PROVINCE_ID"
echo "Role             : ${ROLE_ID:-$ROLE_NAME}"
echo "Dry run          : $DRY_RUN"

# Plain ES5 so it runs on both mongosh and the legacy mongo shell.
read -r -d '' SCRIPT <<'JS' || true
var notDeleted = { isDeleted: { $ne: true } };

function active(extra) {
  var filter = { status: 'ACTIVE', isDeleted: { $ne: true } };
  for (var key in extra) filter[key] = extra[key];
  return filter;
}

function titleCase(value) {
  return String(value || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, function (c) { return c.toUpperCase(); });
}

var role = ROLE_ID
  ? db.roles.findOne(active({ roleId: ROLE_ID }))
  : db.roles.findOne(active({ name: new RegExp('^' + ROLE_NAME + '$', 'i') }));
if (!role) throw new Error('Active role not found: ' + (ROLE_ID || ROLE_NAME));

var defaultProvince = db.province_master.findOne({
  provinceId: DEFAULT_PROVINCE_ID,
  isDeleted: { $ne: true },
});
if (!defaultProvince) {
  throw new Error('Default province not found: ' + DEFAULT_PROVINCE_ID);
}

if (REPORT_TO && !db.position_master.findOne(active({ positionId: REPORT_TO }))) {
  throw new Error('Active reporting position not found: ' + REPORT_TO);
}
var reportToPosition = REPORT_TO
  ? db.position_master.findOne({ positionId: REPORT_TO })
  : null;
var hierarchyPath = reportToPosition
  ? (reportToPosition.hierarchyPath || []).concat([REPORT_TO])
  : [];

var mappedVanIds = db.position_master.distinct('vanIds', notDeleted);
var vans = db.vans
  .find(active({ vanId: { $nin: mappedVanIds } }))
  .sort({ vanId: 1 })
  .toArray();

print('Vans without a position: ' + vans.length);

// Same scheme as src/modules/v1/position/position-id.util.ts
function nextPositionId() {
  var latest = db.position_master
    .find({ positionId: /^P\d{5,}$/ })
    .sort({ positionId: -1 })
    .limit(1)
    .toArray()[0];
  var latestSequence = latest ? Number(latest.positionId.slice(1)) : 0;
  db.id_counters.updateOne(
    { _id: 'positionId' },
    { $max: { sequence: latestSequence } },
    { upsert: true }
  );
  var counter = db.id_counters.findOneAndUpdate(
    { _id: 'positionId' },
    { $inc: { sequence: 1 } },
    { returnNewDocument: true, returnDocument: 'after' }
  );
  if (counter && counter.value) counter = counter.value;
  var pad = String(counter.sequence);
  while (pad.length < 5) pad = '0' + pad;
  return 'P' + pad;
}

var created = 0;
var skipped = 0;
var defaulted = 0;

vans.forEach(function (van) {
  var province = van.provinceId
    ? db.province_master.findOne({ provinceId: van.provinceId, isDeleted: { $ne: true } })
    : null;
  if (!province) {
    province = defaultProvince;
    defaulted++;
  }

  var name = titleCase(van.name || van.vanNumber || van.vanId);
  if (db.position_master.findOne({ name: name })) {
    name = titleCase(name + ' ' + (van.vanNumber || van.vanId));
  }
  if (db.position_master.findOne({ name: name })) {
    print('SKIP ' + van.vanId + ': position name already exists (' + name + ')');
    skipped++;
    return;
  }

  var now = new Date();
  var position = {
    name: name,
    parentCategoryId: van.categoryIds || [],
    countryId: province.countryId,
    provinceId: province.provinceId,
    roleId: role.roleId,
    hierarchyDepth: hierarchyPath.length + 1,
    hierarchyPath: hierarchyPath,
    vanIds: [van.vanId],
    offlineAccessAllowed: false,
    status: 'ACTIVE',
    isDeleted: false,
    createdAt: now,
    updatedAt: now,
  };
  if (REPORT_TO) position.reportTo = REPORT_TO;

  if (DRY_RUN) {
    print('DRY  ' + van.vanId + ' -> "' + name + '" province=' + province.provinceId);
    created++;
    return;
  }

  position.positionId = nextPositionId();
  db.position_master.insertOne(position);
  print('OK   ' + van.vanId + ' -> ' + position.positionId + ' "' + name + '" province=' + province.provinceId);
  created++;
});

// A non-sales parent holds the union of its children's vans.
if (!DRY_RUN && REPORT_TO && created) {
  var childVanIds = db.position_master
    .distinct('vanIds', active({ reportTo: REPORT_TO }))
    .filter(function (id) { return !!id; })
    .sort();
  db.position_master.updateOne(
    { positionId: REPORT_TO },
    { $set: { vanIds: childVanIds, updatedAt: new Date() } }
  );
}

print(
  (DRY_RUN ? 'Would create ' : 'Created ') + created + ' position(s), ' +
  defaulted + ' using default province, ' + skipped + ' skipped.'
);
JS

PARAMS="var DEFAULT_PROVINCE_ID = \"$DEFAULT_PROVINCE_ID\";
var ROLE_NAME = \"$ROLE_NAME\";
var ROLE_ID = \"$ROLE_ID\";
var REPORT_TO = \"$REPORT_TO\";
var DRY_RUN = $([[ "$DRY_RUN" == "true" ]] && echo true || echo false);"

# MONGO_SHELL is unquoted so e.g. "docker exec mongo1 mongo" works.
$MONGO_SHELL "$MONGO_URI" --quiet --eval "$PARAMS
$SCRIPT"
