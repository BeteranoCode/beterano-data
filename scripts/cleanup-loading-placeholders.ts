import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function clear(table: "PartSystemTranslation" | "PartGroupTranslation" | "PartCategoryTranslation" | "PartElementTranslation") {
  const result = await prisma.$executeRawUnsafe(
    `UPDATE "${table}" SET name = '', "confidenceHint" = 'missing' WHERE name = 'Loading...'`
  );
  return result;
}

async function main() {
  const system = await clear("PartSystemTranslation");
  const group = await clear("PartGroupTranslation");
  const category = await clear("PartCategoryTranslation");
  const element = await clear("PartElementTranslation");

  console.log(`PartSystemTranslation cleared: ${system}`);
  console.log(`PartGroupTranslation cleared: ${group}`);
  console.log(`PartCategoryTranslation cleared: ${category}`);
  console.log(`PartElementTranslation cleared: ${element}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
