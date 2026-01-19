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

const LOCALE_ALIASES: Record<string, Locale> = {
  ar: Locale.ar,
  arabic: Locale.ar,
  de: Locale.de,
  deutsch: Locale.de,
  en: Locale.en,
  english: Locale.en,
  es: Locale.es,
  espanol: Locale.es,
  fr: Locale.fr,
  french: Locale.fr,
  hr: Locale.hr,
  hrvatski: Locale.hr,
  it: Locale.it,
  italiano: Locale.it,
  ja: Locale.ja,
  japanese: Locale.ja,
  nl: Locale.nl,
  nederlands: Locale.nl,
  pl: Locale.pl,
  polski: Locale.pl,
  tr: Locale.tr,
  turkce: Locale.tr,
  zh: Locale.zh,
  chinese: Locale.zh,
};

const datasetRoot = path.join(process.cwd(), "datasets");
const defaultPath = path.join(datasetRoot, "parts", "biblioteca_piezas.tsv");
const fallbackPath = path.join(process.cwd(), "biblioteca_piezas.tsv");

const TSV_SOURCE_HINT = "human";
const MISSING_HINT = "missing";

type Row = Record<string, string>;

type EntityStats = {
  created: number;
  updated: number;
  skipped: number;
  cleared: number;
  missing: number;
};

type EntityCaches = {
  systemIdByKey: Map<string, string>;
  groupIdByKey: Map<string, string>;
  categoryIdByKey: Map<string, string>;
  elementIdByKey: Map<string, string>;
};

type TranslationCache = Map<string, string>;

function normalizeKey(value: string | undefined) {
  if (!value) return "";
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function normalizeText(value: string | undefined) {
  if (!value) return "";
  return value.replace(/\s+/g, " ").trim();
}

function parseTsvLine(line: string) {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === "\"") {
      if (inQuotes && line[i + 1] === "\"") {
        current += "\"";
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (char === "\t" && !inQuotes) {
      cells.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  cells.push(current);
  return cells;
}

async function parseTsv(filePath: string): Promise<Row[]> {
  const content = await fs.readFile(filePath, "utf8");
  const lines = content.split(/\r?\n/).filter((line) => line.trim());
  if (!lines.length) return [];
  const headers = parseTsvLine(lines[0]).map((header) => header.trim());
  const rows: Row[] = [];
  for (let i = 1; i < lines.length; i += 1) {
    const values = parseTsvLine(lines[i]);
    const row: Row = {};
    for (let c = 0; c < headers.length; c += 1) {
      row[headers[c]] = values[c] ?? "";
    }
    rows.push(row);
  }
  return rows;
}

function detectLocale(header: string) {
  const normalized = header.trim().toLowerCase();
  if (LOCALE_ALIASES[normalized]) return LOCALE_ALIASES[normalized];
  return null;
}

function pickColumn(row: Row, keys: string[]) {
  for (const key of keys) {
    const value = row[key];
    if (value && value.trim()) return value.trim();
  }
  const loweredKeys = keys.map((key) => key.toLowerCase());
  for (const [rowKey, value] of Object.entries(row)) {
    const normalized = rowKey.toLowerCase();
    if (loweredKeys.some((key) => normalized.includes(key))) {
      if (value && value.trim()) return value.trim();
    }
  }
  return "";
}

function systemColumns(locale: string) {
  if (locale === "ES") {
    return [
      "ES_Sistemas automotrices",
      "ES_Sistemas_automotrices",
      "ES_System",
      "ES_automotive systems",
    ];
  }
  if (locale === "DE") {
    return ["DE_Automobilsysteme", "DE_System", "DE_automotive systems"];
  }
  return [`${locale}_automotive systems`, `${locale}_System`, `${locale}_Systems`];
}

function groupColumns(locale: string) {
  return [`${locale}_Groups`, `${locale}_Group`];
}

function categoryColumns(locale: string) {
  return [`${locale}_Category`];
}

function elementColumns(locale: string) {
  return [`${locale}_Element`];
}

function getLocaleValue(row: Row, locale: Locale, type: "system" | "group" | "category" | "element") {
  const prefix = locale.toUpperCase();
  if (type === "system") return pickColumn(row, systemColumns(prefix));
  if (type === "group") return pickColumn(row, groupColumns(prefix));
  if (type === "category") return pickColumn(row, categoryColumns(prefix));
  return pickColumn(row, elementColumns(prefix));
}

function isPlaceholder(name: string | null | undefined, confidenceHint: string | null | undefined) {
  if (!name || !name.trim()) return true;
  if (name === "Loading...") return true;
  if (!confidenceHint) return false;
  return ["missing", "auto", "fallback_en", "missing_translation"].includes(
    confidenceHint
  );
}

async function loadCaches(): Promise<EntityCaches> {
  const systems = await prisma.partSystem.findMany({
    select: { id: true, key: true },
  });
  const groups = await prisma.partGroup.findMany({
    select: { id: true, key: true, systemId: true },
  });
  const categories = await prisma.partCategory.findMany({
    select: { id: true, key: true, groupId: true },
  });
  const elements = await prisma.partElement.findMany({
    select: { id: true, key: true },
  });

  return {
    systemIdByKey: new Map(systems.map((row) => [row.key, row.id])),
    groupIdByKey: new Map(groups.map((row) => [`${row.systemId}|${row.key}`, row.id])),
    categoryIdByKey: new Map(categories.map((row) => [`${row.groupId}|${row.key}`, row.id])),
    elementIdByKey: new Map(elements.map((row) => [row.key, row.id])),
  };
}

async function main() {
  const filePath = process.env.PARTS_TSV_PATH ?? defaultPath;
  const tsvPath = (await fs
    .access(filePath)
    .then(() => filePath)
    .catch(() => fallbackPath));

  const rows = await parseTsv(tsvPath);
  console.log(`TSV: ${tsvPath}`);
  console.log(`Rows: ${rows.length}`);
  if (!rows.length) return;

  const caches = await loadCaches();
  const stats: Record<string, EntityStats> = {
    system: { created: 0, updated: 0, skipped: 0, cleared: 0, missing: 0 },
    group: { created: 0, updated: 0, skipped: 0, cleared: 0, missing: 0 },
    category: { created: 0, updated: 0, skipped: 0, cleared: 0, missing: 0 },
    element: { created: 0, updated: 0, skipped: 0, cleared: 0, missing: 0 },
  };

  const loadedSet: Record<string, Set<string>> = {
    system: new Set(),
    group: new Set(),
    category: new Set(),
    element: new Set(),
  };

  for (const row of rows) {
    const systemBase =
      getLocaleValue(row, Locale.en, "system") ||
      getLocaleValue(row, Locale.es, "system") ||
      getLocaleValue(row, Locale.de, "system");
    const groupBase =
      getLocaleValue(row, Locale.en, "group") ||
      getLocaleValue(row, Locale.es, "group") ||
      getLocaleValue(row, Locale.de, "group");
    const categoryBase =
      getLocaleValue(row, Locale.en, "category") ||
      getLocaleValue(row, Locale.es, "category") ||
      getLocaleValue(row, Locale.de, "category");
    const elementBase =
      getLocaleValue(row, Locale.en, "element") ||
      getLocaleValue(row, Locale.es, "element") ||
      getLocaleValue(row, Locale.de, "element");

    if (!systemBase || !groupBase || !categoryBase || !elementBase) {
      stats.system.missing += 1;
      continue;
    }

    const systemKey = normalizeKey(systemBase);
    const groupKey = normalizeKey(`${systemKey}__${groupBase}`);
    const categoryKey = normalizeKey(`${systemKey}__${groupKey}__${categoryBase}`);
    const elementKey = normalizeKey(
      `${systemKey}__${groupKey}__${categoryKey}__${elementBase}`
    );

    let systemId = caches.systemIdByKey.get(systemKey);
    if (!systemId) {
      const created = await prisma.partSystem.create({
        data: { key: systemKey },
      });
      systemId = created.id;
      caches.systemIdByKey.set(systemKey, systemId);
      stats.system.created += 1;
    }

    let groupId = caches.groupIdByKey.get(`${systemId}|${groupKey}`);
    if (!groupId) {
      const created = await prisma.partGroup.create({
        data: { key: groupKey, systemId },
      });
      groupId = created.id;
      caches.groupIdByKey.set(`${systemId}|${groupKey}`, groupId);
      stats.group.created += 1;
    }

    let categoryId = caches.categoryIdByKey.get(`${groupId}|${categoryKey}`);
    if (!categoryId) {
      const created = await prisma.partCategory.create({
        data: { key: categoryKey, name: categoryBase, groupId, systemId },
      });
      categoryId = created.id;
      caches.categoryIdByKey.set(`${groupId}|${categoryKey}`, categoryId);
      stats.category.created += 1;
    }

    let elementId = caches.elementIdByKey.get(elementKey);
    if (!elementId) {
      const created = await prisma.partElement.create({
        data: {
          key: elementKey,
          categoryId,
          groupId,
          systemId,
        },
      });
      elementId = created.id;
      caches.elementIdByKey.set(elementKey, elementId);
      stats.element.created += 1;
    }

    for (const locale of SUPPORTED_LOCALES) {
      const systemName = normalizeText(getLocaleValue(row, locale, "system"));
      const groupName = normalizeText(getLocaleValue(row, locale, "group"));
      const categoryName = normalizeText(getLocaleValue(row, locale, "category"));
      const elementName = normalizeText(getLocaleValue(row, locale, "element"));

      const updateTranslation = async (
        type: "system" | "group" | "category" | "element",
        localeName: string,
        existing: { name: string | null; confidenceHint: string | null } | null,
        updateFn: (data: { name: string; confidenceHint: string }) => Promise<void>
      ) => {
        if (!localeName) {
          if (existing && isPlaceholder(existing.name, existing.confidenceHint)) {
            await updateFn({ name: "", confidenceHint: MISSING_HINT });
            stats[type].cleared += 1;
          } else {
            stats[type].skipped += 1;
          }
          return;
        }

        if (existing && existing.confidenceHint === TSV_SOURCE_HINT && existing.name) {
          stats[type].skipped += 1;
          return;
        }

        if (!existing) {
          await updateFn({ name: localeName, confidenceHint: TSV_SOURCE_HINT });
          stats[type].updated += 1;
          return;
        }

        if (
          existing.name === "Loading..." ||
          !existing.name ||
          existing.confidenceHint !== TSV_SOURCE_HINT
        ) {
          await updateFn({ name: localeName, confidenceHint: TSV_SOURCE_HINT });
          stats[type].updated += 1;
          return;
        }

        stats[type].skipped += 1;
      };

      const systemKeyLocale = `${systemId}|${locale}`;
      if (!loadedSet.system.has(systemKeyLocale)) {
        const existing = await prisma.partSystemTranslation.findUnique({
          where: { systemId_locale: { systemId, locale } },
          select: { name: true, confidenceHint: true },
        });
        await updateTranslation(
          "system",
          systemName,
          existing,
          async (data) => {
            await prisma.partSystemTranslation.upsert({
              where: { systemId_locale: { systemId, locale } },
              update: { name: data.name, confidenceHint: data.confidenceHint },
              create: {
                systemId,
                locale,
                name: data.name,
                confidenceHint: data.confidenceHint,
              },
            });
          }
        );
        loadedSet.system.add(systemKeyLocale);
      }

      const groupKeyLocale = `${groupId}|${locale}`;
      if (!loadedSet.group.has(groupKeyLocale)) {
        const existing = await prisma.partGroupTranslation.findUnique({
          where: { groupId_locale: { groupId, locale } },
          select: { name: true, confidenceHint: true },
        });
        await updateTranslation(
          "group",
          groupName,
          existing,
          async (data) => {
            await prisma.partGroupTranslation.upsert({
              where: { groupId_locale: { groupId, locale } },
              update: { name: data.name, confidenceHint: data.confidenceHint },
              create: {
                groupId,
                locale,
                name: data.name,
                confidenceHint: data.confidenceHint,
              },
            });
          }
        );
        loadedSet.group.add(groupKeyLocale);
      }

      const categoryKeyLocale = `${categoryId}|${locale}`;
      if (!loadedSet.category.has(categoryKeyLocale)) {
        const existing = await prisma.partCategoryTranslation.findUnique({
          where: { categoryId_locale: { categoryId, locale } },
          select: { name: true, confidenceHint: true },
        });
        await updateTranslation(
          "category",
          categoryName,
          existing,
          async (data) => {
            await prisma.partCategoryTranslation.upsert({
              where: { categoryId_locale: { categoryId, locale } },
              update: { name: data.name, confidenceHint: data.confidenceHint },
              create: {
                categoryId,
                locale,
                name: data.name,
                confidenceHint: data.confidenceHint,
              },
            });
          }
        );
        loadedSet.category.add(categoryKeyLocale);
      }

      const elementKeyLocale = `${elementId}|${locale}`;
      if (!loadedSet.element.has(elementKeyLocale)) {
        const existing = await prisma.partElementTranslation.findUnique({
          where: { elementId_locale: { elementId, locale } },
          select: { name: true, confidenceHint: true },
        });
        await updateTranslation(
          "element",
          elementName,
          existing,
          async (data) => {
            await prisma.partElementTranslation.upsert({
              where: { elementId_locale: { elementId, locale } },
              update: { name: data.name, confidenceHint: data.confidenceHint },
              create: {
                elementId,
                locale,
                name: data.name,
                confidenceHint: data.confidenceHint,
              },
            });
          }
        );
        loadedSet.element.add(elementKeyLocale);
      }
    }
  }

  console.log("Summary:");
  console.log(`PartSystemTranslation: ${JSON.stringify(stats.system)}`);
  console.log(`PartGroupTranslation: ${JSON.stringify(stats.group)}`);
  console.log(`PartCategoryTranslation: ${JSON.stringify(stats.category)}`);
  console.log(`PartElementTranslation: ${JSON.stringify(stats.element)}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

