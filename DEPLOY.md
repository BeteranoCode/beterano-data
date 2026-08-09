# Deploy de beterano-data (API de datasets)

Publica beterano-data como servicio web para que los consumidores (leads-api, y en
el futuro los fronts) accedan a vehículos / taxonomía de piezas / tribus / geo sin
depender de tenerlo corriendo en local. Mismo patrón que core-api/marketplace-api:
**Render (web) + Neon (Postgres)**.

Read-only y sin secretos → se despliega **sin `API_KEY`** (guard abierto). Si se
quisiera cerrar, poner `API_KEY` y exceptuar `/v1/health` del guard.

## 1. Neon (Postgres)
1. Crear proyecto Neon en **Frankfurt** (misma región que Render), DB p.ej. `beterano_data`.
2. Copiar el connection string (`postgresql://...neon.tech/...?sslmode=require`).

## 2. Render (web service)
- Con el `render.yaml` del repo: **New → Blueprint** apuntando a `BeteranoCode/beterano-data` (rama `main`). Render lee `render.yaml` (build `npm ci && npx prisma generate && npm run build`, start `node dist/server.js`, health `/v1/health`).
- En **Environment**, pegar `DATABASE_URL` = el string de Neon (el resto ya viene del yaml: `NODE_VERSION=24`, `CORS_ORIGINS`).
- El build ya está arreglado: compila solo `src/` (`tsconfig.build.json`); los scripts de import/fix (uno de ellos con error de tipos) quedan fuera del build de deploy y siguen corriéndose por `ts-node` en local.

## 3. Seed de la DB de prod (paso CRÍTICO)
La DB de Neon arranca **vacía** → los endpoints devolverían listas vacías (mismo
síntoma que el servicio caído). Hay que poblarla. Dos opciones:

**Opción A — copiar la DB local (recomendada si tienes `pg_dump`/`psql`):** exacta y rápida.
```bash
# local está en el contenedor docker beterano-data-db (:5441)
pg_dump "postgresql://beterano:<pass>@localhost:5441/beterano_data" --no-owner --no-privileges -Fc -f beterano_data.dump
pg_restore --no-owner --no-privileges -d "postgresql://...neon.tech/beterano_data?sslmode=require" beterano_data.dump
```

**Opción B — migraciones + import scripts** (si no tienes pg client). Correr en LOCAL
apuntando a la `DATABASE_URL` de prod (las migraciones + scripts viven en el repo):
```bash
export DATABASE_URL="postgresql://...neon.tech/beterano_data?sslmode=require"
npx prisma migrate deploy          # crea el esquema (init + i18n + parts-hierarchy)
npm run import:vehicles            # catálogo de vehículos
npm run import:part-tree           # árbol de piezas (system/group/category/element)
npm run import:parts:translations  # traducciones de la taxonomía
```
(Usa exactamente los mismos `import:*` con los que poblaste la DB local; el orden real
depende de tu pipeline de datos.)

## 4. Verificar
```bash
curl "https://<tu-servicio>.onrender.com/v1/health"                    # ok
curl "https://<tu-servicio>.onrender.com/v1/parts/systems?locale=es"   # debe listar ~27 sistemas, no []
curl "https://<tu-servicio>.onrender.com/v1/vehicles/makes"            # marcas
```

## 5. Cablear los consumidores
- **leads-api**: `BETERANO_DATA_URL=https://<tu-servicio>.onrender.com` en su `.env` → el proxy `/v1/catalog/part-*` y `/vehicle-*` deja de depender del beterano-data local.
- (Futuro) **core-api**: si se quiere eliminar el vendorizado de `data/vehicles/`, apuntar core-api a este servicio o proxyear; y los fronts (map/marketplace) podrían consumir la taxonomía en vivo (por eso el CORS con `beterano.club` et al.).

## Ojo (Render free)
- Duerme tras ~15 min de inactividad → **cold start ~50s** en la primera petición (la cascada de piezas tardará esa primera vez).
- Neon free: 0.5 GB, scale-to-zero.
