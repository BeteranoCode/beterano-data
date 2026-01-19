import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import fs from "fs/promises";
import path from "path";

const prisma = new PrismaClient();

type CsvRow = Record<string, string | number | null | undefined>;

const OUTPUT_DIR = process.env.REPORT_DIR || "datasets/_cache";

function toCsvValue(value: CsvRow[keyof CsvRow]) {
  if (value === null || value === undefined) return "";
  const text = String(value);
  if (text.includes('"') || text.includes(",") || text.includes("\n")) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

async function writeCsv(filePath: string, rows: CsvRow[]) {
  if (rows.length === 0) {
    await fs.writeFile(filePath, "");
    return;
  }
  const headers = Object.keys(rows[0]);
  const lines = [
    headers.join(","),
    ...rows.map((row) => headers.map((h) => toCsvValue(row[h])).join(",")),
  ];
  await fs.writeFile(filePath, lines.join("\n"));
}

function logLocaleCounts(label: string, rows: { locale: string }[]) {
  const counts = new Map<string, number>();
  rows.forEach((row) => {
    counts.set(row.locale, (counts.get(row.locale) || 0) + 1);
  });
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  console.log(`${label} missing rows: ${rows.length}`);
  sorted.forEach(([locale, count]) => {
    console.log(`  ${locale}: ${count}`);
  });
}

async function main() {
  await fs.mkdir(OUTPUT_DIR, { recursive: true });

  const compactRows: CsvRow[] = [];

  const systemRows = await prisma.$queryRaw<
    {
      systemId: string;
      systemKey: string | null;
      locale: string;
      name: string | null;
      confidenceHint: string | null;
      enName: string | null;
    }[]
  >`
    SELECT s.id as "systemId",
           s.key as "systemKey",
           t.locale,
           t.name,
           t."confidenceHint",
           en.name as "enName"
    FROM "PartSystemTranslation" t
    JOIN "PartSystem" s ON s.id = t."systemId"
    LEFT JOIN "PartSystemTranslation" en
      ON en."systemId" = t."systemId" AND en.locale = 'en'
    WHERE t.locale <> 'en'
      AND (
        t.name IS NULL
        OR btrim(t.name) = ''
        OR t."confidenceHint" IN ('missing', 'missing_translation')
      )
    ORDER BY s.key, t.locale
  `;

  const groupRows = await prisma.$queryRaw<
    {
      groupId: string;
      groupKey: string | null;
      systemId: string;
      systemKey: string | null;
      locale: string;
      name: string | null;
      confidenceHint: string | null;
      enName: string | null;
      systemEnName: string | null;
    }[]
  >`
    SELECT g.id as "groupId",
           g.key as "groupKey",
           s.id as "systemId",
           s.key as "systemKey",
           t.locale,
           t.name,
           t."confidenceHint",
           en.name as "enName",
           sen.name as "systemEnName"
    FROM "PartGroupTranslation" t
    JOIN "PartGroup" g ON g.id = t."groupId"
    JOIN "PartSystem" s ON s.id = g."systemId"
    LEFT JOIN "PartGroupTranslation" en
      ON en."groupId" = t."groupId" AND en.locale = 'en'
    LEFT JOIN "PartSystemTranslation" sen
      ON sen."systemId" = g."systemId" AND sen.locale = 'en'
    WHERE t.locale <> 'en'
      AND (
        t.name IS NULL
        OR btrim(t.name) = ''
        OR t."confidenceHint" IN ('missing', 'missing_translation')
      )
    ORDER BY s.key, g.key, t.locale
  `;

  const categoryRows = await prisma.$queryRaw<
    {
      categoryId: string;
      categoryKey: string | null;
      groupId: string;
      groupKey: string | null;
      systemId: string;
      systemKey: string | null;
      locale: string;
      name: string | null;
      confidenceHint: string | null;
      enName: string | null;
      groupEnName: string | null;
      systemEnName: string | null;
    }[]
  >`
    SELECT c.id as "categoryId",
           c.key as "categoryKey",
           g.id as "groupId",
           g.key as "groupKey",
           s.id as "systemId",
           s.key as "systemKey",
           t.locale,
           t.name,
           t."confidenceHint",
           en.name as "enName",
           gen.name as "groupEnName",
           sen.name as "systemEnName"
    FROM "PartCategoryTranslation" t
    JOIN "PartCategory" c ON c.id = t."categoryId"
    JOIN "PartGroup" g ON g.id = c."groupId"
    JOIN "PartSystem" s ON s.id = c."systemId"
    LEFT JOIN "PartCategoryTranslation" en
      ON en."categoryId" = t."categoryId" AND en.locale = 'en'
    LEFT JOIN "PartGroupTranslation" gen
      ON gen."groupId" = c."groupId" AND gen.locale = 'en'
    LEFT JOIN "PartSystemTranslation" sen
      ON sen."systemId" = c."systemId" AND sen.locale = 'en'
    WHERE t.locale <> 'en'
      AND (
        t.name IS NULL
        OR btrim(t.name) = ''
        OR t."confidenceHint" IN ('missing', 'missing_translation')
      )
    ORDER BY s.key, g.key, c.key, t.locale
  `;

  const elementRows = await prisma.$queryRaw<
    {
      elementId: string;
      elementKey: string | null;
      categoryId: string;
      categoryKey: string | null;
      groupId: string;
      groupKey: string | null;
      systemId: string;
      systemKey: string | null;
      locale: string;
      name: string | null;
      confidenceHint: string | null;
      enName: string | null;
      categoryEnName: string | null;
      groupEnName: string | null;
      systemEnName: string | null;
    }[]
  >`
    SELECT e.id as "elementId",
           e.key as "elementKey",
           c.id as "categoryId",
           c.key as "categoryKey",
           g.id as "groupId",
           g.key as "groupKey",
           s.id as "systemId",
           s.key as "systemKey",
           t.locale,
           t.name,
           t."confidenceHint",
           en.name as "enName",
           cen.name as "categoryEnName",
           gen.name as "groupEnName",
           sen.name as "systemEnName"
    FROM "PartElementTranslation" t
    JOIN "PartElement" e ON e.id = t."elementId"
    JOIN "PartCategory" c ON c.id = e."categoryId"
    JOIN "PartGroup" g ON g.id = e."groupId"
    JOIN "PartSystem" s ON s.id = e."systemId"
    LEFT JOIN "PartElementTranslation" en
      ON en."elementId" = t."elementId" AND en.locale = 'en'
    LEFT JOIN "PartCategoryTranslation" cen
      ON cen."categoryId" = e."categoryId" AND cen.locale = 'en'
    LEFT JOIN "PartGroupTranslation" gen
      ON gen."groupId" = e."groupId" AND gen.locale = 'en'
    LEFT JOIN "PartSystemTranslation" sen
      ON sen."systemId" = e."systemId" AND sen.locale = 'en'
    WHERE t.locale <> 'en'
      AND (
        t.name IS NULL
        OR btrim(t.name) = ''
        OR t."confidenceHint" IN ('missing', 'missing_translation')
      )
    ORDER BY s.key, g.key, c.key, e.key, t.locale
  `;

  await writeCsv(
    path.join(OUTPUT_DIR, "missing-part-systems.csv"),
    systemRows
  );
  await writeCsv(
    path.join(OUTPUT_DIR, "missing-part-groups.csv"),
    groupRows
  );
  await writeCsv(
    path.join(OUTPUT_DIR, "missing-part-categories.csv"),
    categoryRows
  );
  await writeCsv(
    path.join(OUTPUT_DIR, "missing-part-elements.csv"),
    elementRows
  );

  systemRows.forEach((row) => {
    compactRows.push({
      entityType: "system",
      locale: row.locale,
      systemKey: row.systemKey,
      systemEnName: row.enName,
    });
  });

  groupRows.forEach((row) => {
    compactRows.push({
      entityType: "group",
      locale: row.locale,
      systemKey: row.systemKey,
      systemEnName: row.systemEnName,
      groupKey: row.groupKey,
      groupEnName: row.enName,
    });
  });

  categoryRows.forEach((row) => {
    compactRows.push({
      entityType: "category",
      locale: row.locale,
      systemKey: row.systemKey,
      systemEnName: row.systemEnName,
      groupKey: row.groupKey,
      groupEnName: row.groupEnName,
      categoryKey: row.categoryKey,
      categoryEnName: row.enName,
    });
  });

  elementRows.forEach((row) => {
    compactRows.push({
      entityType: "element",
      locale: row.locale,
      systemKey: row.systemKey,
      systemEnName: row.systemEnName,
      groupKey: row.groupKey,
      groupEnName: row.groupEnName,
      categoryKey: row.categoryKey,
      categoryEnName: row.categoryEnName,
      elementKey: row.elementKey,
      elementEnName: row.enName,
    });
  });

  await writeCsv(
    path.join(OUTPUT_DIR, "missing-parts-compact.csv"),
    compactRows
  );

  logLocaleCounts("PartSystemTranslation", systemRows);
  logLocaleCounts("PartGroupTranslation", groupRows);
  logLocaleCounts("PartCategoryTranslation", categoryRows);
  logLocaleCounts("PartElementTranslation", elementRows);

  console.log(`CSV written to ${OUTPUT_DIR}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
