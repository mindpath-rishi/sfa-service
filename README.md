Below is a clean, professional, production-ready README.md tailored to your actual project setup
(NestJS + Node 22 + Docker + Mongo Replica Set + Prometheus + Grafana).

This is not boilerplate — it reflects everything we fixed and implemented.

You can copy–paste this directly as README.md.

🚀 Anavilam Service – Backend API

An enterprise-grade backend service built using NestJS, Node.js 22, MongoDB (Replica Set), Docker, and Observability tooling (Prometheus & Grafana).

🧱 Tech Stack

Node.js: v22.x

NestJS

MongoDB

Docker & Docker Compose

Prometheus (metrics scraping)

Grafana (monitoring dashboards)

nestjs-pino (structured logging)

✅ Node.js Requirement

This project requires Node.js v22.

Check version
node -v

Install via nvm (recommended)
nvm install 22
nvm use 22

📁 Project Structure (Key Parts)
src/
├── app.module.ts
├── main.ts
├── core/
│   ├── metrics/
│   │   ├── metrics.controller.ts
│   │   ├── metrics.middleware.ts
│   │   ├── metrics.module.ts
│   │   └── metrics.service.ts
│   ├── logger/
│   └── config/
├── modules/
│   ├── auth/
│   └── health/
docker-compose.yml
docker-compose.dev.yml
docker-compose.prod.yml
Dockerfile
Dockerfile.dev

⚙️ Environment Configuration

All environment variables are injected via Docker Compose.

Example .env.development:

NODE_ENV=development
PORT=3000

MONGO_URI=mongodb://mongo1:27017,mongo2:27017,mongo3:27017/anavilam?replicaSet=rs0


⚠️ Never use localhost, 127.0.0.1, or container IPs for MongoDB inside Docker.

▶️ Run Locally (Without Docker)
npm install
npm run start:dev

🐳 Docker Setup
🔧 Development (hot reload)
sudo docker compose \
  -f docker-compose.yml \
  -f docker-compose.dev.yml \
  up --build

🔥 Development – Clean / Uncached Build (Recommended)

Use this when debugging routing, middleware, or module issues.

sudo docker compose \
  -f docker-compose.yml \
  -f docker-compose.dev.yml \
  build --no-cache

sudo docker compose \
  -f docker-compose.yml \
  -f docker-compose.dev.yml \
  up

🚀 Production
sudo docker compose \
  -f docker-compose.yml \
  -f docker-compose.prod.yml \
  up -d --build

🌍 Available Endpoints
Purpose	URL
API Base	http://localhost:3000/api/v1
Health Check	http://localhost:3000/api/v1/health
Metrics	http://localhost:3000/metrics
Swagger (dev only)	http://localhost:3000/api-docs
Prometheus UI	http://localhost:9090
Grafana UI	http://localhost:3001
📊 Metrics & Observability
Metrics Endpoint
curl http://localhost:3000/metrics

Prometheus

Scrapes: backend:3000/metrics

UI: http://localhost:9090

Grafana

UI: http://localhost:3001

Default login:

admin / admin

🧠 MongoDB (Replica Set)

MongoDB runs as three containers:

mongo1

mongo2

mongo3

All communication uses Docker service names, not host ports.

Example connection string:

MONGO_URI=mongodb://mongo1:27017,mongo2:27017,mongo3:27017/anavilam?replicaSet=rs0

🧪 Testing
# unit tests
npm run test

# e2e tests
npm run test:e2e

# coverage
npm run test:cov

🧹 Reset Docker Environment (If Needed)
sudo docker compose down -v
sudo docker builder prune -af
sudo docker image prune -af


Then rebuild:

sudo docker compose build --no-cache
sudo docker compose up

🔐 Security Notes

/metrics is public by design for Prometheus
(restrict by IP or network in production)

CORS is enabled with credentials

Helmet and compression are enabled globally

Graceful shutdown hooks are enabled

📜 License

MIT License

👨‍💻 Maintained By

Anavilam Engineering Team

✅ Summary

Node.js v22 required

Docker-first architecture

MongoDB replica set

Production-grade metrics & monitoring

Clean separation of dev & prod configs