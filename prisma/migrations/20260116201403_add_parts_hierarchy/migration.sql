-- AlterTable
ALTER TABLE "PartCategory" ADD COLUMN     "groupId" TEXT,
ADD COLUMN     "systemId" TEXT;

-- CreateTable
CREATE TABLE "ServiceOperationTranslation" (
    "id" TEXT NOT NULL,
    "operationId" TEXT NOT NULL,
    "locale" "Locale" NOT NULL,
    "name" TEXT NOT NULL,
    "aliases" JSONB,
    "keywords" JSONB,
    "confidenceHint" TEXT,

    CONSTRAINT "ServiceOperationTranslation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartSystem" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "imageUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PartSystem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartGroup" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,
    "imageUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PartGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartElement" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "legacyId" TEXT,
    "imageUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PartElement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartSystemTranslation" (
    "id" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,
    "locale" "Locale" NOT NULL,
    "name" TEXT NOT NULL,
    "aliasesJson" JSONB,
    "keywordsJson" JSONB,
    "confidenceHint" TEXT,

    CONSTRAINT "PartSystemTranslation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartGroupTranslation" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "locale" "Locale" NOT NULL,
    "name" TEXT NOT NULL,
    "aliasesJson" JSONB,
    "keywordsJson" JSONB,
    "confidenceHint" TEXT,

    CONSTRAINT "PartGroupTranslation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartCategoryTranslation" (
    "id" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "locale" "Locale" NOT NULL,
    "name" TEXT NOT NULL,
    "aliasesJson" JSONB,
    "keywordsJson" JSONB,
    "confidenceHint" TEXT,

    CONSTRAINT "PartCategoryTranslation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartElementTranslation" (
    "id" TEXT NOT NULL,
    "elementId" TEXT NOT NULL,
    "locale" "Locale" NOT NULL,
    "name" TEXT NOT NULL,
    "aliasesJson" JSONB,
    "keywordsJson" JSONB,
    "confidenceHint" TEXT,

    CONSTRAINT "PartElementTranslation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ServiceOperationTranslation_locale_idx" ON "ServiceOperationTranslation"("locale");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceOperationTranslation_operationId_locale_key" ON "ServiceOperationTranslation"("operationId", "locale");

-- CreateIndex
CREATE UNIQUE INDEX "PartSystem_key_key" ON "PartSystem"("key");

-- CreateIndex
CREATE UNIQUE INDEX "PartGroup_key_key" ON "PartGroup"("key");

-- CreateIndex
CREATE INDEX "PartGroup_systemId_idx" ON "PartGroup"("systemId");

-- CreateIndex
CREATE UNIQUE INDEX "PartElement_key_key" ON "PartElement"("key");

-- CreateIndex
CREATE INDEX "PartElement_categoryId_idx" ON "PartElement"("categoryId");

-- CreateIndex
CREATE INDEX "PartSystemTranslation_locale_idx" ON "PartSystemTranslation"("locale");

-- CreateIndex
CREATE UNIQUE INDEX "PartSystemTranslation_systemId_locale_key" ON "PartSystemTranslation"("systemId", "locale");

-- CreateIndex
CREATE INDEX "PartGroupTranslation_locale_idx" ON "PartGroupTranslation"("locale");

-- CreateIndex
CREATE UNIQUE INDEX "PartGroupTranslation_groupId_locale_key" ON "PartGroupTranslation"("groupId", "locale");

-- CreateIndex
CREATE INDEX "PartCategoryTranslation_locale_idx" ON "PartCategoryTranslation"("locale");

-- CreateIndex
CREATE UNIQUE INDEX "PartCategoryTranslation_categoryId_locale_key" ON "PartCategoryTranslation"("categoryId", "locale");

-- CreateIndex
CREATE INDEX "PartElementTranslation_locale_idx" ON "PartElementTranslation"("locale");

-- CreateIndex
CREATE UNIQUE INDEX "PartElementTranslation_elementId_locale_key" ON "PartElementTranslation"("elementId", "locale");

-- CreateIndex
CREATE INDEX "PartCategory_groupId_idx" ON "PartCategory"("groupId");

-- CreateIndex
CREATE INDEX "PartCategory_systemId_idx" ON "PartCategory"("systemId");

-- AddForeignKey
ALTER TABLE "PartCategory" ADD CONSTRAINT "PartCategory_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "PartGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartCategory" ADD CONSTRAINT "PartCategory_systemId_fkey" FOREIGN KEY ("systemId") REFERENCES "PartSystem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceOperationTranslation" ADD CONSTRAINT "ServiceOperationTranslation_operationId_fkey" FOREIGN KEY ("operationId") REFERENCES "ServiceOperation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartGroup" ADD CONSTRAINT "PartGroup_systemId_fkey" FOREIGN KEY ("systemId") REFERENCES "PartSystem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartElement" ADD CONSTRAINT "PartElement_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "PartCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartSystemTranslation" ADD CONSTRAINT "PartSystemTranslation_systemId_fkey" FOREIGN KEY ("systemId") REFERENCES "PartSystem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartGroupTranslation" ADD CONSTRAINT "PartGroupTranslation_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "PartGroup"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartCategoryTranslation" ADD CONSTRAINT "PartCategoryTranslation_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "PartCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartElementTranslation" ADD CONSTRAINT "PartElementTranslation_elementId_fkey" FOREIGN KEY ("elementId") REFERENCES "PartElement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
