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

## Parts catalog import (XLSX)

Place `biblioteca_piezas.xlsx` under `datasets/parts/` (sheet `00_DATA`).

```bash
PARTS_XLSX_PATH=C:\path\to\biblioteca_piezas.xlsx
```

The XLSX import upserts systems, groups, categories, elements and their translations
from the sheet. It does not invent translations or copy English to other locales.
Image fields are stored as `imageKey` (slug of filename without extension).

## Run

```bash
npm run dev
```


## Translation repair

Fix existing non-EN rows that were seeded with English (legacy script):

```bash
npm run prisma:generate
# Only if the schema changed
npm run prisma:migrate
npm run fix:translations
```

XLSX-only source (no Google Translate):

```bash
npm run fix:translations
```

Import parts and translations from XLSX:

```bash
npm run import:parts
```

## Zero Loading placeholders

```bash
npm run import:parts
npm run fix:translations
npm run cleanup:loading
```

```sql
SELECT 'PartSystemTranslation' as t, COUNT(*) FROM "PartSystemTranslation" WHERE name='Loading...'
UNION ALL
SELECT 'PartGroupTranslation', COUNT(*) FROM "PartGroupTranslation" WHERE name='Loading...'
UNION ALL
SELECT 'PartCategoryTranslation', COUNT(*) FROM "PartCategoryTranslation" WHERE name='Loading...'
UNION ALL
SELECT 'PartElementTranslation', COUNT(*) FROM "PartElementTranslation" WHERE name='Loading...';
```

```sql
-- Empty names by locale
SELECT locale, COUNT(*) FROM "PartSystemTranslation" WHERE trim(name) = '' GROUP BY 1 ORDER BY 2 DESC;
SELECT locale, COUNT(*) FROM "PartGroupTranslation" WHERE trim(name) = '' GROUP BY 1 ORDER BY 2 DESC;
SELECT locale, COUNT(*) FROM "PartCategoryTranslation" WHERE trim(name) = '' GROUP BY 1 ORDER BY 2 DESC;
SELECT locale, COUNT(*) FROM "PartElementTranslation" WHERE trim(name) = '' GROUP BY 1 ORDER BY 2 DESC;
```

```sql
-- English copies (non-human)
SELECT t.locale, COUNT(*)
FROM "PartSystemTranslation" t
JOIN "PartSystemTranslation" en
  ON en."systemId" = t."systemId" AND en.locale='en'
WHERE t.locale <> 'en'
  AND lower(trim(t.name)) = lower(trim(en.name))
  AND (t."confidenceHint" IS NULL OR t."confidenceHint" <> 'human')
GROUP BY 1 ORDER BY 2 DESC;
```

## Translation repair (TSV)

Use TSV as the source of truth (no machine translation). Supported formats:

Format A (long):

```
entityType\tkey\tlocale\tname\taliasesJson?\tkeywordsJson?\tconfidenceHint?
```

Format B (wide):

```
entityType\tkey\ten\tes\tde\tfr\tit\tnl\tpl\thr\ttr\tar\tja\tzh
```

Commands:

```bash
# Dry-run (no writes)
npm run translations:fix -- --tsv .\\datasets\\parts\\biblioteca_piezas.tsv --dry-run

# Apply changes
npm run translations:fix -- --tsv .\\datasets\\parts\\biblioteca_piezas.tsv --apply

# Validate suspicious English copies
npm run translations:check
```

Verification SQL examples:

```sql
-- Placeholders
SELECT locale, COUNT(*) FROM "PartSystemTranslation"
WHERE name = 'Loading...'
GROUP BY 1 ORDER BY 2 DESC;

SELECT locale, COUNT(*) FROM "PartGroupTranslation"
WHERE name = 'Loading...'
GROUP BY 1 ORDER BY 2 DESC;

SELECT locale, COUNT(*) FROM "PartCategoryTranslation"
WHERE name = 'Loading...'
GROUP BY 1 ORDER BY 2 DESC;

SELECT locale, COUNT(*) FROM "PartElementTranslation"
WHERE name = 'Loading...'
GROUP BY 1 ORDER BY 2 DESC;

-- Part system translations that match EN (suspicious)
SELECT t.locale, t.name, en.name AS en_name
FROM "PartSystemTranslation" t
JOIN "PartSystemTranslation" en
  ON en."systemId" = t."systemId" AND en.locale = 'en'
WHERE t.locale <> 'en'
  AND lower(trim(t.name)) = lower(trim(en.name))
ORDER BY t.locale
LIMIT 50;

-- Generic check: non-EN translations equal to EN for any translation table
-- (replace table + join column)
SELECT COUNT(*)
FROM "PartGroupTranslation" t
JOIN "PartGroupTranslation" en
  ON en."groupId" = t."groupId" AND en.locale = 'en'
WHERE t.locale <> 'en'
  AND lower(trim(t.name)) = lower(trim(en.name));
```

UI verification:

- Use Prisma Studio to confirm `locale='ar'` shows Arabic, `ja` Japanese, etc.

## Endpoints

- `GET /v1/health`
- `GET /v1/vehicles/makes`
- `GET /v1/vehicles/models?makeId=...`
- `GET /v1/vehicles/variants?modelId=...`
- `GET /v1/taxonomy/nodes?parentId=...&type=...`
- `GET /v1/services/operations?skill=...&q=...&limit=...&cursor=...`
- `GET /v1/parts/categories?system=...&q=...&limit=...&cursor=...`
- `GET /v1/parts/systems?lang=en&limit=...&cursor=...`
- `GET /v1/parts/groups?systemKey=...&lang=en&limit=...&cursor=...`
- `GET /v1/parts/categories?groupKey=...&lang=en&limit=...&cursor=...`
- `GET /v1/parts/elements?categoryKey=...&q=...&lang=en&limit=...&cursor=...`
- `GET /v1/media/assets?kind=...&q=...&limit=...&cursor=...`
- `GET /v1/lookup/vehicle?make=...&model=...&variant=...`
- `GET /v1/lookup/service?skill=...&taxonomyKey=...&serviceKey=...`
- `GET /v1/lookup/part?systemKey=...&groupKey=...&categoryKey=...&elementKey=...&lang=en`
- `GET /v1/catalog/categories?locale=es`
- `GET /v1/catalog/items?categoryKey=...&locale=es&limit=...&cursor=...`
- `GET /v1/catalog/lookup/item?code=...&locale=es`

Response contract:

- List: `{ items: [...], nextCursor: string | null }`
- Single: `{ item: {...} }` or 404 with `{ error: { message, status } }`
- Lookup: `{ valid: boolean, resolved: object | null }`

Pagination:

- `limit` (default 50, max 200)
- `cursor` (base64 cursor returned by previous response)
- `lang` or `locale` (default `en`)

## Curl examples

```bash
curl http://localhost:4010/v1/health
curl "http://localhost:4010/v1/vehicles/makes?limit=10"
curl "http://localhost:4010/v1/vehicles/models?makeId=seat"
curl "http://localhost:4010/v1/vehicles/variants?modelId=ibiza"
curl "http://localhost:4010/v1/taxonomy/nodes?type=SERVICE"
curl "http://localhost:4010/v1/services/operations?skill=mechanics&q=oil&limit=10"
curl "http://localhost:4010/v1/parts/categories?system=parts&q=brake&limit=10"
curl "http://localhost:4010/v1/parts/systems?lang=en&limit=10"
curl "http://localhost:4010/v1/parts/groups?systemKey=brake-system&lang=en&limit=10"
curl "http://localhost:4010/v1/parts/categories?groupKey=brake-system&lang=en&limit=10"
curl "http://localhost:4010/v1/parts/elements?categoryKey=brake-pads&lang=en&limit=10"
curl "http://localhost:4010/v1/media/assets?kind=IMG&q=ibiza&limit=10"
curl "http://localhost:4010/v1/lookup/vehicle?make=seat&model=ibiza"
curl "http://localhost:4010/v1/lookup/service?skill=mechanics&taxonomyKey=engine-service&serviceKey=oil-change"
curl "http://localhost:4010/v1/lookup/part?systemKey=engine&groupKey=engine-drive&categoryKey=brake-pads&lang=en"
curl "http://localhost:4010/v1/catalog/categories?locale=es"
curl "http://localhost:4010/v1/catalog/items?categoryKey=diagnosis&locale=es&limit=10"
curl "http://localhost:4010/v1/catalog/lookup/item?code=503&locale=es"
```

## Static assets

Assets are served from `/assets`:

```bash
curl http://localhost:4010/assets/img/seat-ibiza.jpg
```

## How other services should use beterano-data

Use this API as the single source of truth for catalog data and validations.

- Frontend: query `GET /v1/vehicles/*` and taxonomy endpoints to populate dropdowns.
- Backend: use lookup endpoints to validate user selections before persisting.
- Assistant/AI: consume DTOs with `aliases`, `keywords`, and `confidenceHints` for matching.
- Catalogs: request `locale` for translated names; fallback is the base `name` field.

Do not duplicate catalogs in other repos. Persist only stable references (keys), never internal IDs, and re-validate via lookup endpoints when needed.

