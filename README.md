# Beterano Data Catalog

Read-only catalog API for vehicles, taxonomy, services, parts, and media assets.

## Requirements

- Node.js 18+
- Postgres 14+

## Environment

Create `.env` based on `.env.example`:

```bash
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/beterano_data
PORT=4010
ASSETS_BASE_URL=http://localhost:4010/assets
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
- `GET /v1/vehicles/models?makeId=...`
- `GET /v1/vehicles/variants?modelId=...`
- `GET /v1/taxonomy/nodes?parentId=...&type=...`
- `GET /v1/services/operations?skill=...&q=...&limit=...&cursor=...`
- `GET /v1/parts/categories?system=...&q=...&limit=...&cursor=...`
- `GET /v1/media/assets?kind=...&q=...&limit=...&cursor=...`

Response contract:

- List: `{ items: [...], nextCursor: string | null }`
- Single: `{ item: {...} }` or 404 with `{ error: { message, status } }`

Pagination:

- `limit` (default 50, max 200)
- `cursor` (base64 cursor returned by previous response)

## Curl examples

```bash
curl http://localhost:4010/v1/health
curl "http://localhost:4010/v1/vehicles/makes?limit=10"
curl "http://localhost:4010/v1/vehicles/models?makeId=seat"
curl "http://localhost:4010/v1/vehicles/variants?modelId=ibiza"
curl "http://localhost:4010/v1/taxonomy/nodes?type=SERVICE"
curl "http://localhost:4010/v1/services/operations?skill=mechanics&q=oil&limit=10"
curl "http://localhost:4010/v1/parts/categories?system=parts&q=brake&limit=10"
curl "http://localhost:4010/v1/media/assets?kind=IMG&q=ibiza&limit=10"
```

## Static assets

Assets are served from `/assets`:

```bash
curl http://localhost:4010/assets/img/seat-ibiza.jpg
```
