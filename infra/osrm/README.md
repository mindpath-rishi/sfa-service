# Own road matching (OSRM)

Day routes in the portal are matched to real roads by OSRM running next to the
backend (service `osrm` in `docker-compose.yml`), using OpenStreetMap roads.
No tracking data is sent to Google; there is no per-request cost.

1. Prepare road data once (from the `sfa-service` folder):
   `./infra/osrm/setup.sh africa/zambia`
   (your region path from https://download.geofabrik.de; several countries:
   use a larger region such as `africa`).
2. `docker compose restart osrm` (or start the stack as usual).
3. The backend uses `OSRM_URL=http://osrm:5000` (set in docker-compose.yml).
4. Check from the server:
   `docker compose exec backend wget -qO- "http://osrm:5000/match/v1/driving/28.28,-15.41;28.29,-15.42"`

Resources: one country needs roughly 1–2 GB RAM and a few GB disk.
Refresh roads monthly: re-run `setup.sh`, then `docker compose restart osrm`.
Without data the container just waits and day routes show the cleaned GPS
path. Road matching can also be switched off in the portal
(Live Tracking → Settings).
