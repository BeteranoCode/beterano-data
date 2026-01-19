import "dotenv/config";
import { Locale, Prisma, PrismaClient } from "@prisma/client";
import { promises as fs } from "fs";
import path from "path";
import xlsx from "xlsx";

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

const NON_TRANSLATABLE_TERMS = new Set([
  "ABS",
  "GPS",
  "LED",
  "USB",
  "OBD",
  "VIN",
  "OEM",
]);

const datasetRoot = path.join(process.cwd(), "datasets");
const cachePath = path.join(datasetRoot, "_cache", "translations-cache.json");

type PartsTranslationMaps = {
  systemMap: Map<string, Record<string, string>>;
  groupMap: Map<string, Record<string, string>>;
  categoryMap: Map<string, Record<string, string>>;
  elementMap: Map<string, Record<string, string>>;
};

type TranslationCache = Record<string, string>;

type FixStats = {
  analyzed: number;
  fixed: number;
  missing: number;
  skippedWhitelist: number;
  byLocale: Record<string, number>;
};

const EMPTY_STATS: FixStats = {
  analyzed: 0,
  fixed: 0,
  missing: 0,
  skippedWhitelist: 0,
  byLocale: {},
};

function normalizeName(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

function isSameName(a: string | null | undefined, b: string | null | undefined) {
  return normalizeName(a) === normalizeName(b);
}

function isWhitelisted(name: string) {
  const cleaned = name.trim();
  if (!cleaned) return false;
  return NON_TRANSLATABLE_TERMS.has(cleaned.toUpperCase());
}

function normalizeKey(value: string | undefined): string {
  if (!value) return "";
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
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

async function fileExists(filePath: string) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function parseArgs(argv: string[]) {
  const sourceIndex = argv.findIndex((arg) => arg === "--source");
  const fileIndex = argv.findIndex((arg) => arg === "--file");
  const source = sourceIndex >= 0 ? argv[sourceIndex + 1] : "auto";
  const file = fileIndex >= 0 ? argv[fileIndex + 1] : undefined;
  return { source, file };
}

function parseTsvRow(line: string) {
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

function parseTsv(content: string) {
  const lines = content.split(/\r?\n/).filter((line) => line.trim());
  if (!lines.length) return [] as Record<string, unknown>[];
  const headers = parseTsvRow(lines[0]).map((header) => header.trim());
  const rows: Record<string, unknown>[] = [];
  for (let i = 1; i < lines.length; i += 1) {
    const values = parseTsvRow(lines[i]);
    const row: Record<string, unknown> = {};
    for (let c = 0; c < headers.length; c += 1) {
      row[headers[c]] = values[c] ?? "";
    }
    rows.push(row);
  }
  return rows;
}

async function buildPartsMapsFromRows(
  rows: Record<string, unknown>[]
): Promise<PartsTranslationMaps> {
  const systemMap = new Map<string, Record<string, string>>();
  const groupMap = new Map<string, Record<string, string>>();
  const categoryMap = new Map<string, Record<string, string>>();
  const elementMap = new Map<string, Record<string, string>>();

  const localePrefixes: Array<{ locale: Locale; key: string }> = [
    { locale: Locale.ar, key: "AR" },
    { locale: Locale.de, key: "DE" },
    { locale: Locale.en, key: "EN" },
    { locale: Locale.es, key: "ES" },
    { locale: Locale.fr, key: "FR" },
    { locale: Locale.hr, key: "HR" },
    { locale: Locale.it, key: "IT" },
    { locale: Locale.ja, key: "JA" },
    { locale: Locale.nl, key: "NL" },
    { locale: Locale.pl, key: "PL" },
    { locale: Locale.tr, key: "TR" },
    { locale: Locale.zh, key: "ZH" },
  ];

  const systemColumns = (prefix: string) => {
    if (prefix === "ES") {
      return [
        "ES_Sistemas automotrices",
        "ES_Sistemas_automotrices",
        "ES_automotive systems",
        "ES_automotive_systems",
      ];
    }
    if (prefix === "DE") {
      return [
        "DE_Automobilsysteme",
        "DE_automotive systems",
        "DE_automotive_systems",
      ];
    }
    return [`${prefix}_automotive systems`, `${prefix}_automotive_systems`];
  };
  const groupColumns = (prefix: string) => [`${prefix}_Groups`, `${prefix}_Group`];
  const categoryColumns = (prefix: string) => [`${prefix}_Category`];
  const elementColumns = (prefix: string) => [`${prefix}_Element`];

  for (const row of rows) {
    const systemEn = getRowValue(row, systemColumns("EN"));
    const groupEn = getRowValue(row, groupColumns("EN"));
    const categoryEn = getRowValue(row, categoryColumns("EN"));
    const elementEn = getRowValue(row, elementColumns("EN"));

    if (!systemEn || !groupEn || !categoryEn) {
      continue;
    }

    const systemKey = normalizeKey(systemEn);
    const groupKey = normalizeKey(groupEn);
    const categoryKey = normalizeKey(categoryEn);
    const legacyId = getRowValue(row, [
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
    const elementKey = legacyId ? legacyId.trim() : normalizeKey(elementEn);

    if (!systemKey || !groupKey || !categoryKey) {
      continue;
    }

    const systemLocales: Record<string, string> = {};
    const groupLocales: Record<string, string> = {};
    const categoryLocales: Record<string, string> = {};
    const elementLocales: Record<string, string> = {};

    for (const { locale, key } of localePrefixes) {
      const systemValue = getRowValue(row, systemColumns(key));
      const groupValue = getRowValue(row, groupColumns(key));
      const categoryValue = getRowValue(row, categoryColumns(key));
      const elementValue = getRowValue(row, elementColumns(key));
      if (systemValue) systemLocales[locale] = systemValue;
      if (groupValue) groupLocales[locale] = groupValue;
      if (categoryValue) categoryLocales[locale] = categoryValue;
      if (elementValue) elementLocales[locale] = elementValue;
    }

    const mergeLocales = (
      map: Map<string, Record<string, string>>,
      key: string,
      locales: Record<string, string>
    ) => {
      const existing = map.get(key) ?? {};
      for (const [locale, value] of Object.entries(locales)) {
        if (value && !existing[locale]) {
          existing[locale] = value;
        }
      }
      map.set(key, existing);
    };

    mergeLocales(systemMap, systemKey, systemLocales);
    mergeLocales(groupMap, `${systemKey}|${groupKey}`, groupLocales);
    mergeLocales(
      categoryMap,
      `${systemKey}|${groupKey}|${categoryKey}`,
      categoryLocales
    );
    if (elementKey) {
      mergeLocales(
        elementMap,
        `${systemKey}|${groupKey}|${categoryKey}|${elementKey}`,
        elementLocales
      );
    }
  }

  return { systemMap, groupMap, categoryMap, elementMap };
}

async function loadPartsDataset(): Promise<PartsTranslationMaps> {
  const partsPath =
    process.env.PARTS_XLSX_PATH ??
    path.join(datasetRoot, "parts", "biblioteca_piezas.xlsx");

  const systemMap = new Map<string, Record<string, string>>();
  const groupMap = new Map<string, Record<string, string>>();
  const categoryMap = new Map<string, Record<string, string>>();
  const elementMap = new Map<string, Record<string, string>>();

  if (!(await fileExists(partsPath))) {
    return { systemMap, groupMap, categoryMap, elementMap };
  }

  const workbook = xlsx.readFile(partsPath);
  const sheet = workbook.Sheets["00_DATA"];
  if (!sheet) {
    return { systemMap, groupMap, categoryMap, elementMap };
  }

  const rows = xlsx.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: "",
  });

  return buildPartsMapsFromRows(rows);
}

async function loadPartsDatasetFromXlsx(filePath: string) {
  const systemMap = new Map<string, Record<string, string>>();
  const groupMap = new Map<string, Record<string, string>>();
  const categoryMap = new Map<string, Record<string, string>>();
  const elementMap = new Map<string, Record<string, string>>();

  if (!(await fileExists(filePath))) {
    return { systemMap, groupMap, categoryMap, elementMap };
  }

  const workbook = xlsx.readFile(filePath);
  const sheet = workbook.Sheets["00_DATA"];
  if (!sheet) {
    return { systemMap, groupMap, categoryMap, elementMap };
  }

  const rows = xlsx.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: "",
  });

  return buildPartsMapsFromRows(rows);
}

async function loadPartsDatasetFromTsv(filePath: string) {
  const systemMap = new Map<string, Record<string, string>>();
  const groupMap = new Map<string, Record<string, string>>();
  const categoryMap = new Map<string, Record<string, string>>();
  const elementMap = new Map<string, Record<string, string>>();

  if (!(await fileExists(filePath))) {
    return { systemMap, groupMap, categoryMap, elementMap };
  }

  const content = await fs.readFile(filePath, "utf8");
  const rows = parseTsv(content);
  return buildPartsMapsFromRows(rows);
}

async function loadCache(): Promise<TranslationCache> {
  try {
    const data = await fs.readFile(cachePath, "utf8");
    if (!data.trim()) return {};
    return JSON.parse(data) as TranslationCache;
  } catch {
    return {};
  }
}

async function saveCache(cache: TranslationCache) {
  await fs.mkdir(path.dirname(cachePath), { recursive: true });
  await fs.writeFile(cachePath, JSON.stringify(cache, null, 2), "utf8");
}

function cacheKey(locale: string, text: string) {
  return `${locale}|${text}`;
}

function decodeHtmlEntities(value: string) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const MIN_TRANSLATE_INTERVAL_MS = 120;
let lastTranslateAt = 0;
let googleErrorLogged = false;
let googleAvailable = true;

async function translateGoogle(
  apiKey: string,
  text: string,
  target: string
) {
  const now = Date.now();
  const elapsed = now - lastTranslateAt;
  if (elapsed < MIN_TRANSLATE_INTERVAL_MS) {
    await sleep(MIN_TRANSLATE_INTERVAL_MS - elapsed);
  }
  const response = await fetch(
    `https://translation.googleapis.com/language/translate/v2?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        q: text,
        target,
        source: "en",
        format: "text",
      }),
    }
  );
  lastTranslateAt = Date.now();

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Translate failed (${response.status}): ${body}`);
  }

  const data = (await response.json()) as {
    data?: { translations?: { translatedText?: string }[] };
  };
  const translated = data.data?.translations?.[0]?.translatedText;
  if (!translated) {
    throw new Error("Translate failed: empty response");
  }
  return decodeHtmlEntities(translated);
}

async function translateWithRetry(
  apiKey: string,
  text: string,
  target: string
) {
  const delays = [200, 600, 1200];
  let lastError: Error | null = null;
  for (let i = 0; i < delays.length + 1; i += 1) {
    try {
      return await translateGoogle(apiKey, text, target);
    } catch (error) {
      lastError = error as Error;
      if (i < delays.length) {
        await sleep(delays[i]);
      }
    }
  }
  throw lastError ?? new Error("Translate failed");
}

async function resolveTranslation(options: {
  locale: Locale;
  enName: string;
  datasetName?: string;
  cache: TranslationCache;
  apiKey?: string;
}) {
  const { locale, enName, datasetName, cache, apiKey } = options;
  if (!enName.trim()) {
    return { name: "", source: "missing" as const };
  }

  if (datasetName && datasetName.trim()) {
    if (!isSameName(datasetName, enName) || isWhitelisted(enName)) {
      return { name: datasetName.trim(), source: "dataset" as const };
    }
  }

  if (!apiKey) {
    return { name: "", source: "missing" as const };
  }

  const key = cacheKey(locale, enName);
  if (cache[key]) {
    return { name: cache[key], source: "google" as const };
  }

  if (!googleAvailable) {
    return { name: "", source: "missing" as const };
  }

  try {
    const translated = await translateWithRetry(apiKey, enName, locale);
    cache[key] = translated;
    return { name: translated, source: "google" as const };
  } catch (error) {
    if (!googleErrorLogged) {
      console.warn(
        `Google Translate failed; enable Translation API for GOOGLE_API_KEY. ${String(
          (error as Error).message ?? error
        )}`
      );
      googleErrorLogged = true;
    }
    googleAvailable = false;
    return { name: "", source: "missing" as const };
  }
}

function buildAliasesKeywords(value: string) {
  const tokens = value
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .filter(Boolean);
  return {
    aliases: [value],
    keywords: Array.from(new Set(tokens)),
  };
}

function bumpLocale(stats: FixStats, locale: string) {
  stats.byLocale[locale] = (stats.byLocale[locale] ?? 0) + 1;
}

async function fixPartSystemTranslations(
  maps: PartsTranslationMaps,
  cache: TranslationCache,
  apiKey?: string
) {
  const stats: FixStats = { ...EMPTY_STATS, byLocale: {} };
  const rows = await prisma.$queryRaw<
    {
      id: string;
      systemId: string;
      systemKey: string;
      locale: Locale;
      name: string | null;
      enName: string | null;
      aliasesJson: Prisma.JsonValue | null;
      keywordsJson: Prisma.JsonValue | null;
    }[]
  >`
    SELECT
      t.id,
      t."systemId" as "systemId",
      s.key as "systemKey",
      t.locale,
      t.name,
      en.name as "enName",
      t."aliasesJson",
      t."keywordsJson"
    FROM "PartSystemTranslation" t
    JOIN "PartSystem" s ON s.id = t."systemId"
    LEFT JOIN "PartSystemTranslation" en
      ON en."systemId" = t."systemId" AND en.locale = 'en'
    WHERE t.locale <> 'en'
      AND (
        t.name IS NULL
        OR trim(t.name) = ''
        OR t.name = 'Loading...'
        OR lower(trim(t.name)) = lower(trim(en.name))
      )
  `;

  for (const row of rows) {
    if (!row.enName) continue;
    stats.analyzed += 1;
    bumpLocale(stats, row.locale);
    if (isWhitelisted(row.enName)) {
      stats.skippedWhitelist += 1;
      continue;
    }

    const dataset = maps.systemMap.get(row.systemKey);
    const datasetName = dataset?.[row.locale];
    const resolved = await resolveTranslation({
      locale: row.locale,
      enName: row.enName,
      datasetName,
      cache,
      apiKey,
    });

    let nextName = resolved.name.trim();
    let confidenceHint: string | null =
      resolved.source === "dataset"
        ? "human"
        : resolved.source === "google"
          ? "mt:google"
          : "missing";

    if (!nextName || (isSameName(nextName, row.enName) && !isWhitelisted(row.enName))) {
      nextName = "";
      confidenceHint = "missing";
      stats.missing += 1;
    }

    const updateData: {
      name: string;
      confidenceHint?: string | null;
      aliasesJson?: Prisma.InputJsonValue;
      keywordsJson?: Prisma.InputJsonValue;
    } = { name: nextName, confidenceHint };

    if (resolved.source === "dataset") {
      const meta = buildAliasesKeywords(nextName);
      if (!row.aliasesJson) {
        updateData.aliasesJson = meta.aliases as Prisma.InputJsonValue;
      }
      if (!row.keywordsJson) {
        updateData.keywordsJson = meta.keywords as Prisma.InputJsonValue;
      }
    }

    await prisma.partSystemTranslation.upsert({
      where: { systemId_locale: { systemId: row.systemId, locale: row.locale } },
      update: updateData,
      create: {
        systemId: row.systemId,
        locale: row.locale,
        ...updateData,
      },
    });

    stats.fixed += 1;
  }

  return stats;
}

async function fixPartGroupTranslations(
  maps: PartsTranslationMaps,
  cache: TranslationCache,
  apiKey?: string
) {
  const stats: FixStats = { ...EMPTY_STATS, byLocale: {} };
  const rows = await prisma.$queryRaw<
    {
      id: string;
      groupId: string;
      groupKey: string;
      systemKey: string;
      locale: Locale;
      name: string | null;
      enName: string | null;
      aliasesJson: Prisma.JsonValue | null;
      keywordsJson: Prisma.JsonValue | null;
    }[]
  >`
    SELECT
      t.id,
      t."groupId" as "groupId",
      g.key as "groupKey",
      s.key as "systemKey",
      t.locale,
      t.name,
      en.name as "enName",
      t."aliasesJson",
      t."keywordsJson"
    FROM "PartGroupTranslation" t
    JOIN "PartGroup" g ON g.id = t."groupId"
    JOIN "PartSystem" s ON s.id = g."systemId"
    LEFT JOIN "PartGroupTranslation" en
      ON en."groupId" = t."groupId" AND en.locale = 'en'
    WHERE t.locale <> 'en'
      AND (
        t.name IS NULL
        OR trim(t.name) = ''
        OR t.name = 'Loading...'
        OR lower(trim(t.name)) = lower(trim(en.name))
      )
  `;

  for (const row of rows) {
    if (!row.enName) continue;
    stats.analyzed += 1;
    bumpLocale(stats, row.locale);
    if (isWhitelisted(row.enName)) {
      stats.skippedWhitelist += 1;
      continue;
    }

    const dataset = maps.groupMap.get(`${row.systemKey}|${row.groupKey}`);
    const datasetName = dataset?.[row.locale];
    const resolved = await resolveTranslation({
      locale: row.locale,
      enName: row.enName,
      datasetName,
      cache,
      apiKey,
    });

    let nextName = resolved.name.trim();
    let confidenceHint: string | null =
      resolved.source === "dataset"
        ? "human"
        : resolved.source === "google"
          ? "mt:google"
          : "missing";

    if (!nextName || (isSameName(nextName, row.enName) && !isWhitelisted(row.enName))) {
      nextName = "";
      confidenceHint = "missing";
      stats.missing += 1;
    }

    const updateData: {
      name: string;
      confidenceHint?: string | null;
      aliasesJson?: Prisma.InputJsonValue;
      keywordsJson?: Prisma.InputJsonValue;
    } = { name: nextName, confidenceHint };

    if (resolved.source === "dataset") {
      const meta = buildAliasesKeywords(nextName);
      if (!row.aliasesJson) {
        updateData.aliasesJson = meta.aliases as Prisma.InputJsonValue;
      }
      if (!row.keywordsJson) {
        updateData.keywordsJson = meta.keywords as Prisma.InputJsonValue;
      }
    }

    await prisma.partGroupTranslation.upsert({
      where: { groupId_locale: { groupId: row.groupId, locale: row.locale } },
      update: updateData,
      create: {
        groupId: row.groupId,
        locale: row.locale,
        ...updateData,
      },
    });

    stats.fixed += 1;
  }

  return stats;
}

async function fixPartCategoryTranslations(
  maps: PartsTranslationMaps,
  cache: TranslationCache,
  apiKey?: string
) {
  const stats: FixStats = { ...EMPTY_STATS, byLocale: {} };
  const rows = await prisma.$queryRaw<
    {
      id: string;
      categoryId: string;
      categoryKey: string;
      groupKey: string;
      systemKey: string;
      locale: Locale;
      name: string | null;
      enName: string | null;
      aliasesJson: Prisma.JsonValue | null;
      keywordsJson: Prisma.JsonValue | null;
    }[]
  >`
    SELECT
      t.id,
      t."categoryId" as "categoryId",
      c.key as "categoryKey",
      g.key as "groupKey",
      s.key as "systemKey",
      t.locale,
      t.name,
      COALESCE(en.name, c.name) as "enName",
      t."aliasesJson",
      t."keywordsJson"
    FROM "PartCategoryTranslation" t
    JOIN "PartCategory" c ON c.id = t."categoryId"
    LEFT JOIN "PartGroup" g ON g.id = c."groupId"
    LEFT JOIN "PartSystem" s ON s.id = c."systemId"
    LEFT JOIN "PartCategoryTranslation" en
      ON en."categoryId" = t."categoryId" AND en.locale = 'en'
    WHERE t.locale <> 'en'
      AND (
        t.name IS NULL
        OR trim(t.name) = ''
        OR t.name = 'Loading...'
        OR lower(trim(t.name)) = lower(trim(COALESCE(en.name, c.name)))
      )
  `;

  for (const row of rows) {
    if (!row.enName) continue;
    stats.analyzed += 1;
    bumpLocale(stats, row.locale);
    if (isWhitelisted(row.enName)) {
      stats.skippedWhitelist += 1;
      continue;
    }

    const compositeKey = `${row.systemKey}|${row.groupKey}|${row.categoryKey}`;
    const dataset = maps.categoryMap.get(compositeKey);
    const datasetName = dataset?.[row.locale];
    const resolved = await resolveTranslation({
      locale: row.locale,
      enName: row.enName,
      datasetName,
      cache,
      apiKey,
    });

    let nextName = resolved.name.trim();
    let confidenceHint: string | null =
      resolved.source === "dataset"
        ? "human"
        : resolved.source === "google"
          ? "mt:google"
          : "missing";

    if (!nextName || (isSameName(nextName, row.enName) && !isWhitelisted(row.enName))) {
      nextName = "";
      confidenceHint = "missing";
      stats.missing += 1;
    }

    const updateData: {
      name: string;
      confidenceHint?: string | null;
      aliasesJson?: Prisma.InputJsonValue;
      keywordsJson?: Prisma.InputJsonValue;
    } = { name: nextName, confidenceHint };

    if (resolved.source === "dataset") {
      const meta = buildAliasesKeywords(nextName);
      if (!row.aliasesJson) {
        updateData.aliasesJson = meta.aliases as Prisma.InputJsonValue;
      }
      if (!row.keywordsJson) {
        updateData.keywordsJson = meta.keywords as Prisma.InputJsonValue;
      }
    }

    await prisma.partCategoryTranslation.upsert({
      where: { categoryId_locale: { categoryId: row.categoryId, locale: row.locale } },
      update: updateData,
      create: {
        categoryId: row.categoryId,
        locale: row.locale,
        ...updateData,
      },
    });

    stats.fixed += 1;
  }

  return stats;
}

async function fixPartElementTranslations(
  maps: PartsTranslationMaps,
  cache: TranslationCache,
  apiKey?: string
) {
  const stats: FixStats = { ...EMPTY_STATS, byLocale: {} };
  const rows = await prisma.$queryRaw<
    {
      id: string;
      elementId: string;
      elementKey: string;
      categoryKey: string;
      groupKey: string;
      systemKey: string;
      locale: Locale;
      name: string | null;
      enName: string | null;
      aliasesJson: Prisma.JsonValue | null;
      keywordsJson: Prisma.JsonValue | null;
    }[]
  >`
    SELECT
      t.id,
      t."elementId" as "elementId",
      e.key as "elementKey",
      c.key as "categoryKey",
      g.key as "groupKey",
      s.key as "systemKey",
      t.locale,
      t.name,
      en.name as "enName",
      t."aliasesJson",
      t."keywordsJson"
    FROM "PartElementTranslation" t
    JOIN "PartElement" e ON e.id = t."elementId"
    LEFT JOIN "PartCategory" c ON c.id = e."categoryId"
    LEFT JOIN "PartGroup" g ON g.id = e."groupId"
    LEFT JOIN "PartSystem" s ON s.id = e."systemId"
    LEFT JOIN "PartElementTranslation" en
      ON en."elementId" = t."elementId" AND en.locale = 'en'
    WHERE t.locale <> 'en'
      AND (
        t.name IS NULL
        OR trim(t.name) = ''
        OR t.name = 'Loading...'
        OR lower(trim(t.name)) = lower(trim(en.name))
      )
  `;

  for (const row of rows) {
    if (!row.enName) continue;
    stats.analyzed += 1;
    bumpLocale(stats, row.locale);
    if (isWhitelisted(row.enName)) {
      stats.skippedWhitelist += 1;
      continue;
    }

    const compositeKey = `${row.systemKey}|${row.groupKey}|${row.categoryKey}|${row.elementKey}`;
    const fallbackKey = row.enName
      ? `${row.systemKey}|${row.groupKey}|${row.categoryKey}|${normalizeKey(
          row.enName
        )}`
      : "";
    const dataset =
      maps.elementMap.get(compositeKey) ||
      (fallbackKey ? maps.elementMap.get(fallbackKey) : undefined);
    const datasetName = dataset?.[row.locale];
    const resolved = await resolveTranslation({
      locale: row.locale,
      enName: row.enName,
      datasetName,
      cache,
      apiKey,
    });

    let nextName = resolved.name.trim();
    let confidenceHint: string | null =
      resolved.source === "dataset"
        ? "human"
        : resolved.source === "google"
          ? "mt:google"
          : "missing";

    if (!nextName || (isSameName(nextName, row.enName) && !isWhitelisted(row.enName))) {
      nextName = "";
      confidenceHint = "missing";
      stats.missing += 1;
    }

    const updateData: {
      name: string;
      confidenceHint?: string | null;
      aliasesJson?: Prisma.InputJsonValue;
      keywordsJson?: Prisma.InputJsonValue;
    } = { name: nextName, confidenceHint };

    if (resolved.source === "dataset") {
      const meta = buildAliasesKeywords(nextName);
      if (!row.aliasesJson) {
        updateData.aliasesJson = meta.aliases as Prisma.InputJsonValue;
      }
      if (!row.keywordsJson) {
        updateData.keywordsJson = meta.keywords as Prisma.InputJsonValue;
      }
    }

    await prisma.partElementTranslation.upsert({
      where: { elementId_locale: { elementId: row.elementId, locale: row.locale } },
      update: updateData,
      create: {
        elementId: row.elementId,
        locale: row.locale,
        ...updateData,
      },
    });

    stats.fixed += 1;
  }

  return stats;
}

async function fixServiceOperationTranslations(
  cache: TranslationCache,
  apiKey?: string
) {
  const stats: FixStats = { ...EMPTY_STATS, byLocale: {} };
  const rows = await prisma.$queryRaw<
    {
      id: string;
      operationId: string;
      locale: Locale;
      name: string | null;
      enName: string | null;
      aliases: Prisma.JsonValue | null;
      keywords: Prisma.JsonValue | null;
    }[]
  >`
    SELECT
      t.id,
      t."operationId" as "operationId",
      t.locale,
      t.name,
      COALESCE(en.name, o.name) as "enName",
      t.aliases,
      t.keywords
    FROM "ServiceOperationTranslation" t
    JOIN "ServiceOperation" o ON o.id = t."operationId"
    LEFT JOIN "ServiceOperationTranslation" en
      ON en."operationId" = t."operationId" AND en.locale = 'en'
    WHERE t.locale <> 'en'
      AND (
        t.name IS NULL
        OR trim(t.name) = ''
        OR t.name = 'Loading...'
        OR lower(trim(t.name)) = lower(trim(COALESCE(en.name, o.name)))
      )
  `;

  for (const row of rows) {
    if (!row.enName) continue;
    stats.analyzed += 1;
    bumpLocale(stats, row.locale);
    if (isWhitelisted(row.enName)) {
      stats.skippedWhitelist += 1;
      continue;
    }

    const resolved = await resolveTranslation({
      locale: row.locale,
      enName: row.enName,
      cache,
      apiKey,
    });

    let nextName = resolved.name.trim();
    let confidenceHint: string | null =
      resolved.source === "dataset"
        ? "human"
        : resolved.source === "google"
          ? "mt:google"
          : "missing";

    if (!nextName || (isSameName(nextName, row.enName) && !isWhitelisted(row.enName))) {
      nextName = "";
      confidenceHint = "missing";
      stats.missing += 1;
    }

    const updateData: {
      name: string;
      confidenceHint?: string | null;
      aliases?: Prisma.InputJsonValue;
      keywords?: Prisma.InputJsonValue;
    } = { name: nextName, confidenceHint };

    if (resolved.source === "dataset") {
      const meta = buildAliasesKeywords(nextName);
      if (!row.aliases) {
        updateData.aliases = meta.aliases as Prisma.InputJsonValue;
      }
      if (!row.keywords) {
        updateData.keywords = meta.keywords as Prisma.InputJsonValue;
      }
    }

    await prisma.serviceOperationTranslation.upsert({
      where: {
        operationId_locale: { operationId: row.operationId, locale: row.locale },
      },
      update: updateData,
      create: {
        operationId: row.operationId,
        locale: row.locale,
        ...updateData,
      },
    });

    stats.fixed += 1;
  }

  return stats;
}

async function fixTaxonomyNodeTranslations(
  cache: TranslationCache,
  apiKey?: string
) {
  const stats: FixStats = { ...EMPTY_STATS, byLocale: {} };
  const rows = await prisma.$queryRaw<
    {
      id: string;
      taxonomyNodeId: string;
      locale: Locale;
      name: string | null;
      enName: string | null;
    }[]
  >`
    SELECT
      t.id,
      t."taxonomyNodeId" as "taxonomyNodeId",
      t.locale,
      t.name,
      COALESCE(en.name, n.name) as "enName"
    FROM "TaxonomyNodeTranslation" t
    JOIN "TaxonomyNode" n ON n.id = t."taxonomyNodeId"
    LEFT JOIN "TaxonomyNodeTranslation" en
      ON en."taxonomyNodeId" = t."taxonomyNodeId" AND en.locale = 'en'
    WHERE t.locale <> 'en'
      AND (
        t.name IS NULL
        OR trim(t.name) = ''
        OR t.name = 'Loading...'
        OR lower(trim(t.name)) = lower(trim(COALESCE(en.name, n.name)))
      )
  `;

  for (const row of rows) {
    if (!row.enName) continue;
    stats.analyzed += 1;
    bumpLocale(stats, row.locale);
    if (isWhitelisted(row.enName)) {
      stats.skippedWhitelist += 1;
      continue;
    }

    const resolved = await resolveTranslation({
      locale: row.locale,
      enName: row.enName,
      cache,
      apiKey,
    });

    let nextName = resolved.name.trim();
    if (!nextName || (isSameName(nextName, row.enName) && !isWhitelisted(row.enName))) {
      nextName = "";
      stats.missing += 1;
    }

    await prisma.taxonomyNodeTranslation.upsert({
      where: {
        taxonomyNodeId_locale: {
          taxonomyNodeId: row.taxonomyNodeId,
          locale: row.locale,
        },
      },
      update: { name: nextName },
      create: { taxonomyNodeId: row.taxonomyNodeId, locale: row.locale, name: nextName },
    });

    stats.fixed += 1;
  }

  return stats;
}

async function fixCatalogItemTranslations(
  cache: TranslationCache,
  apiKey?: string
) {
  const stats: FixStats = { ...EMPTY_STATS, byLocale: {} };
  const rows = await prisma.$queryRaw<
    {
      id: string;
      itemId: string;
      locale: Locale;
      name: string | null;
      enName: string | null;
    }[]
  >`
    SELECT
      t.id,
      t."itemId" as "itemId",
      t.locale,
      t.name,
      COALESCE(en.name, i.name) as "enName"
    FROM "CatalogItemTranslation" t
    JOIN "CatalogItem" i ON i.id = t."itemId"
    LEFT JOIN "CatalogItemTranslation" en
      ON en."itemId" = t."itemId" AND en.locale = 'en'
    WHERE t.locale <> 'en'
      AND (
        t.name IS NULL
        OR trim(t.name) = ''
        OR t.name = 'Loading...'
        OR lower(trim(t.name)) = lower(trim(COALESCE(en.name, i.name)))
      )
  `;

  for (const row of rows) {
    if (!row.enName) continue;
    stats.analyzed += 1;
    bumpLocale(stats, row.locale);
    if (isWhitelisted(row.enName)) {
      stats.skippedWhitelist += 1;
      continue;
    }

    const resolved = await resolveTranslation({
      locale: row.locale,
      enName: row.enName,
      cache,
      apiKey,
    });

    let nextName = resolved.name.trim();
    if (!nextName || (isSameName(nextName, row.enName) && !isWhitelisted(row.enName))) {
      nextName = "";
      stats.missing += 1;
    }

    await prisma.workCatalogItemTranslation.upsert({
      where: { itemId_locale: { itemId: row.itemId, locale: row.locale } },
      update: { name: nextName },
      create: { itemId: row.itemId, locale: row.locale, name: nextName },
    });

    stats.fixed += 1;
  }

  return stats;
}

function printStats(title: string, stats: FixStats) {
  const locales = Object.entries(stats.byLocale)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([locale, count]) => `${locale}:${count}`)
    .join(", ");
  console.log(
    `${title} -> analyzed:${stats.analyzed} fixed:${stats.fixed} missing:${stats.missing} whitelist:${stats.skippedWhitelist}`
  );
  if (locales) {
    console.log(`  locales: ${locales}`);
  }
}

async function main() {
  const { source, file } = parseArgs(process.argv.slice(2));
  const apiKey = undefined;
  const cache = await loadCache();
  const xlsxPath = path.join(datasetRoot, "parts", "biblioteca_piezas.xlsx");
  const tsvPath = path.join(datasetRoot, "parts", "biblioteca_piezas.tsv");
  const useXlsx =
    source === "xlsx" ||
    (source === "auto" && (await fileExists(xlsxPath)));
  const useTsv =
    source === "tsv" ||
    (source === "auto" && !useXlsx && (await fileExists(tsvPath)));
  const maps = useTsv
    ? await loadPartsDatasetFromTsv(file ?? tsvPath)
    : useXlsx
      ? await loadPartsDatasetFromXlsx(file ?? xlsxPath)
      : await loadPartsDataset();

  const tables: Array<{ name: string; stats: FixStats }> = [];

  tables.push({
    name: "PartSystemTranslation",
    stats: await fixPartSystemTranslations(maps, cache, apiKey),
  });
  tables.push({
    name: "PartGroupTranslation",
    stats: await fixPartGroupTranslations(maps, cache, apiKey),
  });
  tables.push({
    name: "PartCategoryTranslation",
    stats: await fixPartCategoryTranslations(maps, cache, apiKey),
  });
  tables.push({
    name: "PartElementTranslation",
    stats: await fixPartElementTranslations(maps, cache, apiKey),
  });
  tables.push({
    name: "ServiceOperationTranslation",
    stats: await fixServiceOperationTranslations(cache, apiKey),
  });
  tables.push({
    name: "TaxonomyNodeTranslation",
    stats: await fixTaxonomyNodeTranslations(cache, apiKey),
  });
  tables.push({
    name: "WorkCatalogItemTranslation",
    stats: await fixCatalogItemTranslations(cache, apiKey),
  });

  for (const entry of tables) {
    printStats(entry.name, entry.stats);
  }

  await saveCache(cache);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
