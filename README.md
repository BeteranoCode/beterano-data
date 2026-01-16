# Beterano Data Catalog

Fixed catalog service for vehicles, taxonomy, services, parts, and media assets. Runs Postgres + Prisma + seed + read-only Express API.

## Structure

- `prisma/schema.prisma` database schema
- `prisma/seed.ts` seed script (idempotent)
- `src/server.ts` Express API
- `src/routes/*` read-only endpoints
- `assets/` static files served at `/assets`
- `datasets/` source files used by seed

## Requirements

- Node.js 18+
- Postgres 14+

## Postgres setup (example)

Use your own Postgres instance or run one locally. Example with Docker:

```bash
docker run --name beterano-postgres -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=beterano_data -p 5432:5432 -d postgres:16
```

## Environment

Create `.env` based on `.env.example`:

```bash
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/beterano_data
PORT=3000
ASSETS_BASE_URL=http://localhost:3000/assets
```

## Install

```bash
npm install
```

## Prisma

```bash
npm run prisma:generate
npm run prisma:migrate
npm run prisma:seed
```

## Run

```bash
npm run dev
```

## Endpoints

- `GET /v1/health`
- `GET /v1/vehicles/makes`
- `GET /v1/vehicles/models?makeKey=...`
- `GET /v1/vehicles/variants?modelKey=...`
- `GET /v1/taxonomy?rootKey=...`
- `GET /v1/services/operations?skillKey=...&taxonomyKey=...`
- `GET /v1/parts/categories?taxonomyKey=...`
- `GET /v1/media?type=IMG|GLB&taxonomyKey=...&vehicleModelKey=...`

Pagination: `limit` and `offset` on list endpoints.

## Curl examples

```bash
curl http://localhost:3000/v1/health
curl "http://localhost:3000/v1/vehicles/makes?limit=10"
curl "http://localhost:3000/v1/vehicles/models?makeKey=seat"
curl "http://localhost:3000/v1/vehicles/variants?modelKey=ibiza"
curl "http://localhost:3000/v1/taxonomy?rootKey=mechanics"
curl "http://localhost:3000/v1/services/operations?skillKey=mechanics"
curl "http://localhost:3000/v1/parts/categories?taxonomyKey=brake-system"
curl "http://localhost:3000/v1/media?type=IMG&vehicleModelKey=ibiza"
```
