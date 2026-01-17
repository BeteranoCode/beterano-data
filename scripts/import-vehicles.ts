import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { promises as fs } from "fs";
import path from "path";

// Usage:
// VEHICLES_TSV_PATH=./datasets/_archiv/Veh_culos_con_ID.tsv npm run import:vehicles
// VEHICLES_TSV_DIR=./datasets/_archiv npm run import:vehicles
// VEHICLES_TSV_GLOB=*vehicul*.tsv npm run import:vehicles

const prisma = new PrismaClient();

type Row = Record<string, string>;

const DEFAULT_DIR = path.join(process.cwd(), "datasets", "_archiv");

function normalizeText(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function stripDiacritics(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function slugify(value: string) {
  const base = stripDiacritics(normalizeText(value)).toLowerCase();
  return base.replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function parseTsvLine(line: string) {
  const values: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "\t" && !inQuotes) {
      values.push(current);
      current = "";
      continue;
    }

    current += char;
  }

  values.push(current);
  return values;
}

function parseTsv(content: string): Row[] {
  const lines = content
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => line.trim().length > 0);

  if (!lines.length) return [];

  const headers = parseTsvLine(lines[0]).map((header) => header.trim());
  return lines.slice(1).map((line) => {
    const values = parseTsvLine(line);
    const row: Row = {};
    headers.forEach((header, index) => {
      row[header] = values[index] ? values[index].trim() : "";
    });
    return row;
  });
}

function normalizeHeader(value: string) {
  return stripDiacritics(value).toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function findColumn(row: Row, hints: string[]) {
  const normalizedHints = hints.map((hint) =>
    normalizeHeader(hint).toLowerCase()
  );
  const entries = Object.keys(row).map((key) => ({
    key,
    normalized: normalizeHeader(key),
  }));

  for (const hint of normalizedHints) {
    const match = entries.find((entry) =>
      entry.normalized.includes(hint)
    );
    if (match) return match.key;
  }
  return null;
}

function getValue(row: Row, key: string | null) {
  if (!key) return "";
  const raw = row[key];
  return raw ? normalizeText(raw) : "";
}

function parseYears(value: string) {
  if (!value) return { yearFrom: null, yearTo: null, invalid: false };
  const matches = value.match(/\d{4}/g);
  if (!matches || matches.length === 0) {
    return { yearFrom: null, yearTo: null, invalid: true };
  }
  const years = matches.map((entry) => Number(entry)).filter(Boolean);
  if (!years.length) return { yearFrom: null, yearTo: null, invalid: true };
  return {
    yearFrom: Math.min(...years),
    yearTo: Math.max(...years),
    invalid: false,
  };
}

function buildGlobRegex(pattern: string) {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  const regex = escaped.replace(/\*/g, ".*");
  return new RegExp(`^${regex}$`, "i");
}

async function resolveTsvFiles() {
  if (process.env.VEHICLES_TSV_PATH) {
    return [process.env.VEHICLES_TSV_PATH];
  }

  const dir = process.env.VEHICLES_TSV_DIR || DEFAULT_DIR;
  const entries = await fs.readdir(dir);
  const glob = process.env.VEHICLES_TSV_GLOB;
  const regex = glob ? buildGlobRegex(glob) : /vehicul|veh_culos|vehicle/i;
  return entries
    .filter((name) => name.toLowerCase().endsWith(".tsv"))
    .filter((name) => regex.test(name))
    .map((name) => path.join(dir, name));
}

async function main() {
  console.log(`[import] DATABASE_URL=${process.env.DATABASE_URL ?? ""}`);
  const dbInfo = await prisma.$queryRaw<
    Array<{ db: string; schema: string }>
  >`select current_database() as db, current_schema() as schema`;
  const dbRow = dbInfo[0];
  console.log(`[import] db=${dbRow?.db ?? "?"} schema=${dbRow?.schema ?? "?"}`);
  const beforeCounts = await Promise.all([
    prisma.vehicleMake.count(),
    prisma.vehicleModel.count(),
    prisma.vehicleVariant.count(),
  ]);
  console.log(
    `[import] before counts: makes=${beforeCounts[0]} models=${beforeCounts[1]} variants=${beforeCounts[2]}`
  );

  const files = await resolveTsvFiles();
  console.log(`[import] tsv files found: ${files.length}`);
  if (files.length === 0) {
    throw new Error("No TSV files found for vehicles import.");
  }

  const stats = {
    rowsParsed: 0,
    rowsProcessed: 0,
    makesCreated: 0,
    makesUpdated: 0,
    modelsCreated: 0,
    modelsUpdated: 0,
    variantsCreated: 0,
    variantsUpdated: 0,
    skippedMissingMake: 0,
    skippedMissingModel: 0,
    skippedMissingVariant: 0,
    skippedInvalidYear: 0,
    skippedBadSlug: 0,
  };
  const skippedSamples: string[] = [];

  const makeCache = new Map<string, string>();
  const modelCache = new Map<string, string>();

  for (const file of files) {
    const resolvedPath = path.isAbsolute(file)
      ? file
      : path.join(process.cwd(), file);
    const content = await fs.readFile(resolvedPath, "utf8");
    console.log(`[import] reading ${resolvedPath} bytes=${content.length}`);
    const rows = parseTsv(content);
    stats.rowsParsed += rows.length;
    if (rows.length === 0) {
      throw new Error(`TSV parsed 0 rows: ${resolvedPath}`);
    }
    console.log(
      `[import] ${path.basename(resolvedPath)} rows=${rows.length} headers=${Object.keys(rows[0]).join(", ")}`
    );

    const firstRow = rows[0];
    const colMake = findColumn(firstRow, ["marca", "make", "brand"]);
    const colModel = findColumn(firstRow, ["modelo", "model"]);
    const colVariant = findColumn(firstRow, [
      "version",
      "variant",
      "trim",
      "acabado",
      "designacion",
      "serie",
      "generacion",
    ]);
    const colFuel = findColumn(firstRow, ["combustible", "fuel"]);
    const colEngine = findColumn(firstRow, ["motor", "engine"]);
    const colYear = findColumn(firstRow, ["year", "ano", "año"]);
    const colId = findColumn(firstRow, ["idspecific", "id"]);

    for (const row of rows) {
      const makeName = getValue(row, colMake);
      const modelName = getValue(row, colModel);
      const variantNameRaw =
        getValue(row, colVariant) || getValue(row, colEngine);
      const fuel = getValue(row, colFuel);
      const engine = getValue(row, colEngine);
      const rawId = getValue(row, colId);
      const yearValue = getValue(row, colYear);

      if (!makeName) {
        stats.skippedMissingMake += 1;
        if (skippedSamples.length < 5) {
          skippedSamples.push(`missing make: model=${modelName}`);
        }
        continue;
      }
      if (!modelName) {
        stats.skippedMissingModel += 1;
        if (skippedSamples.length < 5) {
          skippedSamples.push(`missing model: make=${makeName}`);
        }
        continue;
      }
      if (!variantNameRaw) {
        stats.skippedMissingVariant += 1;
        if (skippedSamples.length < 5) {
          skippedSamples.push(
            `missing variant: make=${makeName} model=${modelName}`
          );
        }
        continue;
      }

      const makeKey = slugify(makeName);
      const modelKeyBase = slugify(modelName);
      if (!makeKey || !modelKeyBase) {
        stats.skippedBadSlug += 1;
        if (skippedSamples.length < 5) {
          skippedSamples.push(
            `bad slug: make=${makeName} model=${modelName}`
          );
        }
        continue;
      }

      const modelKey = `${makeKey}-${modelKeyBase}`;
      let makeId = makeCache.get(makeKey);
      if (!makeId) {
        const existing = await prisma.vehicleMake.findUnique({
          where: { key: makeKey },
        });
        if (existing) {
          makeId = existing.id;
          stats.makesUpdated += 1;
        } else {
          const created = await prisma.vehicleMake.create({
            data: { key: makeKey, name: makeName },
          });
          makeId = created.id;
          stats.makesCreated += 1;
        }
        makeCache.set(makeKey, makeId);
      }

      const modelCacheKey = `${makeId}:${modelKey}`;
      let modelId = modelCache.get(modelCacheKey);
      if (!modelId) {
        const existing = await prisma.vehicleModel.findUnique({
          where: { key: modelKey },
        });
        if (existing) {
          modelId = existing.id;
          stats.modelsUpdated += 1;
        } else {
          const created = await prisma.vehicleModel.create({
            data: { key: modelKey, name: modelName, makeId },
          });
          modelId = created.id;
          stats.modelsCreated += 1;
        }
        modelCache.set(modelCacheKey, modelId);
      }

      const { yearFrom, yearTo, invalid } = parseYears(yearValue);
      if (invalid) {
        stats.skippedInvalidYear += 1;
      }

      const variantSlug = slugify(
        [variantNameRaw, fuel, engine, yearFrom, yearTo].filter(Boolean).join("-")
      );
      const variantKey = rawId ? slugify(rawId) : `${modelKey}-${variantSlug}`;
      if (!variantKey) {
        stats.skippedBadSlug += 1;
        if (skippedSamples.length < 5) {
          skippedSamples.push(
            `bad variant key: make=${makeName} model=${modelName} variant=${variantNameRaw}`
          );
        }
        continue;
      }

      const existingVariant = await prisma.vehicleVariant.findUnique({
        where: { key: variantKey },
      });
      if (existingVariant) {
        await prisma.vehicleVariant.update({
          where: { id: existingVariant.id },
          data: {
            name: variantNameRaw,
            modelId,
            yearFrom: yearFrom ?? null,
            yearTo: yearTo ?? null,
            engine: engine || null,
            fuel: fuel || null,
          },
        });
        stats.variantsUpdated += 1;
      } else {
        await prisma.vehicleVariant.create({
          data: {
            key: variantKey,
            name: variantNameRaw,
            modelId,
            yearFrom: yearFrom ?? null,
            yearTo: yearTo ?? null,
            engine: engine || null,
            fuel: fuel || null,
          },
        });
        stats.variantsCreated += 1;
      }

      stats.rowsProcessed += 1;
    }
  }

  const afterCounts = await Promise.all([
    prisma.vehicleMake.count(),
    prisma.vehicleModel.count(),
    prisma.vehicleVariant.count(),
  ]);

  console.log(`[import] rows parsed total: ${stats.rowsParsed}`);
  console.log(`[import] rows processed: ${stats.rowsProcessed}`);
  console.log(
    `[import] created/updated: makes ${stats.makesCreated}/${stats.makesUpdated}, models ${stats.modelsCreated}/${stats.modelsUpdated}, variants ${stats.variantsCreated}/${stats.variantsUpdated}`
  );
  console.log(
    `[import] skip summary: missingMake=${stats.skippedMissingMake} missingModel=${stats.skippedMissingModel} missingVariant=${stats.skippedMissingVariant} invalidYear=${stats.skippedInvalidYear} badSlug=${stats.skippedBadSlug}`
  );
  if (skippedSamples.length > 0) {
    console.log("[import] skipped samples:");
    skippedSamples.forEach((sample) => console.log(`- ${sample}`));
  }
  console.log(
    `[import] after counts: makes=${afterCounts[0]} models=${afterCounts[1]} variants=${afterCounts[2]}`
  );

  const example = await prisma.vehicleVariant.findFirst({
    include: { model: { include: { make: true } } },
  });
  if (example) {
    const yearLabel =
      example.yearFrom && example.yearTo
        ? `${example.yearFrom}-${example.yearTo}`
        : example.yearFrom
          ? `${example.yearFrom}`
          : example.yearTo
            ? `${example.yearTo}`
            : "n/a";
    console.log(
      `example chain: ${example.model.make.name} -> ${example.model.name} -> ${example.name} -> ${example.engine ?? "engine?"} -> ${yearLabel}`
    );
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
