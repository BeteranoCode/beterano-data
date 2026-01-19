import "dotenv/config";
import { Locale, Prisma, PrismaClient } from "@prisma/client";
import { promises as fs } from "fs";
import path from "path";
import xlsx from "xlsx";

const prisma = new PrismaClient();

const TARGET_LOCALES: Locale[] = [
  Locale.ar,
  Locale.fr,
  Locale.hr,
  Locale.it,
  Locale.ja,
  Locale.nl,
  Locale.pl,
  Locale.tr,
  Locale.zh,
];

const BASE_LOCALES: Locale[] = [Locale.en, Locale.es, Locale.de];

const LOCALE_PREFIX: Record<Locale, string> = {
  [Locale.ar]: "AR",
  [Locale.de]: "DE",
  [Locale.en]: "EN",
  [Locale.es]: "ES",
  [Locale.fr]: "FR",
  [Locale.hr]: "HR",
  [Locale.it]: "IT",
  [Locale.ja]: "JA",
  [Locale.nl]: "NL",
  [Locale.pl]: "PL",
  [Locale.tr]: "TR",
  [Locale.zh]: "ZH",
};

const datasetRoot = path.join(process.cwd(), "datasets");
const defaultPath = path.join(datasetRoot, "_archiv", "biblioteca_piezas.xlsx");

const CREATE_MISSING = process.env.CREATE_MISSING === "1";
const UPDATE_EXISTING = process.env.UPDATE_EXISTING === "1";
const PARTS_XLSX_PATH = process.env.PARTS_XLSX_PATH ?? defaultPath;

type TranslationStats = {
  created: number;
  updated: number;
  skippedSame: number;
  skippedEmpty: number;
};

type SkipStats = {
  missingBaseSystem: number;
  missingBaseGroup: number;
  missingBaseCategory: number;
  missingBaseElement: number;
  systemNotFoundByName: number;
  groupNotFoundByName: number;
  categoryNotFoundByName: number;
  elementNotFoundByName: number;
  legacyIdNotFound: number;
  mismatchLegacyVsChain: number;
};

type MissingSample = Map<string, number>;
type MissingRow = {
  rowIndex: number;
  system: string;
  group: string;
  category: string;
  element: string;
  details: string;
};

type TranslationCache = Map<string, string>;

type EntityMaps = {
  systemIdByKey: Map<string, string>;
  groupIdByKey: Map<string, string>;
  categoryIdByKey: Map<string, string>;
  elementIdByKey: Map<string, string>;
  elementByLegacyId: Map<string, { id: string; categoryId: string }>;
  groupById: Map<string, { id: string; systemId: string }>;
  categoryById: Map<string, { id: string; groupId: string; systemId: string }>;
  elementById: Map<
    string,
    { id: string; categoryId: string; groupId: string | null; systemId: string | null }
  >;
};

function maskDatabaseUrl(value: string | undefined) {
  if (!value) return "not set";
  return value.replace(/\/\/([^:/]+):([^@]+)@/g, "//$1:***@");
}

function normalizeKey(value: string | undefined): string {
  if (!value) return "";
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
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

function getRowValue(row: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const direct = row[key];
    if (direct !== undefined && direct !== null && String(direct).trim()) {
      return String(direct).trim();
    }
  }
  const loweredKeys = keys.map((key) => key.toLowerCase());
  for (const [rowKey, value] of Object.entries(row)) {
    const normalized = rowKey.toLowerCase();
    if (loweredKeys.some((key) => normalized.includes(key))) {
      if (value !== undefined && value !== null && String(value).trim()) {
        return String(value).trim();
      }
    }
  }
  return "";
}

function systemColumns(prefix: string) {
  if (prefix === "ES") {
    return [
      "ES_Sistemas automotrices",
      "ES_Sistemas_automotrices",
      "ES_automotive systems",
      "ES_automotive_systems",
      "ES_System",
    ];
  }
  if (prefix === "DE") {
    return [
      "DE_Automobilsysteme",
      "DE_automotive systems",
      "DE_automotive_systems",
      "DE_System",
    ];
  }
  return [
    `${prefix}_automotive systems`,
    `${prefix}_automotive_systems`,
    `${prefix}_System`,
  ];
}

function groupColumns(prefix: string) {
  return [`${prefix}_Groups`, `${prefix}_Group`];
}

function categoryColumns(prefix: string) {
  return [`${prefix}_Category`];
}

function elementColumns(prefix: string) {
  return [`${prefix}_Element`];
}

function getBaseName(
  row: Record<string, unknown>,
  type: "system" | "group" | "category" | "element"
) {
  const fetch = (prefix: string) => {
    if (type === "system") return getRowValue(row, systemColumns(prefix));
    if (type === "group") return getRowValue(row, groupColumns(prefix));
    if (type === "category") return getRowValue(row, categoryColumns(prefix));
    return getRowValue(row, elementColumns(prefix));
  };
  return fetch("EN") || fetch("ES") || fetch("DE");
}

function getLocaleName(
  row: Record<string, unknown>,
  locale: Locale,
  type: "system" | "group" | "category" | "element"
) {
  const prefix = LOCALE_PREFIX[locale];
  if (type === "system") return getRowValue(row, systemColumns(prefix));
  if (type === "group") return getRowValue(row, groupColumns(prefix));
  if (type === "category") return getRowValue(row, categoryColumns(prefix));
  return getRowValue(row, elementColumns(prefix));
}

function getLegacyId(row: Record<string, unknown>) {
  return getRowValue(row, [
    "ID",
    "id",
    "Element ID",
    "Element_ID",
    "ID Element",
    "ID_Element",
    "ElementId",
    "ElementID",
    "Legacy ID",
    "Legacy_ID",
    "LegacyId",
  ]);
}

function bumpSample(map: MissingSample, key: string) {
  map.set(key, (map.get(key) ?? 0) + 1);
}

function csvEscape(value: string) {
  const text = value ?? "";
  if (text.includes(",") || text.includes("\"") || text.includes("\n")) {
    return `"${text.replace(/\"/g, "\"\"")}"`;
  }
  return text;
}

async function writeCsv(filePath: string, rows: MissingRow[]) {
  if (!rows.length) return;
  const header = ["rowIndex", "system", "group", "category", "element", "details"];
  const lines = [header.join(",")];
  for (const row of rows) {
    lines.push(
      [
        row.rowIndex,
        csvEscape(row.system),
        csvEscape(row.group),
        csvEscape(row.category),
        csvEscape(row.element),
        csvEscape(row.details),
      ].join(",")
    );
  }
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, lines.join("\n"), "utf8");
}

async function fileExists(filePath: string) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function resolveByLocales<T>(
  locales: Locale[],
  fn: (locale: Locale) => T | undefined
) {
  for (const locale of locales) {
    const value = fn(locale);
    if (value) return value;
  }
  return undefined;
}

function addTranslationCache(
  cache: TranslationCache,
  key: string,
  value: string
) {
  cache.set(key, value);
}

function buildMaps(
  systems: Array<{ id: string; key: string }>,
  groups: Array<{ id: string; key: string; systemId: string }>,
  categories: Array<{ id: string; key: string; groupId: string; systemId: string | null }>,
  elements: Array<{
    id: string;
    key: string;
    categoryId: string;
    groupId: string | null;
    systemId: string | null;
    legacyId: string | null;
  }>
): EntityMaps {
  const systemIdByKey = new Map(systems.map((row) => [row.key, row.id]));
  const groupIdByKey = new Map(
    groups.map((row) => [`${row.systemId}|${row.key}`, row.id])
  );
  const categoryIdByKey = new Map(
    categories.map((row) => [`${row.groupId}|${row.key}`, row.id])
  );
  const elementIdByKey = new Map(elements.map((row) => [row.key, row.id]));
  const elementByLegacyId = new Map(
    elements
      .filter((row) => row.legacyId)
      .map((row) => [row.legacyId as string, { id: row.id, categoryId: row.categoryId }])
  );
  const groupById = new Map(groups.map((row) => [row.id, row]));
  const categoryById = new Map(categories.map((row) => [row.id, row]));
  const elementById = new Map(elements.map((row) => [row.id, row]));

  return {
    systemIdByKey,
    groupIdByKey,
    categoryIdByKey,
    elementIdByKey,
    elementByLegacyId,
    groupById,
    categoryById,
    elementById,
  };
}

async function main() {
  console.log(`DATABASE_URL: ${maskDatabaseUrl(process.env.DATABASE_URL)}`);
  const [dbInfo] = await prisma.$queryRaw<
    { db: string; schema: string }[]
  >`SELECT current_database() as db, current_schema() as schema`;
  console.log(`DB: ${dbInfo?.db ?? "unknown"} Schema: ${dbInfo?.schema ?? "unknown"}`);

  if (!(await fileExists(PARTS_XLSX_PATH))) {
    throw new Error(`Parts Excel not found at ${PARTS_XLSX_PATH}`);
  }

  const workbook = xlsx.readFile(PARTS_XLSX_PATH);
  const sheet = workbook.Sheets["00_DATA"] ?? workbook.Sheets[workbook.SheetNames[0]];
  const rows = xlsx.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: "",
  });

  console.log(`Excel path: ${PARTS_XLSX_PATH}`);
  console.log(`Rows parsed: ${rows.length}`);
  if (rows.length) {
    console.log(`Headers sample: ${Object.keys(rows[0]).slice(0, 12).join(", ")}`);
  }

  const localesToImport = UPDATE_EXISTING
    ? [...TARGET_LOCALES, ...BASE_LOCALES]
    : TARGET_LOCALES;

  const beforeCounts = await Promise.all([
    prisma.partSystemTranslation.count(),
    prisma.partGroupTranslation.count(),
    prisma.partCategoryTranslation.count(),
    prisma.partElementTranslation.count(),
  ]);
  console.log(
    `Before counts -> system:${beforeCounts[0]} group:${beforeCounts[1]} category:${beforeCounts[2]} element:${beforeCounts[3]}`
  );

  const systems = await prisma.partSystem.findMany({
    select: { id: true, key: true },
  });
  const groups = await prisma.partGroup.findMany({
    select: { id: true, key: true, systemId: true },
  });
  const categories = await prisma.partCategory.findMany({
    select: { id: true, key: true, groupId: true, systemId: true },
  });
  const elements = await prisma.partElement.findMany({
    select: { id: true, key: true, categoryId: true, groupId: true, systemId: true, legacyId: true },
  });

  const entityMaps = buildMaps(systems, groups, categories, elements);

  const systemTranslations = await prisma.partSystemTranslation.findMany({
    where: { locale: { in: BASE_LOCALES } },
    select: { systemId: true, locale: true, name: true },
  });
  const groupTranslations = await prisma.partGroupTranslation.findMany({
    where: { locale: { in: BASE_LOCALES } },
    select: { groupId: true, locale: true, name: true },
  });
  const categoryTranslations = await prisma.partCategoryTranslation.findMany({
    where: { locale: { in: BASE_LOCALES } },
    select: { categoryId: true, locale: true, name: true },
  });
  const elementTranslations = await prisma.partElementTranslation.findMany({
    where: { locale: { in: BASE_LOCALES } },
    select: { elementId: true, locale: true, name: true },
  });

  const systemIdByLocaleName = new Map<string, string>();
  for (const row of systemTranslations) {
    const key = `${row.locale}|${normalizeName(row.name)}`;
    if (!systemIdByLocaleName.has(key)) {
      systemIdByLocaleName.set(key, row.systemId);
    }
  }

  const groupIdBySystemLocaleName = new Map<string, string>();
  for (const row of groupTranslations) {
    const group = entityMaps.groupById.get(row.groupId);
    if (!group) continue;
    const key = `${group.systemId}|${row.locale}|${normalizeName(row.name)}`;
    if (!groupIdBySystemLocaleName.has(key)) {
      groupIdBySystemLocaleName.set(key, row.groupId);
    }
  }

  const categoryIdByGroupLocaleName = new Map<string, string>();
  for (const row of categoryTranslations) {
    const category = entityMaps.categoryById.get(row.categoryId);
    if (!category) continue;
    const key = `${category.groupId}|${row.locale}|${normalizeName(row.name)}`;
    if (!categoryIdByGroupLocaleName.has(key)) {
      categoryIdByGroupLocaleName.set(key, row.categoryId);
    }
  }

  const elementIdByCategoryLocaleName = new Map<string, string>();
  for (const row of elementTranslations) {
    const element = entityMaps.elementById.get(row.elementId);
    if (!element) continue;
    const key = `${element.categoryId}|${row.locale}|${normalizeName(row.name)}`;
    if (!elementIdByCategoryLocaleName.has(key)) {
      elementIdByCategoryLocaleName.set(key, row.elementId);
    }
  }

  const systemTranslationCache: TranslationCache = new Map();
  const groupTranslationCache: TranslationCache = new Map();
  const categoryTranslationCache: TranslationCache = new Map();
  const elementTranslationCache: TranslationCache = new Map();

  const existingSystemTranslations = await prisma.partSystemTranslation.findMany({
    where: { locale: { in: localesToImport } },
    select: { systemId: true, locale: true, name: true },
  });
  for (const row of existingSystemTranslations) {
    addTranslationCache(systemTranslationCache, `${row.systemId}|${row.locale}`, row.name);
  }

  const existingGroupTranslations = await prisma.partGroupTranslation.findMany({
    where: { locale: { in: localesToImport } },
    select: { groupId: true, locale: true, name: true },
  });
  for (const row of existingGroupTranslations) {
    addTranslationCache(groupTranslationCache, `${row.groupId}|${row.locale}`, row.name);
  }

  const existingCategoryTranslations = await prisma.partCategoryTranslation.findMany({
    where: { locale: { in: localesToImport } },
    select: { categoryId: true, locale: true, name: true },
  });
  for (const row of existingCategoryTranslations) {
    addTranslationCache(
      categoryTranslationCache,
      `${row.categoryId}|${row.locale}`,
      row.name
    );
  }

  const existingElementTranslations = await prisma.partElementTranslation.findMany({
    where: { locale: { in: localesToImport } },
    select: { elementId: true, locale: true, name: true },
  });
  for (const row of existingElementTranslations) {
    addTranslationCache(elementTranslationCache, `${row.elementId}|${row.locale}`, row.name);
  }

  const systemStats: TranslationStats = {
    created: 0,
    updated: 0,
    skippedSame: 0,
    skippedEmpty: 0,
  };
  const groupStats: TranslationStats = {
    created: 0,
    updated: 0,
    skippedSame: 0,
    skippedEmpty: 0,
  };
  const categoryStats: TranslationStats = {
    created: 0,
    updated: 0,
    skippedSame: 0,
    skippedEmpty: 0,
  };
  const elementStats: TranslationStats = {
    created: 0,
    updated: 0,
    skippedSame: 0,
    skippedEmpty: 0,
  };

  const skipStats: SkipStats = {
    missingBaseSystem: 0,
    missingBaseGroup: 0,
    missingBaseCategory: 0,
    missingBaseElement: 0,
    systemNotFoundByName: 0,
    groupNotFoundByName: 0,
    categoryNotFoundByName: 0,
    elementNotFoundByName: 0,
    legacyIdNotFound: 0,
    mismatchLegacyVsChain: 0,
  };

  const missingSystems: MissingSample = new Map();
  const missingGroups: MissingSample = new Map();
  const missingCategories: MissingSample = new Map();
  const missingElements: MissingSample = new Map();
  const missingLegacyIds: MissingSample = new Map();
  const legacyMismatchSamples: MissingSample = new Map();
  const missingSystemRows: MissingRow[] = [];
  const missingGroupRows: MissingRow[] = [];
  const missingCategoryRows: MissingRow[] = [];
  const missingElementRows: MissingRow[] = [];
  const legacyMismatchRows: MissingRow[] = [];
  const legacyMissingRows: MissingRow[] = [];

  const examples: string[] = [];

  const baseLocalesInOrder = BASE_LOCALES;

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    const systemBase = getBaseName(row, "system");
    const groupBase = getBaseName(row, "group");
    const categoryBase = getBaseName(row, "category");
    const elementBase = getBaseName(row, "element");

    if (!systemBase) {
      skipStats.missingBaseSystem += 1;
      continue;
    }
    if (!groupBase) {
      skipStats.missingBaseGroup += 1;
      continue;
    }
    if (!categoryBase) {
      skipStats.missingBaseCategory += 1;
      continue;
    }
    if (!elementBase) {
      skipStats.missingBaseElement += 1;
    }

    const systemId = resolveByLocales(baseLocalesInOrder, (locale) => {
      const name = getLocaleName(row, locale, "system");
      if (!name) return undefined;
      return systemIdByLocaleName.get(`${locale}|${normalizeName(name)}`);
    });

    if (!systemId) {
      skipStats.systemNotFoundByName += 1;
      bumpSample(missingSystems, systemBase);
      missingSystemRows.push({
        rowIndex: index + 2,
        system: systemBase,
        group: groupBase,
        category: categoryBase,
        element: elementBase ?? "",
        details: "systemNotFoundByName",
      });
      if (!CREATE_MISSING) {
        continue;
      }
    }

    let resolvedSystemId = systemId;
    if (!resolvedSystemId && CREATE_MISSING) {
      const systemKey = normalizeKey(systemBase);
      const created = await prisma.partSystem.create({
        data: { key: systemKey },
      });
      resolvedSystemId = created.id;
      entityMaps.systemIdByKey.set(systemKey, created.id);
      for (const locale of BASE_LOCALES) {
        const name = getLocaleName(row, locale, "system");
        if (!name) continue;
        await prisma.partSystemTranslation.upsert({
          where: { systemId_locale: { systemId: created.id, locale } },
          update: { name },
          create: { systemId: created.id, locale, name },
        });
        systemIdByLocaleName.set(`${locale}|${normalizeName(name)}`, created.id);
      }
    }

    if (!resolvedSystemId) {
      continue;
    }

    const groupId = resolveByLocales(baseLocalesInOrder, (locale) => {
      const name = getLocaleName(row, locale, "group");
      if (!name) return undefined;
      return groupIdBySystemLocaleName.get(
        `${resolvedSystemId}|${locale}|${normalizeName(name)}`
      );
    });

    if (!groupId) {
      skipStats.groupNotFoundByName += 1;
      bumpSample(missingGroups, `${resolvedSystemId}|${groupBase}`);
      missingGroupRows.push({
        rowIndex: index + 2,
        system: systemBase,
        group: groupBase,
        category: categoryBase,
        element: elementBase ?? "",
        details: `groupNotFoundByName|systemId:${resolvedSystemId}`,
      });
      if (!CREATE_MISSING) {
        continue;
      }
    }

    let resolvedGroupId = groupId;
    if (!resolvedGroupId && CREATE_MISSING) {
      const groupKey = normalizeKey(groupBase);
      const created = await prisma.partGroup.create({
        data: { key: groupKey, systemId: resolvedSystemId },
      });
      resolvedGroupId = created.id;
      entityMaps.groupById.set(created.id, created);
      for (const locale of BASE_LOCALES) {
        const name = getLocaleName(row, locale, "group");
        if (!name) continue;
        await prisma.partGroupTranslation.upsert({
          where: { groupId_locale: { groupId: created.id, locale } },
          update: { name },
          create: { groupId: created.id, locale, name },
        });
        groupIdBySystemLocaleName.set(
          `${resolvedSystemId}|${locale}|${normalizeName(name)}`,
          created.id
        );
      }
    }

    if (!resolvedGroupId) {
      continue;
    }

    const categoryId = resolveByLocales(baseLocalesInOrder, (locale) => {
      const name = getLocaleName(row, locale, "category");
      if (!name) return undefined;
      return categoryIdByGroupLocaleName.get(
        `${resolvedGroupId}|${locale}|${normalizeName(name)}`
      );
    });

    if (!categoryId) {
      skipStats.categoryNotFoundByName += 1;
      bumpSample(missingCategories, `${resolvedGroupId}|${categoryBase}`);
      missingCategoryRows.push({
        rowIndex: index + 2,
        system: systemBase,
        group: groupBase,
        category: categoryBase,
        element: elementBase ?? "",
        details: `categoryNotFoundByName|groupId:${resolvedGroupId}`,
      });
      if (!CREATE_MISSING) {
        continue;
      }
    }

    let resolvedCategoryId = categoryId;
    if (!resolvedCategoryId && CREATE_MISSING) {
      const categoryKey = normalizeKey(categoryBase);
      const created = await prisma.partCategory.create({
        data: {
          key: categoryKey,
          name: categoryBase,
          groupId: resolvedGroupId,
          systemId: resolvedSystemId,
        },
      });
      resolvedCategoryId = created.id;
      entityMaps.categoryById.set(created.id, created);
      for (const locale of BASE_LOCALES) {
        const name = getLocaleName(row, locale, "category");
        if (!name) continue;
        await prisma.partCategoryTranslation.upsert({
          where: { categoryId_locale: { categoryId: created.id, locale } },
          update: { name },
          create: { categoryId: created.id, locale, name },
        });
        categoryIdByGroupLocaleName.set(
          `${resolvedGroupId}|${locale}|${normalizeName(name)}`,
          created.id
        );
      }
    }

    if (!resolvedCategoryId) {
      continue;
    }

    const legacyId = getLegacyId(row);
    let resolvedElementId = resolveByLocales(baseLocalesInOrder, (locale) => {
      const name = getLocaleName(row, locale, "element");
      if (!name) return undefined;
      return elementIdByCategoryLocaleName.get(
        `${resolvedCategoryId}|${locale}|${normalizeName(name)}`
      );
    });

    if (!resolvedElementId && legacyId) {
      const element = entityMaps.elementByLegacyId.get(legacyId);
      if (element) {
        if (element.categoryId !== resolvedCategoryId) {
          skipStats.mismatchLegacyVsChain += 1;
          bumpSample(
            legacyMismatchSamples,
            `${legacyId}|${resolvedCategoryId}|${element.categoryId}`
          );
          legacyMismatchRows.push({
            rowIndex: index + 2,
            system: systemBase,
            group: groupBase,
            category: categoryBase,
            element: elementBase ?? "",
            details: `legacyMismatch|legacyId:${legacyId}|expectedCategory:${resolvedCategoryId}|actualCategory:${element.categoryId}`,
          });
        } else {
          resolvedElementId = element.id;
        }
      } else {
        skipStats.legacyIdNotFound += 1;
        bumpSample(missingLegacyIds, legacyId);
        legacyMissingRows.push({
          rowIndex: index + 2,
          system: systemBase,
          group: groupBase,
          category: categoryBase,
          element: elementBase ?? "",
          details: `legacyIdNotFound|legacyId:${legacyId}`,
        });
      }
    }

    if (!resolvedElementId && elementBase) {
      skipStats.elementNotFoundByName += 1;
      bumpSample(missingElements, `${resolvedCategoryId}|${elementBase}`);
      missingElementRows.push({
        rowIndex: index + 2,
        system: systemBase,
        group: groupBase,
        category: categoryBase,
        element: elementBase ?? "",
        details: `elementNotFoundByName|categoryId:${resolvedCategoryId}`,
      });
      if (!CREATE_MISSING) {
        resolvedElementId = undefined;
      }
    }

    if (!resolvedElementId && CREATE_MISSING && elementBase) {
      const categoryKey = normalizeKey(categoryBase);
      const elementKey = legacyId?.trim()
        ? legacyId.trim()
        : `${categoryKey}-${normalizeKey(elementBase)}`;
      const created = await prisma.partElement.create({
        data: {
          key: elementKey,
          categoryId: resolvedCategoryId,
          systemId: resolvedSystemId,
          groupId: resolvedGroupId,
          legacyId: legacyId || null,
        },
      });
      resolvedElementId = created.id;
      entityMaps.elementById.set(created.id, created);
      entityMaps.elementIdByKey.set(elementKey, created.id);
      if (legacyId) {
        entityMaps.elementByLegacyId.set(legacyId, {
          id: created.id,
          categoryId: resolvedCategoryId,
        });
      }
      for (const locale of BASE_LOCALES) {
        const name = getLocaleName(row, locale, "element");
        if (!name) continue;
        await prisma.partElementTranslation.upsert({
          where: { elementId_locale: { elementId: created.id, locale } },
          update: { name },
          create: { elementId: created.id, locale, name },
        });
        elementIdByCategoryLocaleName.set(
          `${resolvedCategoryId}|${locale}|${normalizeName(name)}`,
          created.id
        );
      }
    }

    const ops: Prisma.PrismaPromise<unknown>[] = [];

    for (const locale of localesToImport) {
      const systemName = getLocaleName(row, locale, "system");
      if (systemName) {
        const key = `${resolvedSystemId}|${locale}`;
        const existing = systemTranslationCache.get(key);
        if (!existing) {
          systemStats.created += 1;
          addTranslationCache(systemTranslationCache, key, systemName);
          ops.push(
            prisma.partSystemTranslation.upsert({
              where: { systemId_locale: { systemId: resolvedSystemId, locale } },
              update: { name: systemName },
              create: { systemId: resolvedSystemId, locale, name: systemName },
            })
          );
        } else if (existing !== systemName) {
          systemStats.updated += 1;
          addTranslationCache(systemTranslationCache, key, systemName);
          ops.push(
            prisma.partSystemTranslation.upsert({
              where: { systemId_locale: { systemId: resolvedSystemId, locale } },
              update: { name: systemName },
              create: { systemId: resolvedSystemId, locale, name: systemName },
            })
          );
        } else {
          systemStats.skippedSame += 1;
        }
      } else {
        systemStats.skippedEmpty += 1;
      }

      const groupName = getLocaleName(row, locale, "group");
      if (groupName) {
        const key = `${resolvedGroupId}|${locale}`;
        const existing = groupTranslationCache.get(key);
        if (!existing) {
          groupStats.created += 1;
          addTranslationCache(groupTranslationCache, key, groupName);
          ops.push(
            prisma.partGroupTranslation.upsert({
              where: { groupId_locale: { groupId: resolvedGroupId, locale } },
              update: { name: groupName },
              create: { groupId: resolvedGroupId, locale, name: groupName },
            })
          );
        } else if (existing !== groupName) {
          groupStats.updated += 1;
          addTranslationCache(groupTranslationCache, key, groupName);
          ops.push(
            prisma.partGroupTranslation.upsert({
              where: { groupId_locale: { groupId: resolvedGroupId, locale } },
              update: { name: groupName },
              create: { groupId: resolvedGroupId, locale, name: groupName },
            })
          );
        } else {
          groupStats.skippedSame += 1;
        }
      } else {
        groupStats.skippedEmpty += 1;
      }

      const categoryName = getLocaleName(row, locale, "category");
      if (categoryName) {
        const key = `${resolvedCategoryId}|${locale}`;
        const existing = categoryTranslationCache.get(key);
        if (!existing) {
          categoryStats.created += 1;
          addTranslationCache(categoryTranslationCache, key, categoryName);
          ops.push(
            prisma.partCategoryTranslation.upsert({
              where: { categoryId_locale: { categoryId: resolvedCategoryId, locale } },
              update: { name: categoryName },
              create: { categoryId: resolvedCategoryId, locale, name: categoryName },
            })
          );
        } else if (existing !== categoryName) {
          categoryStats.updated += 1;
          addTranslationCache(categoryTranslationCache, key, categoryName);
          ops.push(
            prisma.partCategoryTranslation.upsert({
              where: { categoryId_locale: { categoryId: resolvedCategoryId, locale } },
              update: { name: categoryName },
              create: { categoryId: resolvedCategoryId, locale, name: categoryName },
            })
          );
        } else {
          categoryStats.skippedSame += 1;
        }
      } else {
        categoryStats.skippedEmpty += 1;
      }

      if (resolvedElementId) {
        const elementName = getLocaleName(row, locale, "element");
        if (elementName) {
          const key = `${resolvedElementId}|${locale}`;
          const existing = elementTranslationCache.get(key);
          if (!existing) {
            elementStats.created += 1;
            addTranslationCache(elementTranslationCache, key, elementName);
            ops.push(
              prisma.partElementTranslation.upsert({
                where: { elementId_locale: { elementId: resolvedElementId, locale } },
                update: { name: elementName },
                create: { elementId: resolvedElementId, locale, name: elementName },
              })
            );
          } else if (existing !== elementName) {
            elementStats.updated += 1;
            addTranslationCache(elementTranslationCache, key, elementName);
            ops.push(
              prisma.partElementTranslation.upsert({
                where: { elementId_locale: { elementId: resolvedElementId, locale } },
                update: { name: elementName },
                create: { elementId: resolvedElementId, locale, name: elementName },
              })
            );
          } else {
            elementStats.skippedSame += 1;
          }
        } else {
          elementStats.skippedEmpty += 1;
        }
      }
    }

    if (ops.length) {
      await prisma.$transaction(ops);
      if (examples.length < 3) {
        examples.push(
          `${systemBase} -> ${groupBase} -> ${categoryBase} -> ${elementBase || "no-element"}`
        );
      }
    }
  }

  const afterCounts = await Promise.all([
    prisma.partSystemTranslation.count(),
    prisma.partGroupTranslation.count(),
    prisma.partCategoryTranslation.count(),
    prisma.partElementTranslation.count(),
  ]);
  console.log(
    `After counts -> system:${afterCounts[0]} group:${afterCounts[1]} category:${afterCounts[2]} element:${afterCounts[3]}`
  );

  console.log("Summary:");
  console.log(
    `PartSystemTranslation created:${systemStats.created} updated:${systemStats.updated} skippedSame:${systemStats.skippedSame} empty:${systemStats.skippedEmpty}`
  );
  console.log(
    `PartGroupTranslation created:${groupStats.created} updated:${groupStats.updated} skippedSame:${groupStats.skippedSame} empty:${groupStats.skippedEmpty}`
  );
  console.log(
    `PartCategoryTranslation created:${categoryStats.created} updated:${categoryStats.updated} skippedSame:${categoryStats.skippedSame} empty:${categoryStats.skippedEmpty}`
  );
  console.log(
    `PartElementTranslation created:${elementStats.created} updated:${elementStats.updated} skippedSame:${elementStats.skippedSame} empty:${elementStats.skippedEmpty}`
  );

  console.log(
    `Skipped rows -> missingBaseSystem:${skipStats.missingBaseSystem} missingBaseGroup:${skipStats.missingBaseGroup} missingBaseCategory:${skipStats.missingBaseCategory} missingBaseElement:${skipStats.missingBaseElement}`
  );
  console.log(
    `Not found -> system:${skipStats.systemNotFoundByName} group:${skipStats.groupNotFoundByName} category:${skipStats.categoryNotFoundByName} element:${skipStats.elementNotFoundByName} legacyIdMissing:${skipStats.legacyIdNotFound} legacyMismatch:${skipStats.mismatchLegacyVsChain}`
  );

  const renderSample = (label: string, sample: MissingSample) => {
    if (!sample.size) return;
    const items = Array.from(sample.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([key, count]) => `${key} (${count})`);
    console.log(`${label} (top 20): ${items.join(", ")}`);
  };

  renderSample("Missing systems (by name)", missingSystems);
  renderSample("Missing groups (by name)", missingGroups);
  renderSample("Missing categories (by name)", missingCategories);
  renderSample("Missing elements (by name)", missingElements);
  renderSample("Legacy IDs not found", missingLegacyIds);
  renderSample("Legacy ID mismatch vs chain", legacyMismatchSamples);

  if (examples.length) {
    console.log(`Examples: ${examples.join(" | ")}`);
  }

  const reportDir = path.join(datasetRoot, "_cache");
  await writeCsv(path.join(reportDir, "import-missing-systems.csv"), missingSystemRows);
  await writeCsv(path.join(reportDir, "import-missing-groups.csv"), missingGroupRows);
  await writeCsv(
    path.join(reportDir, "import-missing-categories.csv"),
    missingCategoryRows
  );
  await writeCsv(path.join(reportDir, "import-missing-elements.csv"), missingElementRows);
  await writeCsv(path.join(reportDir, "import-legacy-mismatch.csv"), legacyMismatchRows);
  await writeCsv(path.join(reportDir, "import-legacy-missing.csv"), legacyMissingRows);
  console.log(`Reports written to ${reportDir}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
