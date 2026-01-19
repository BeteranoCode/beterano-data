import "dotenv/config";
import { Locale, Prisma, PrismaClient } from "@prisma/client";
import { promises as fs } from "fs";
import path from "path";

const prisma = new PrismaClient();

const SUPPORTED_LOCALES: Locale[] = [
  Locale.ar,
  Locale.de,
  Locale.en,
  Locale.es,
  Locale.fr,
  Locale.hr,
  Locale.it,
  Locale.ja,
  Locale.nl,
  Locale.pl,
  Locale.tr,
  Locale.zh,
];

const DEFAULT_TSV = path.join(process.cwd(), "datasets", "parts", "biblioteca_piezas.tsv");

type EntityType =
  | "taxonomyNode"
  | "workCatalogItem"
  | "partSystem"
  | "partGroup"
  | "partCategory"
  | "partElement"
  | "serviceOperation";

type TranslationPayload = {
  name: string;
  aliasesJson?: Prisma.InputJsonValue;
  keywordsJson?: Prisma.InputJsonValue;
  confidenceHint?: string | null;
};

type TranslationMap = Map<EntityType, Map<string, Map<Locale, TranslationPayload>>>;

type SummaryStats = {
  created: number;
  updated: number;
  cleared: number;
  kept: number;
};

type WarningMap = Map<string, number>;

const ENTITY_TYPES: EntityType[] = [
  "taxonomyNode",
  "workCatalogItem",
  "partSystem",
  "partGroup",
  "partCategory",
  "partElement",
  "serviceOperation",
];

const LOCALE_LOOKUP = new Set(SUPPORTED_LOCALES.map((l) => l));

const TARGET_CLEAR_HINT = "missing_translation";

function toLocale(value: string | undefined): Locale | null {
  if (!value) return null;
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return null;
  if (LOCALE_LOOKUP.has(trimmed as Locale)) return trimmed as Locale;
  return null;
}

function normalizeName(value: string | undefined) {
  if (!value) return "";
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function parseArgs(argv: string[]) {
  const args = new Set(argv);
  const tsvIndex = argv.findIndex((arg) => arg === "--tsv");
  const tsvPath = tsvIndex >= 0 ? argv[tsvIndex + 1] : DEFAULT_TSV;
  const dryRun = args.has("--dry-run") || !args.has("--apply");
  return { tsvPath, dryRun };
}

function bump(map: WarningMap, key: string) {
  map.set(key, (map.get(key) ?? 0) + 1);
}

function parseJsonArray(value: string | undefined) {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  try {
    return JSON.parse(trimmed) as Prisma.InputJsonValue;
  } catch {
    return undefined;
  }
}

function getOrCreateEntity(map: TranslationMap, entityType: EntityType, key: string) {
  let entityMap = map.get(entityType);
  if (!entityMap) {
    entityMap = new Map();
    map.set(entityType, entityMap);
  }
  let localeMap = entityMap.get(key);
  if (!localeMap) {
    localeMap = new Map();
    entityMap.set(key, localeMap);
  }
  return localeMap;
}

function detectFormat(headers: string[]) {
  const lower = headers.map((h) => h.trim().toLowerCase());
  const isLong =
    lower.includes("entitytype") &&
    lower.includes("key") &&
    lower.includes("locale") &&
    lower.includes("name");
  if (isLong) return "long";
  const hasLocaleHeaders = headers.some((h) => toLocale(h) !== null);
  return hasLocaleHeaders ? "wide" : "unknown";
}

function parseTsv(content: string): TranslationMap {
  const map: TranslationMap = new Map();
  const lines = content
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => line.trim());
  if (!lines.length) return map;

  const firstCols = lines[0].split("\t");
  const format = detectFormat(firstCols);
  let startIndex = 0;
  let headers = firstCols;
  if (format !== "unknown" && firstCols.some((h) => h.toLowerCase().includes("entity"))) {
    startIndex = 1;
  }

  if (format === "wide") {
    if (startIndex === 0) {
      headers = ["entityType", "key", ...headers.slice(2)];
    }
  }

  for (let i = startIndex; i < lines.length; i += 1) {
    const cols = lines[i].split("\t");
    if (format === "long") {
      const [entityTypeRaw, keyRaw, localeRaw, nameRaw, aliasesRaw, keywordsRaw, hintRaw] = cols;
      const entityType = entityTypeRaw?.trim() as EntityType;
      if (!ENTITY_TYPES.includes(entityType)) continue;
      const key = keyRaw?.trim();
      const locale = toLocale(localeRaw);
      const name = nameRaw?.trim();
      if (!key || !locale || !name) continue;
      const localeMap = getOrCreateEntity(map, entityType, key);
      localeMap.set(locale, {
        name,
        aliasesJson: parseJsonArray(aliasesRaw),
        keywordsJson: parseJsonArray(keywordsRaw),
        confidenceHint: hintRaw?.trim() || undefined,
      });
      continue;
    }

    if (format === "wide") {
      const entityType = cols[0]?.trim() as EntityType;
      const key = cols[1]?.trim();
      if (!ENTITY_TYPES.includes(entityType) || !key) continue;
      const localeMap = getOrCreateEntity(map, entityType, key);
      for (let c = 2; c < headers.length && c < cols.length; c += 1) {
        const locale = toLocale(headers[c]);
        if (!locale) continue;
        const value = cols[c]?.trim();
        if (!value) continue;
        localeMap.set(locale, { name: value });
      }
    }
  }

  return map;
}

async function fileExists(filePath: string) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function buildKeyToIdMaps() {
  const [systems, groups, categories, elements, taxonomy, catalogItems, operations] =
    await Promise.all([
      prisma.partSystem.findMany({ select: { id: true, key: true } }),
      prisma.partGroup.findMany({ select: { id: true, key: true } }),
      prisma.partCategory.findMany({ select: { id: true, key: true } }),
      prisma.partElement.findMany({ select: { id: true, key: true, legacyId: true } }),
      prisma.taxonomyNode.findMany({ select: { id: true, key: true } }),
      prisma.workCatalogItem.findMany({ select: { id: true, key: true } }),
      prisma.serviceOperation.findMany({ select: { id: true, key: true } }),
    ]);

  const duplicateKeys = new Map<string, number>();

  const buildMap = (rows: Array<{ id: string; key: string }>) => {
    const map = new Map<string, string>();
    for (const row of rows) {
      if (map.has(row.key)) {
        bump(duplicateKeys, row.key);
      } else {
        map.set(row.key, row.id);
      }
    }
    return map;
  };

  const systemMap = buildMap(systems);
  const groupMap = buildMap(groups);
  const categoryMap = buildMap(categories);
  const elementMap = buildMap(elements);
  const taxonomyMap = buildMap(taxonomy);
  const catalogMap = buildMap(catalogItems);
  const operationMap = buildMap(operations);

  const elementByLegacyId = new Map(
    elements
      .filter((row) => row.legacyId)
      .map((row) => [row.legacyId as string, row.id])
  );

  return {
    systemMap,
    groupMap,
    categoryMap,
    elementMap,
    taxonomyMap,
    catalogMap,
    operationMap,
    elementByLegacyId,
    duplicateKeys,
  };
}

async function loadEnTranslations() {
  const [
    systemEn,
    groupEn,
    categoryEn,
    elementEn,
    taxonomyEn,
    catalogEn,
    operationEn,
  ] = await Promise.all([
    prisma.partSystemTranslation.findMany({
      where: { locale: Locale.en },
      select: { systemId: true, name: true },
    }),
    prisma.partGroupTranslation.findMany({
      where: { locale: Locale.en },
      select: { groupId: true, name: true },
    }),
    prisma.partCategoryTranslation.findMany({
      where: { locale: Locale.en },
      select: { categoryId: true, name: true },
    }),
    prisma.partElementTranslation.findMany({
      where: { locale: Locale.en },
      select: { elementId: true, name: true },
    }),
    prisma.taxonomyNodeTranslation.findMany({
      where: { locale: Locale.en },
      select: { taxonomyNodeId: true, name: true },
    }),
    prisma.workCatalogItemTranslation.findMany({
      where: { locale: Locale.en },
      select: { itemId: true, name: true },
    }),
    prisma.serviceOperationTranslation.findMany({
      where: { locale: Locale.en },
      select: { operationId: true, name: true },
    }),
  ]);

  return {
    systemEn: new Map(systemEn.map((row) => [row.systemId, row.name])),
    groupEn: new Map(groupEn.map((row) => [row.groupId, row.name])),
    categoryEn: new Map(categoryEn.map((row) => [row.categoryId, row.name])),
    elementEn: new Map(elementEn.map((row) => [row.elementId, row.name])),
    taxonomyEn: new Map(taxonomyEn.map((row) => [row.taxonomyNodeId, row.name])),
    catalogEn: new Map(catalogEn.map((row) => [row.itemId, row.name])),
    operationEn: new Map(operationEn.map((row) => [row.operationId, row.name])),
  };
}

async function main() {
  const { tsvPath, dryRun } = parseArgs(process.argv.slice(2));

  if (!(await fileExists(tsvPath))) {
    throw new Error(`TSV not found at ${tsvPath}`);
  }

  const content = await fs.readFile(tsvPath, "utf8");
  const tsvMap = parseTsv(content);
  console.log(`TSV loaded from ${tsvPath}`);
  console.log(`Dry run: ${dryRun}`);

  const {
    systemMap,
    groupMap,
    categoryMap,
    elementMap,
    taxonomyMap,
    catalogMap,
    operationMap,
    elementByLegacyId,
    duplicateKeys,
  } = await buildKeyToIdMaps();

  if (duplicateKeys.size) {
    console.log(
      `Warning: duplicate keys detected (showing top 10): ${Array.from(duplicateKeys.entries())
        .slice(0, 10)
        .map(([key, count]) => `${key}(${count})`)
        .join(", ")}`
    );
  }

  const enTranslations = await loadEnTranslations();

  const statsByEntity: Record<EntityType, SummaryStats> = {
    taxonomyNode: { created: 0, updated: 0, cleared: 0, kept: 0 },
    workCatalogItem: { created: 0, updated: 0, cleared: 0, kept: 0 },
    partSystem: { created: 0, updated: 0, cleared: 0, kept: 0 },
    partGroup: { created: 0, updated: 0, cleared: 0, kept: 0 },
    partCategory: { created: 0, updated: 0, cleared: 0, kept: 0 },
    partElement: { created: 0, updated: 0, cleared: 0, kept: 0 },
    serviceOperation: { created: 0, updated: 0, cleared: 0, kept: 0 },
  };

  const warnings: WarningMap = new Map();

  const clearIfEnglish = async (entityType: EntityType, id: string, locale: Locale) => {
    const enNameMap = {
      taxonomyNode: enTranslations.taxonomyEn,
      workCatalogItem: enTranslations.catalogEn,
      partSystem: enTranslations.systemEn,
      partGroup: enTranslations.groupEn,
      partCategory: enTranslations.categoryEn,
      partElement: enTranslations.elementEn,
      serviceOperation: enTranslations.operationEn,
    }[entityType];

    const enName = enNameMap.get(id);
    if (!enName) {
      statsByEntity[entityType].kept += 1;
      return;
    }

    const comparer = normalizeName(enName);
    if (!comparer) {
      statsByEntity[entityType].kept += 1;
      return;
    }

    const where = (() => {
      switch (entityType) {
        case "taxonomyNode":
          return { taxonomyNodeId_locale: { taxonomyNodeId: id, locale } };
        case "workCatalogItem":
          return { itemId_locale: { itemId: id, locale } };
        case "partSystem":
          return { systemId_locale: { systemId: id, locale } };
        case "partGroup":
          return { groupId_locale: { groupId: id, locale } };
        case "partCategory":
          return { categoryId_locale: { categoryId: id, locale } };
        case "partElement":
          return { elementId_locale: { elementId: id, locale } };
        case "serviceOperation":
          return { operationId_locale: { operationId: id, locale } };
      }
    })();

    if (dryRun) {
      statsByEntity[entityType].cleared += 1;
      return;
    }

    if (entityType === "taxonomyNode") {
      const existing = await prisma.taxonomyNodeTranslation.findUnique({
        where,
        select: { name: true },
      });
      if (!existing || normalizeName(existing.name) !== comparer) {
        statsByEntity[entityType].kept += 1;
        return;
      }
      await prisma.taxonomyNodeTranslation.update({
        where,
        data: { name: "" },
      });
      statsByEntity[entityType].cleared += 1;
      return;
    }

    if (entityType === "workCatalogItem") {
      const existing = await prisma.workCatalogItemTranslation.findUnique({
        where,
        select: { name: true },
      });
      if (!existing || normalizeName(existing.name) !== comparer) {
        statsByEntity[entityType].kept += 1;
        return;
      }
      await prisma.workCatalogItemTranslation.update({
        where,
        data: { name: "", aliases: null },
      });
      statsByEntity[entityType].cleared += 1;
      return;
    }

    if (entityType === "serviceOperation") {
      const existing = await prisma.serviceOperationTranslation.findUnique({
        where,
        select: { name: true },
      });
      if (!existing || normalizeName(existing.name) !== comparer) {
        statsByEntity[entityType].kept += 1;
        return;
      }
      await prisma.serviceOperationTranslation.update({
        where,
        data: {
          name: "",
          aliases: null,
          keywords: null,
          confidenceHint: TARGET_CLEAR_HINT,
        },
      });
      statsByEntity[entityType].cleared += 1;
      return;
    }

    const partTable =
      entityType === "partSystem"
        ? prisma.partSystemTranslation
        : entityType === "partGroup"
          ? prisma.partGroupTranslation
          : entityType === "partCategory"
            ? prisma.partCategoryTranslation
            : prisma.partElementTranslation;

    const existing = await partTable.findUnique({
      where,
      select: { name: true },
    });
    if (!existing || normalizeName(existing.name) !== comparer) {
      statsByEntity[entityType].kept += 1;
      return;
    }
    await partTable.update({
      where,
      data: {
        name: "",
        aliasesJson: null,
        keywordsJson: null,
        confidenceHint: TARGET_CLEAR_HINT,
      },
    });
    statsByEntity[entityType].cleared += 1;
  };

  for (const entityType of ENTITY_TYPES) {
    const entries = tsvMap.get(entityType);
    if (!entries) continue;

    for (const [key, localeMap] of entries) {
      let id: string | undefined;
      if (entityType === "partSystem") id = systemMap.get(key);
      if (entityType === "partGroup") id = groupMap.get(key);
      if (entityType === "partCategory") id = categoryMap.get(key);
      if (entityType === "partElement") id = elementMap.get(key);
      if (entityType === "taxonomyNode") id = taxonomyMap.get(key);
      if (entityType === "workCatalogItem") id = catalogMap.get(key);
      if (entityType === "serviceOperation") id = operationMap.get(key);

      if (!id && entityType === "partElement") {
        const legacyId = elementByLegacyId.get(key);
        if (legacyId) id = legacyId;
      }

      if (!id) {
        bump(warnings, `${entityType}:keyNotFound:${key}`);
        continue;
      }

      for (const [locale, payload] of localeMap) {
        if (locale === Locale.en && !UPDATE_EXISTING) continue;
        if (!payload.name) continue;

        const table = {
          taxonomyNode: prisma.taxonomyNodeTranslation,
          workCatalogItem: prisma.workCatalogItemTranslation,
          partSystem: prisma.partSystemTranslation,
          partGroup: prisma.partGroupTranslation,
          partCategory: prisma.partCategoryTranslation,
          partElement: prisma.partElementTranslation,
          serviceOperation: prisma.serviceOperationTranslation,
        }[entityType];

        const where = (() => {
          switch (entityType) {
            case "taxonomyNode":
              return { taxonomyNodeId_locale: { taxonomyNodeId: id, locale } };
            case "workCatalogItem":
              return { itemId_locale: { itemId: id, locale } };
            case "partSystem":
              return { systemId_locale: { systemId: id, locale } };
            case "partGroup":
              return { groupId_locale: { groupId: id, locale } };
            case "partCategory":
              return { categoryId_locale: { categoryId: id, locale } };
            case "partElement":
              return { elementId_locale: { elementId: id, locale } };
            case "serviceOperation":
              return { operationId_locale: { operationId: id, locale } };
          }
        })();

        const data: Record<string, unknown> = { name: payload.name };
        if (entityType === "serviceOperation") {
          data.aliases = payload.aliasesJson;
          data.keywords = payload.keywordsJson;
          data.confidenceHint = payload.confidenceHint ?? null;
        } else if (entityType === "workCatalogItem") {
          data.aliases = payload.aliasesJson;
        } else if (entityType.startsWith("part")) {
          data.aliasesJson = payload.aliasesJson;
          data.keywordsJson = payload.keywordsJson;
          data.confidenceHint = payload.confidenceHint ?? null;
        }

        const existing = await table.findUnique({
          where,
          select: { id: true, name: true },
        });

        if (!existing) {
          if (!dryRun) {
            if (entityType === "taxonomyNode") {
              await prisma.taxonomyNodeTranslation.create({
                data: { taxonomyNodeId: id, locale, name: payload.name },
              });
            } else if (entityType === "workCatalogItem") {
              await prisma.workCatalogItemTranslation.create({
                data: {
                  itemId: id,
                  locale,
                  name: payload.name,
                  aliases: payload.aliasesJson,
                },
              });
            } else if (entityType === "serviceOperation") {
              await prisma.serviceOperationTranslation.create({
                data: {
                  operationId: id,
                  locale,
                  name: payload.name,
                  aliases: payload.aliasesJson,
                  keywords: payload.keywordsJson,
                  confidenceHint: payload.confidenceHint ?? null,
                },
              });
            } else if (entityType === "partSystem") {
              await prisma.partSystemTranslation.create({
                data: {
                  systemId: id,
                  locale,
                  name: payload.name,
                  aliasesJson: payload.aliasesJson,
                  keywordsJson: payload.keywordsJson,
                  confidenceHint: payload.confidenceHint ?? null,
                },
              });
            } else if (entityType === "partGroup") {
              await prisma.partGroupTranslation.create({
                data: {
                  groupId: id,
                  locale,
                  name: payload.name,
                  aliasesJson: payload.aliasesJson,
                  keywordsJson: payload.keywordsJson,
                  confidenceHint: payload.confidenceHint ?? null,
                },
              });
            } else if (entityType === "partCategory") {
              await prisma.partCategoryTranslation.create({
                data: {
                  categoryId: id,
                  locale,
                  name: payload.name,
                  aliasesJson: payload.aliasesJson,
                  keywordsJson: payload.keywordsJson,
                  confidenceHint: payload.confidenceHint ?? null,
                },
              });
            } else if (entityType === "partElement") {
              await prisma.partElementTranslation.create({
                data: {
                  elementId: id,
                  locale,
                  name: payload.name,
                  aliasesJson: payload.aliasesJson,
                  keywordsJson: payload.keywordsJson,
                  confidenceHint: payload.confidenceHint ?? null,
                },
              });
            }
          }
          statsByEntity[entityType].created += 1;
        } else if (existing.name !== payload.name) {
          if (!dryRun) {
            await table.update({ where, data });
          }
          statsByEntity[entityType].updated += 1;
        } else {
          statsByEntity[entityType].kept += 1;
        }
      }
    }
  }

  if (dryRun) {
    console.log("Dry-run: no database writes performed.");
  }

  for (const entityType of ENTITY_TYPES) {
    const stats = statsByEntity[entityType];
    console.log(
      `${entityType}: created:${stats.created} updated:${stats.updated} cleared:${stats.cleared} kept:${stats.kept}`
    );
  }

  for (const [key, count] of Array.from(warnings.entries()).slice(0, 20)) {
    console.log(`WARN ${key} (${count})`);
  }

  if (!dryRun) {
    // Clear English copies where TSV has no translation
    for (const entityType of ENTITY_TYPES) {
      const enMap = {
        taxonomyNode: enTranslations.taxonomyEn,
        workCatalogItem: enTranslations.catalogEn,
        partSystem: enTranslations.systemEn,
        partGroup: enTranslations.groupEn,
        partCategory: enTranslations.categoryEn,
        partElement: enTranslations.elementEn,
        serviceOperation: enTranslations.operationEn,
      }[entityType];

      const table = {
        taxonomyNode: prisma.taxonomyNodeTranslation,
        workCatalogItem: prisma.workCatalogItemTranslation,
        partSystem: prisma.partSystemTranslation,
        partGroup: prisma.partGroupTranslation,
        partCategory: prisma.partCategoryTranslation,
        partElement: prisma.partElementTranslation,
        serviceOperation: prisma.serviceOperationTranslation,
      }[entityType];

      const rows = await table.findMany({
        where: { locale: { in: SUPPORTED_LOCALES.filter((l) => l !== Locale.en) } },
        select: {
          id: true,
          locale: true,
          name: true,
          taxonomyNodeId: true,
          itemId: true,
          systemId: true,
          groupId: true,
          categoryId: true,
          elementId: true,
          operationId: true,
        },
      });

      for (const row of rows) {
        const id =
          row.taxonomyNodeId ||
          row.itemId ||
          row.systemId ||
          row.groupId ||
          row.categoryId ||
          row.elementId ||
          row.operationId;
        if (!id) continue;
        const enName = enMap.get(id);
        if (!enName) continue;
        if (normalizeName(row.name) !== normalizeName(enName)) continue;

        const entries = tsvMap.get(entityType);
        const keyToCheck = (() => {
          if (entityType === "partSystem") return Array.from(systemMap.entries()).find(([, v]) => v === id)?.[0];
          if (entityType === "partGroup") return Array.from(groupMap.entries()).find(([, v]) => v === id)?.[0];
          if (entityType === "partCategory") return Array.from(categoryMap.entries()).find(([, v]) => v === id)?.[0];
          if (entityType === "partElement") return Array.from(elementMap.entries()).find(([, v]) => v === id)?.[0];
          if (entityType === "taxonomyNode") return Array.from(taxonomyMap.entries()).find(([, v]) => v === id)?.[0];
          if (entityType === "workCatalogItem") return Array.from(catalogMap.entries()).find(([, v]) => v === id)?.[0];
          if (entityType === "serviceOperation") return Array.from(operationMap.entries()).find(([, v]) => v === id)?.[0];
          return undefined;
        })();

        if (keyToCheck && entries?.get(keyToCheck)?.has(row.locale as Locale)) {
          continue;
        }

        await clearIfEnglish(entityType, id, row.locale as Locale);
      }
    }
  }

  console.log("Done.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
