import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function logExamples(label: string, rows: { locale: string; name: string; enName: string }[]) {
  console.log(`${label} suspicious count: ${rows.length}`);
  rows.slice(0, 20).forEach((row, index) => {
    console.log(
      `  ${index + 1}. ${row.locale} | ${row.name} | en=${row.enName}`
    );
  });
}

async function main() {
  const systemRows = await prisma.$queryRaw<
    { locale: string; name: string; enName: string }[]
  >`
    SELECT t.locale, t.name, en.name as "enName"
    FROM "PartSystemTranslation" t
    JOIN "PartSystemTranslation" en
      ON en."systemId" = t."systemId" AND en.locale = 'en'
    WHERE t.locale <> 'en'
      AND lower(trim(t.name)) = lower(trim(en.name))
  `;

  const groupRows = await prisma.$queryRaw<
    { locale: string; name: string; enName: string }[]
  >`
    SELECT t.locale, t.name, en.name as "enName"
    FROM "PartGroupTranslation" t
    JOIN "PartGroupTranslation" en
      ON en."groupId" = t."groupId" AND en.locale = 'en'
    WHERE t.locale <> 'en'
      AND lower(trim(t.name)) = lower(trim(en.name))
  `;

  const categoryRows = await prisma.$queryRaw<
    { locale: string; name: string; enName: string }[]
  >`
    SELECT t.locale, t.name, en.name as "enName"
    FROM "PartCategoryTranslation" t
    JOIN "PartCategoryTranslation" en
      ON en."categoryId" = t."categoryId" AND en.locale = 'en'
    WHERE t.locale <> 'en'
      AND lower(trim(t.name)) = lower(trim(en.name))
  `;

  const elementRows = await prisma.$queryRaw<
    { locale: string; name: string; enName: string }[]
  >`
    SELECT t.locale, t.name, en.name as "enName"
    FROM "PartElementTranslation" t
    JOIN "PartElementTranslation" en
      ON en."elementId" = t."elementId" AND en.locale = 'en'
    WHERE t.locale <> 'en'
      AND lower(trim(t.name)) = lower(trim(en.name))
  `;

  const taxonomyRows = await prisma.$queryRaw<
    { locale: string; name: string; enName: string }[]
  >`
    SELECT t.locale, t.name, en.name as "enName"
    FROM "TaxonomyNodeTranslation" t
    JOIN "TaxonomyNodeTranslation" en
      ON en."taxonomyNodeId" = t."taxonomyNodeId" AND en.locale = 'en'
    WHERE t.locale <> 'en'
      AND lower(trim(t.name)) = lower(trim(en.name))
  `;

  const catalogRows = await prisma.$queryRaw<
    { locale: string; name: string; enName: string }[]
  >`
    SELECT t.locale, t.name, en.name as "enName"
    FROM "CatalogItemTranslation" t
    JOIN "CatalogItemTranslation" en
      ON en."itemId" = t."itemId" AND en.locale = 'en'
    WHERE t.locale <> 'en'
      AND lower(trim(t.name)) = lower(trim(en.name))
  `;

  const operationRows = await prisma.$queryRaw<
    { locale: string; name: string; enName: string }[]
  >`
    SELECT t.locale, t.name, en.name as "enName"
    FROM "ServiceOperationTranslation" t
    JOIN "ServiceOperationTranslation" en
      ON en."operationId" = t."operationId" AND en.locale = 'en'
    WHERE t.locale <> 'en'
      AND lower(trim(t.name)) = lower(trim(en.name))
  `;

  await logExamples("PartSystemTranslation", systemRows);
  await logExamples("PartGroupTranslation", groupRows);
  await logExamples("PartCategoryTranslation", categoryRows);
  await logExamples("PartElementTranslation", elementRows);
  await logExamples("TaxonomyNodeTranslation", taxonomyRows);
  await logExamples("WorkCatalogItemTranslation", catalogRows);
  await logExamples("ServiceOperationTranslation", operationRows);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
