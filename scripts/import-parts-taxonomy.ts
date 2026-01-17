import "dotenv/config";
import { PrismaClient, Locale } from "@prisma/client";
import { promises as fs } from "fs";
import path from "path";

// Usage:
// PARTS_TSV_PATH=./datasets/_archiv/biblioteca_piezas.tsv npm run import:parts
// PARTS_TSV_INLINE="<tsv-content>" npm run import:parts

const prisma = new PrismaClient();

type Row = Record<string, string>;

const DEFAULT_TSV_PATH = path.join(
  process.cwd(),
  "datasets",
  "_archiv",
  "biblioteca_piezas.tsv"
);

const LOCALES = [Locale.en, Locale.es] as const;

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

function getValue(row: Row, keys: string[]) {
  for (const key of keys) {
    const direct = row[key];
    if (direct && direct.trim()) {
      return normalizeText(direct);
    }
  }

  const loweredKeys = keys.map((key) => key.toLowerCase());
  for (const [rowKey, value] of Object.entries(row)) {
    const normalized = rowKey.toLowerCase();
    if (loweredKeys.some((key) => normalized.includes(key))) {
      if (value && value.trim()) {
        return normalizeText(value);
      }
    }
  }
  return "";
}

function resolveLocaleNames(row: Row, enKeys: string[], esKeys: string[]) {
  const en = getValue(row, enKeys);
  const es = getValue(row, esKeys);
  return {
    canonical: en || es,
    en,
    es,
  };
}

async function upsertTranslation(args: {
  table: "system" | "group" | "category" | "element";
  parentId: string;
  locale: Locale;
  name: string;
}) {
  if (!args.name) return false;

  if (args.table === "system") {
    const existing = await prisma.partSystemTranslation.findUnique({
      where: { systemId_locale: { systemId: args.parentId, locale: args.locale } },
    });
    if (existing) {
      if (existing.name !== args.name) {
        await prisma.partSystemTranslation.update({
          where: { id: existing.id },
          data: { name: args.name },
        });
        return "updated";
      }
      return "noop";
    }
    await prisma.partSystemTranslation.create({
      data: { systemId: args.parentId, locale: args.locale, name: args.name },
    });
    return "created";
  }

  if (args.table === "group") {
    const existing = await prisma.partGroupTranslation.findUnique({
      where: { groupId_locale: { groupId: args.parentId, locale: args.locale } },
    });
    if (existing) {
      if (existing.name !== args.name) {
        await prisma.partGroupTranslation.update({
          where: { id: existing.id },
          data: { name: args.name },
        });
        return "updated";
      }
      return "noop";
    }
    await prisma.partGroupTranslation.create({
      data: { groupId: args.parentId, locale: args.locale, name: args.name },
    });
    return "created";
  }

  if (args.table === "category") {
    const existing = await prisma.partCategoryTranslation.findUnique({
      where: {
        categoryId_locale: { categoryId: args.parentId, locale: args.locale },
      },
    });
    if (existing) {
      if (existing.name !== args.name) {
        await prisma.partCategoryTranslation.update({
          where: { id: existing.id },
          data: { name: args.name },
        });
        return "updated";
      }
      return "noop";
    }
    await prisma.partCategoryTranslation.create({
      data: { categoryId: args.parentId, locale: args.locale, name: args.name },
    });
    return "created";
  }

  const existing = await prisma.partElementTranslation.findUnique({
    where: {
      elementId_locale: { elementId: args.parentId, locale: args.locale },
    },
  });
  if (existing) {
    if (existing.name !== args.name) {
      await prisma.partElementTranslation.update({
        where: { id: existing.id },
        data: { name: args.name },
      });
      return "updated";
    }
    return "noop";
  }
  await prisma.partElementTranslation.create({
    data: { elementId: args.parentId, locale: args.locale, name: args.name },
  });
  return "created";
}

async function main() {
  console.log(`[import] DATABASE_URL=${process.env.DATABASE_URL ?? ""}`);
  const dbInfo = await prisma.$queryRaw<
    Array<{ db: string; schema: string }>
  >`select current_database() as db, current_schema() as schema`;
  const dbRow = dbInfo[0];
  console.log(`[import] db=${dbRow?.db ?? "?"} schema=${dbRow?.schema ?? "?"}`);
  const beforeCounts = await Promise.all([
    prisma.partSystem.count(),
    prisma.partGroup.count(),
    prisma.partCategory.count(),
    prisma.partElement.count(),
  ]);
  console.log(
    `[import] before counts: systems=${beforeCounts[0]} groups=${beforeCounts[1]} categories=${beforeCounts[2]} elements=${beforeCounts[3]}`
  );

  const inline = process.env.PARTS_TSV_INLINE;
  const tsvPath = process.env.PARTS_TSV_PATH || DEFAULT_TSV_PATH;
  const resolvedPath = path.isAbsolute(tsvPath)
    ? tsvPath
    : path.join(process.cwd(), tsvPath);
  console.log(
    `[import] tsv source=${inline ? "inline" : "file"} path=${resolvedPath}`
  );
  const content = inline ? inline : await fs.readFile(resolvedPath, "utf8");
  console.log(`[import] tsv bytes=${content.length}`);
  const previewLines = content.split(/\r?\n/).slice(0, 2);
  console.log(
    `[import] tsv preview:\n${previewLines.map((line) => `> ${line}`).join("\n")}`
  );
  const rows = parseTsv(content);
  console.log(`[import] rows parsed=${rows.length}`);
  if (rows.length > 0) {
    console.log(`[import] headers=${Object.keys(rows[0]).join(", ")}`);
  }
  if (rows.length === 0) {
    throw new Error("TSV parsed 0 rows: check path/format");
  }

  const stats = {
    systemsCreated: 0,
    systemsUpdated: 0,
    groupsCreated: 0,
    groupsUpdated: 0,
    categoriesCreated: 0,
    categoriesUpdated: 0,
    elementsCreated: 0,
    elementsUpdated: 0,
    translationsCreated: 0,
    translationsUpdated: 0,
    skippedMissingSystem: 0,
    skippedMissingGroup: 0,
    skippedMissingCategory: 0,
    skippedMissingElement: 0,
    skippedBadSlug: 0,
  };

  const systemCache = new Map<string, string>();
  const groupCache = new Map<string, string>();
  const categoryCache = new Map<string, string>();
  const skippedSamples: string[] = [];

  for (const row of rows) {
    const systemNames = resolveLocaleNames(
      row,
      ["EN_System", "EN_automotive systems", "EN_automotive_systems"],
      ["ES_System", "ES_Sistemas automotrices", "ES_Sistemas_automotrices"]
    );
    const groupNames = resolveLocaleNames(
      row,
      ["EN_Group", "EN_Groups"],
      ["ES_Group", "ES_Groups"]
    );
    const categoryNames = resolveLocaleNames(
      row,
      ["EN_Category"],
      ["ES_Category"]
    );
    const elementNames = resolveLocaleNames(
      row,
      ["EN_Element"],
      ["ES_Element"]
    );

    if (!systemNames.canonical) {
      stats.skippedMissingSystem += 1;
      if (skippedSamples.length < 5) {
        skippedSamples.push(
          `missing system: system=${systemNames.canonical} group=${groupNames.canonical} category=${categoryNames.canonical} element=${elementNames.canonical}`
        );
      }
      continue;
    }
    if (!groupNames.canonical) {
      stats.skippedMissingGroup += 1;
      if (skippedSamples.length < 5) {
        skippedSamples.push(
          `missing group: system=${systemNames.canonical} group=${groupNames.canonical} category=${categoryNames.canonical} element=${elementNames.canonical}`
        );
      }
      continue;
    }
    if (!categoryNames.canonical) {
      stats.skippedMissingCategory += 1;
      if (skippedSamples.length < 5) {
        skippedSamples.push(
          `missing category: system=${systemNames.canonical} group=${groupNames.canonical} category=${categoryNames.canonical} element=${elementNames.canonical}`
        );
      }
      continue;
    }
    if (!elementNames.canonical) {
      stats.skippedMissingElement += 1;
      if (skippedSamples.length < 5) {
        skippedSamples.push(
          `missing element: system=${systemNames.canonical} group=${groupNames.canonical} category=${categoryNames.canonical} element=${elementNames.canonical}`
        );
      }
      continue;
    }

    if (
      !systemNames.canonical ||
      !groupNames.canonical ||
      !categoryNames.canonical ||
      !elementNames.canonical
    ) {
      continue;
    }

    const systemKey = slugify(systemNames.canonical);
    const groupKey = slugify(groupNames.canonical);
    const categoryKey = slugify(categoryNames.canonical);
    const elementKeyBase = slugify(elementNames.canonical);
    if (!systemKey || !groupKey || !categoryKey || !elementKeyBase) {
      stats.skippedBadSlug += 1;
      if (skippedSamples.length < 5) {
        skippedSamples.push(
          `bad slug: system=${systemNames.canonical} group=${groupNames.canonical} category=${categoryNames.canonical} element=${elementNames.canonical}`
        );
      }
      continue;
    }

    let systemId = systemCache.get(systemKey);
    if (!systemId) {
      const existingSystem = await prisma.partSystem.findUnique({
        where: { key: systemKey },
      });
      if (existingSystem) {
        systemId = existingSystem.id;
        stats.systemsUpdated += 1;
      } else {
        const createdSystem = await prisma.partSystem.create({
          data: { key: systemKey },
        });
        systemId = createdSystem.id;
        stats.systemsCreated += 1;
      }
      systemCache.set(systemKey, systemId);
    }

    const groupCacheKey = `${systemId}:${groupKey}`;
    let groupId = groupCache.get(groupCacheKey);
    if (!groupId) {
      const existingGroup = await prisma.partGroup.findUnique({
        where: { systemId_key: { systemId, key: groupKey } },
      });
      if (existingGroup) {
        groupId = existingGroup.id;
        stats.groupsUpdated += 1;
      } else {
        const createdGroup = await prisma.partGroup.create({
          data: { systemId, key: groupKey },
        });
        groupId = createdGroup.id;
        stats.groupsCreated += 1;
      }
      groupCache.set(groupCacheKey, groupId);
    }

    const categoryCacheKey = `${groupId}:${categoryKey}`;
    let categoryId = categoryCache.get(categoryCacheKey);
    if (!categoryId) {
      const existingCategory = await prisma.partCategory.findUnique({
        where: { groupId_key: { groupId, key: categoryKey } },
      });
      if (existingCategory) {
        categoryId = existingCategory.id;
        stats.categoriesUpdated += 1;
        await prisma.partCategory.update({
          where: { id: categoryId },
          data: { groupId, systemId },
        });
      } else {
        const createdCategory = await prisma.partCategory.create({
          data: {
            key: categoryKey,
            name: categoryNames.es || categoryNames.en || categoryNames.canonical,
            groupId,
            systemId,
          },
        });
        categoryId = createdCategory.id;
        stats.categoriesCreated += 1;
      }
      categoryCache.set(categoryCacheKey, categoryId);
    }

    const elementKey = `${categoryKey}-${elementKeyBase}`;
    const existingElement = await prisma.partElement.findUnique({
      where: { key: elementKey },
    });
    let elementId: string;
    if (existingElement) {
      elementId = existingElement.id;
      stats.elementsUpdated += 1;
      await prisma.partElement.update({
        where: { id: elementId },
        data: { categoryId, systemId, groupId },
      });
    } else {
      const createdElement = await prisma.partElement.create({
        data: {
          key: elementKey,
          categoryId,
          systemId,
          groupId,
        },
      });
      elementId = createdElement.id;
      stats.elementsCreated += 1;
    }

    for (const locale of LOCALES) {
      const name = locale === Locale.en ? elementNames.en : elementNames.es;
      const result = await upsertTranslation({
        table: "element",
        parentId: elementId,
        locale,
        name,
      });
      if (result === "created") stats.translationsCreated += 1;
      if (result === "updated") stats.translationsUpdated += 1;
    }

    for (const locale of LOCALES) {
      const name = locale === Locale.en ? categoryNames.en : categoryNames.es;
      const result = await upsertTranslation({
        table: "category",
        parentId: categoryId,
        locale,
        name,
      });
      if (result === "created") stats.translationsCreated += 1;
      if (result === "updated") stats.translationsUpdated += 1;
    }

    for (const locale of LOCALES) {
      const name = locale === Locale.en ? groupNames.en : groupNames.es;
      const result = await upsertTranslation({
        table: "group",
        parentId: groupId,
        locale,
        name,
      });
      if (result === "created") stats.translationsCreated += 1;
      if (result === "updated") stats.translationsUpdated += 1;
    }

    for (const locale of LOCALES) {
      const name = locale === Locale.en ? systemNames.en : systemNames.es;
      const result = await upsertTranslation({
        table: "system",
        parentId: systemId,
        locale,
        name,
      });
      if (result === "created") stats.translationsCreated += 1;
      if (result === "updated") stats.translationsUpdated += 1;
    }
  }

  const systems = await prisma.partSystem.count();
  const groups = await prisma.partGroup.count();
  const categories = await prisma.partCategory.count();
  const elements = await prisma.partElement.count();

  console.log("Import summary:");
  console.log(
    `systems ${systems} (created ${stats.systemsCreated}, updated ${stats.systemsUpdated})`
  );
  console.log(
    `groups ${groups} (created ${stats.groupsCreated}, updated ${stats.groupsUpdated})`
  );
  console.log(
    `categories ${categories} (created ${stats.categoriesCreated}, updated ${stats.categoriesUpdated})`
  );
  console.log(
    `elements ${elements} (created ${stats.elementsCreated}, updated ${stats.elementsUpdated})`
  );
  console.log(
    `translations (created ${stats.translationsCreated}, updated ${stats.translationsUpdated})`
  );
  console.log(
    `skip summary: missingSystem=${stats.skippedMissingSystem} missingGroup=${stats.skippedMissingGroup} missingCategory=${stats.skippedMissingCategory} missingElement=${stats.skippedMissingElement} badSlug=${stats.skippedBadSlug}`
  );
  if (skippedSamples.length > 0) {
    console.log("[import] skipped samples:");
    skippedSamples.forEach((sample) => console.log(`- ${sample}`));
  }

  const example = await prisma.partElement.findFirst({
    include: {
      category: true,
      group: true,
      system: true,
    },
  });
  if (example) {
    console.log("Example chain:");
    console.log(
      `${example.system?.key ?? "?"} -> ${example.group?.key ?? "?"} -> ${example.category.key} -> ${example.key}`
    );
  }

  const deepExample = await prisma.partSystem.findFirst({
    include: {
      translations: true,
      groups: {
        include: {
          translations: true,
          categories: {
            include: {
              translations: true,
              elements: {
                take: 3,
                include: { translations: true },
              },
            },
          },
        },
      },
    },
  });
  if (deepExample) {
    const firstGroup = deepExample.groups[0];
    const firstCategory = firstGroup?.categories[0];
    const firstElement = firstCategory?.elements[0];
    console.log(
      `[import] example detail: system=${deepExample.key} group=${firstGroup?.key ?? "?"} category=${firstCategory?.key ?? "?"} element=${firstElement?.key ?? "?"}`
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
