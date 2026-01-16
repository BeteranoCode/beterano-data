-- CreateEnum
CREATE TYPE "CatalogItemKind" AS ENUM ('LABOR', 'PART', 'CONSUMABLE', 'FEE');

-- CreateEnum
CREATE TYPE "Locale" AS ENUM ('ar', 'de', 'en', 'es', 'fr', 'hr', 'it', 'ja', 'nl', 'pl', 'tr', 'zh');

-- AlterEnum
ALTER TYPE "TaxonomyKind" ADD VALUE 'CATALOG';

-- CreateTable
CREATE TABLE "CatalogItem" (
    "id" TEXT NOT NULL,
    "code" INTEGER NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "CatalogItemKind" NOT NULL,
    "categoryId" TEXT NOT NULL,
    "aliases" JSONB,
    "keywords" JSONB,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CatalogItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CatalogItemTranslation" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "locale" "Locale" NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "aliases" JSONB,

    CONSTRAINT "CatalogItemTranslation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaxonomyNodeTranslation" (
    "id" TEXT NOT NULL,
    "taxonomyNodeId" TEXT NOT NULL,
    "locale" "Locale" NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "TaxonomyNodeTranslation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CatalogItem_key_key" ON "CatalogItem"("key");

-- CreateIndex
CREATE INDEX "CatalogItem_code_idx" ON "CatalogItem"("code");

-- CreateIndex
CREATE INDEX "CatalogItem_categoryId_kind_idx" ON "CatalogItem"("categoryId", "kind");

-- CreateIndex
CREATE INDEX "CatalogItemTranslation_locale_idx" ON "CatalogItemTranslation"("locale");

-- CreateIndex
CREATE UNIQUE INDEX "CatalogItemTranslation_itemId_locale_key" ON "CatalogItemTranslation"("itemId", "locale");

-- CreateIndex
CREATE INDEX "TaxonomyNodeTranslation_locale_idx" ON "TaxonomyNodeTranslation"("locale");

-- CreateIndex
CREATE UNIQUE INDEX "TaxonomyNodeTranslation_taxonomyNodeId_locale_key" ON "TaxonomyNodeTranslation"("taxonomyNodeId", "locale");

-- AddForeignKey
ALTER TABLE "CatalogItem" ADD CONSTRAINT "CatalogItem_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "TaxonomyNode"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CatalogItemTranslation" ADD CONSTRAINT "CatalogItemTranslation_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "CatalogItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxonomyNodeTranslation" ADD CONSTRAINT "TaxonomyNodeTranslation_taxonomyNodeId_fkey" FOREIGN KEY ("taxonomyNodeId") REFERENCES "TaxonomyNode"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
