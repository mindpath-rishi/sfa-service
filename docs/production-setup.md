# Production setup

How to deploy and run SFA in production: the API, the monitoring stack, the
developer tools in MIS, and the mobile app version controls.

- [1. What runs where](#1-what-runs-where)
- [2. Before the first deploy](#2-before-the-first-deploy)
- [3. Configuration](#3-configuration)
- [4. Deploy](#4-deploy)
- [5. After every deploy: checklist](#5-after-every-deploy-checklist)
- [6. Monitoring stack](#6-monitoring-stack)
- [7. Developer tools in MIS](#7-developer-tools-in-mis)
- [8. Releasing a new mobile app version](#8-releasing-a-new-mobile-app-version)
- [9. Runbook: what to do when…](#9-runbook-what-to-do-when)
- [10. Data the tools store](#10-data-the-tools-store)
- [11. Security notes](#11-security-notes)

---

## 1. What runs where

| Service | Port | Purpose | Public? |
|---|---|---|---|
| `backend` (NestJS) | 3000 | API for MIS and the app; `/metrics` for Prometheus | API yes, `/metrics` no |
| `redis` | 6379 | Login sessions, scheduler locks | **No** |
| `prometheus` | 9090 | Collects metrics, evaluates alert rules | **No** |
| `grafana` | 3001 | Dashboards (`SFA Overview` is set up automatically) | Only behind login/VPN |
| `node-exporter` | 9100 (internal) | Host CPU, memory, disk | No |
| `redis-exporter` | 9121 (internal) | Redis metrics | No |
| MongoDB (replica set) | 27017 | Main database (outside this compose file) | **No** |
| Oracle | — | ERP, only when `ORACLE_ENABLED=true` | — |
| MIS (Next.js) | — | Back office, deployed separately (see `mis/`) | Yes |

Only the API (and MIS) should be reachable from the internet. Keep Redis,
MongoDB, Prometheus and the exporters on the private network, and put Grafana
behind a VPN or a reverse proxy with its own login.

---

## 2. Before the first deploy

1. **A Super Admin account exists.** The developer tools (System Logs,
   Monitoring, Feature Debugger, Offline Sync Issues, Devices & App) are
   visible only to the `SUPER_ADMIN` role. Run the seeder once with
   `SEED_PERMISSIONS=true` if the role does not exist yet.
2. **`firebase-admin.json`** is present in the backend's working directory
   (push notifications; the API does not start without it).
3. **MongoDB is a replica set** (transactions and the sync idempotency checks
   rely on it).
4. **Run the index migration once** (makes two uniqueness rules effective:
   one non-sale per visit, one open shop arrival per salesman). It refuses to
   change anything if existing data breaks the rules:

   ```bash
   npm run migrate:unique-visit-indexes            # report only
   npm run migrate:unique-visit-indexes -- --apply
   ```

   Production runs with Mongoose `autoIndex` off, so this is the only way these
   indexes get created there. The API creates its own collections' indexes
   (logs, alerts, diagnostics) on startup.

---

## 3. Configuration

All backend settings are in `.env.production` (see `.env.example` for the full
list). The ones that matter for production operations:

### Required

| Variable | Notes |
|---|---|
| `NODE_ENV=production` | Turns off Swagger, stack traces in responses and Mongoose auto-indexing |
| `MONGO_URI` | Replica set URI |
| `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD` | |
| `JWT_SECRET` | Long random value |
| `METRICS_TOKEN` | Random value; protects `/metrics` (see §6) |
| `GRAFANA_ADMIN_PASSWORD` | The production compose file refuses to start Grafana without it |

### ERP

| Variable | Notes |
|---|---|
| `ORACLE_ENABLED=true` | Off = ERP sync disabled (Monitoring shows Oracle as "Off") |
| `ORACLE_USER`, `ORACLE_PASSWORD`, `ORACLE_CONNECT_STRING`, `ORACLE_POOL_*` | |

### Logging

| Variable | Default | Notes |
|---|---|---|
| `LOG_LEVEL` | `info` | Console (stdout) level |
| `LOG_STORE_LEVEL` | `info` | Lowest level kept in MongoDB for MIS → System Logs. Debug can still be switched on per user from MIS |
| `LOG_RETENTION_DAYS` | `14` | Stored logs are deleted after this; changing it updates the TTL index on the next start |

### Monitoring and alerts

| Variable | Default | Notes |
|---|---|---|
| `MONITORING_SCHEDULER` | `true` | `false` stops the alert checks and nightly report on this instance |
| `ALERT_INTERVAL_MINUTES` | `15` | Minimum 5 |
| `RECONCILIATION_HOUR` | `2` | Server time |
| `ALERT_WEBHOOK_URL` | — | Slack, Google Chat or Teams incoming webhook; receives new alerts |
| `MIS_PUBLIC_URL` | — | Used for the link in webhook messages |
| `HEALTH_*` | see `.env.example` | Thresholds for "degraded" on the Health page |

Running several API instances is fine: a Redis lock makes each scheduled
alert check and nightly report run once.

### MIS

| Variable | Notes |
|---|---|
| `NEXT_PUBLIC_API_BASE_URL` | API base URL |
| `NEXT_PUBLIC_GRAFANA_URL` | Optional; adds an "Open Grafana" button to MIS → Monitoring |

---

## 4. Deploy

### With Docker Compose

```bash
cd sfa-service
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
docker compose logs -f backend
```

The image builds with `npm run build` and starts `node dist/main.js`.
`docker-compose.prod.yml` mounts `firebase-admin.json` and `uploads/` from the
host directory (neither is baked into the image). The container runs as a
non-root user, so `uploads/` must be writable by it:

```bash
mkdir -p uploads && sudo chown -R 100:101 uploads   # uid/gid of "app" in the image; check with: docker compose exec backend id
```

### Without Docker

```bash
cd sfa-service
npm ci
npm run build            # must exit 0
NODE_ENV=production node dist/main.js   # or under pm2/systemd
```

> **Changed in this release:** the build used to produce `dist/src/main.js`
> (because `scripts/` was compiled too) while every start command expects
> `dist/main.js`, and two type errors made `npm run build` fail. Both are
> fixed. If your server starts the API from `dist/src/main.js`, change it to
> `dist/main.js`.

---

## 5. After every deploy: checklist

1. API answers: `curl -I https://<api>/api/v1/product` → `401` (alive, needs login).
2. MIS → Developer Tools → **Monitoring → Health**: everything Healthy (or
   "Off" for Oracle if ERP is disabled).
3. Prometheus → Status → Targets: `sfa-backend`, `node`, `redis` are **UP**.
4. Grafana → Dashboards → SFA → **SFA Overview** shows data.
5. MIS → **System Logs → Live**: lines appear as you click around.
6. MIS → **Feature Debugger → Scan** (7 days): review anything new.

---

## 6. Monitoring stack

### Prometheus

- Config: `infra/prometheus/prometheus.yml`; alert rules: `infra/prometheus/alerts.yml`
  (API down, 5xx rate, slow requests, event loop lag, ERP backlog growing,
  offline changes stuck, disk almost full, memory, Redis down).
- Data is kept 30 days.
- **Metrics token.** With `METRICS_TOKEN` set, Prometheus must send it:

  ```bash
  echo -n "<same value as METRICS_TOKEN>" > infra/prometheus/metrics_token   # git-ignored
  ```

  then uncomment the `authorization` block under `sfa-backend` in
  `prometheus.yml`, mount the file into the container
  (`./infra/prometheus/metrics_token:/etc/prometheus/metrics_token:ro`) and
  restart Prometheus. Without it the target shows `401`.
- Prometheus has no Alertmanager here: its alerts appear in Prometheus and
  Grafana. Notifications to people come from the API's own alerting (below).

### Grafana

- Data source and the **SFA Overview** dashboard are provisioned from
  `infra/grafana/`; nothing to click.
- Rows: API (traffic, errors, latency, slowest routes), API process (event loop,
  memory, CPU, socket clients, log volume), Business & field (ERP backlog,
  stuck offline changes, open days, phones checked in, sync uploads, app
  errors, app versions), Host & Redis.
- Edits made in the UI are kept in Grafana's volume; to make a change
  permanent, export the dashboard JSON into `infra/grafana/dashboards/`.

### Metrics the API exports

Standard Node.js metrics plus `http_requests_total` / `http_request_duration_seconds`
(labelled by route pattern, e.g. `/api/v1/sale/:id`) and:

| Metric | Meaning |
|---|---|
| `sfa_erp_backlog{kind,status}` | Sales / top-up lines failed or pending for ERP |
| `sfa_sync_stuck_changes` | Offline changes whose latest upload failed |
| `sfa_open_work_sessions` | Days not ended |
| `sfa_open_alerts{severity}` | Active alerts |
| `sfa_phone_app_version{version}`, `sfa_phones_checked_in` | Phones in the last 24 h |
| `sfa_sync_operations_total{entity,result}` | Offline uploads (success / failed / conflict) |
| `sfa_mobile_errors_total{level}` | Errors reported by the app |
| `sfa_log_entries_total{level}` | Stored log lines |
| `sfa_repairs_total{action,result}` | Repairs run from MIS |
| `sfa_socket_clients{namespace}` | Live connections |

---

## 7. Developer tools in MIS

All under **Developer Tools**, Super Admin only (the menu is hidden and the
APIs return 403 for everyone else).

| Page | Use it to |
|---|---|
| **Monitoring** | Health of MongoDB, Redis, Oracle, the API process, disk, traffic, ERP backlog, offline sync and phones (refreshes every 15 s). **Alerts**: raised every 15 min from feature scans and health, resolved automatically when the problem is gone; new ones notify every Super Admin (MIS notification + push) and the webhook. **Nightly reports**: the trend of problems found each night. |
| **System Logs** | Overview of errors and failing flows; **Live** tail; **Search** by time, level, flow, status, user or request ID; **Download** as `.log` or `.ndjson`; **Trace** every line of one request. App-side errors appear here too, marked `[app]`. |
| **Feature Debugger** | **Scan** all features for known problems. **Inspect** one sale, day, salesman, van, top-up, payment or salesman's data sync, with checks, related records, history, offline attempts and logs. **Repair** buttons for the problems it can fix (each needs a reason and is recorded). **Phone data** shows exactly what a salesman's phone downloads. |
| **Offline Sync Issues** | Offline changes the server rejected. Choose "Apply salesman's change" (conflicts only) or "Keep server version / Discard on phone"; it applies on the phone's next sync, no app update needed. |
| **Devices & App** | Every phone's last check-in, app version, sync queue, permissions and storage. Set the minimum and latest app version. Per phone: get diagnostics (app log + sync queue), re-download data, log out, and switch on debug logging for an hour. |

### Repairs available

| Repair | What it does |
|---|---|
| End this day | Marks the work session completed, completes its route, closes open arrivals. No unload request is created. |
| Close open arrivals | Abandons shop arrivals stuck "in progress". |
| Reverse extra deduction | Undoes a duplicate stock deduction for a sale and puts the stock back (van stock and day stock). Safe to run twice. |
| Retry ERP sync | One sale, or all unsynced top-ups. |
| Re-download data on phone | Phone downloads everything again on next check-in; unsent changes are kept. |
| Get phone diagnostics | Phone sends its recent app log and sync queue. |
| Log out devices | Revokes sessions (effective within 15 minutes) and signs the app out on next check-in. |
| Debug logging (1 h) | Stores that user's debug-level server logs. |

The history is in `debug_repair_logs` and in the logs (`[RepairsService]`).

---

## 8. Releasing a new mobile app version

The app sends its version on every request and checks in every 5 minutes.

1. Publish the new version to the store and wait until it is available.
2. MIS → Devices & App → set **Latest version** to the new version. Older
   apps show an "Update available" banner but keep working.
3. Watch **Versions in use**. When most phones have updated, set **Minimum
   version** if the old one must stop (e.g. it has a sync bug).
4. Below the minimum, the app shows a blocking "Update required" screen and
   the API answers `426` — **except offline uploads, diagnostics, token
   refresh and logout, which always stay open**, so no sale is stranded on an
   old phone.

Builds released before this feature do not send a version: they count as
`0.0.0` once a minimum is set. They cannot show the update screen (they show
the server's message as an error), so set a minimum only after phones are on
the new build. To undo, clear the minimum version and save.

---

## 9. Runbook: what to do when…

| Symptom | Where to look | Typical fix |
|---|---|---|
| "The app is slow / failing" | Monitoring → Health (traffic, process), Grafana latency panels, System Logs → Overview | Find the failing flow, open a trace |
| A salesman says a sale didn't go through | Feature Debugger → Data sync (their ID), then Sales (sale ID) | Stuck item → Offline Sync Issues; duplicate deduction → Reverse |
| Sales not reaching ERP | Monitoring → Health → ERP backlog; Feature Debugger → Sales → ERP check | Fix the Oracle error shown, then Retry ERP sync |
| A phone stopped syncing | Devices & App (last check-in, queue, permissions) | Get diagnostics; re-download data |
| A salesman can't see an outlet/scheme/price | Feature Debugger → Phone data (their ID, search the name) | Missing there = route/assignment/master data problem, not the phone |
| Van stock looks wrong | Feature Debugger → Van stock and Day | Look for "deducted twice", unbalanced day stock, unaccepted top-ups |
| Can't start a new day | Feature Debugger → Salesman | End the stuck day |
| Need detailed logs for one user | Devices & App → Debug logging | Reproduce, then System Logs → Search by user |
| Disk filling up | Grafana → Disk free; Monitoring → Upload storage | Lower `LOG_RETENTION_DAYS`, clean `uploads/` |

---

## 10. Data the tools store

| Collection | Content | Kept |
|---|---|---|
| `app_logs` | Stored server and app logs | `LOG_RETENTION_DAYS` (14) |
| `ops_alerts` | Alerts | Resolved ones 90 days |
| `reconciliation_reports` | Nightly reports | Until deleted |
| `device_diagnostics` | Latest check-in per phone | Until deleted |
| `device_commands` | Commands sent to phones | Until deleted |
| `diagnostic_reports` | App logs + queue sent by phones | 30 days |
| `app_runtime_config` | Minimum / latest app version | — |
| `debug_log_users` | Users with debug logging on | Expires by time |
| `debug_repair_logs` | Repairs run (who, what, why) | Until deleted |
| `offline_sync_resolutions` | Decisions on sync issues | Until deleted |

---

## 11. Security notes

- Developer tools are Super Admin only; logs and diagnostics contain every
  user's activity. Keep the number of Super Admins small.
- Logs never contain passwords, tokens, cookies or keys (redacted), and
  diagnostic reports never include sync payloads.
- Set `METRICS_TOKEN`; never expose Prometheus, Redis or MongoDB publicly.
- Change Grafana's admin password (`GRAFANA_ADMIN_PASSWORD`) and disable
  sign-up (done in `docker-compose.prod.yml`).
