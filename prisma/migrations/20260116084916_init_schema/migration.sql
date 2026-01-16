-- CreateEnum
CREATE TYPE "TaxonomyKind" AS ENUM ('VEHICLE_SYSTEM', 'SERVICE', 'PARTS', 'OTHER');

-- CreateEnum
CREATE TYPE "MediaType" AS ENUM ('IMG', 'GLB');

-- CreateTable
CREATE TABLE "VehicleMake" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VehicleMake_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VehicleModel" (
    "id" TEXT NOT NULL,
    "makeId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VehicleModel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VehicleVariant" (
    "id" TEXT NOT NULL,
    "modelId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "yearFrom" INTEGER,
    "yearTo" INTEGER,
    "engine" TEXT,
    "fuel" TEXT,
    "powerKw" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VehicleVariant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaxonomyNode" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "parentId" TEXT,
    "kind" "TaxonomyKind" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaxonomyNode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceOperation" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "skillKey" TEXT,
    "taxonomyNodeId" TEXT,
    "estimatedMinutes" INTEGER,
    "source" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceOperation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartCategory" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "taxonomyNodeId" TEXT,
    "source" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PartCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MediaAsset" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "type" "MediaType" NOT NULL,
    "url" TEXT NOT NULL,
    "path" TEXT,
    "taxonomyNodeId" TEXT,
    "vehicleModelId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MediaAsset_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "VehicleMake_key_key" ON "VehicleMake"("key");

-- CreateIndex
CREATE UNIQUE INDEX "VehicleModel_key_key" ON "VehicleModel"("key");

-- CreateIndex
CREATE INDEX "VehicleModel_makeId_idx" ON "VehicleModel"("makeId");

-- CreateIndex
CREATE UNIQUE INDEX "VehicleVariant_key_key" ON "VehicleVariant"("key");

-- CreateIndex
CREATE INDEX "VehicleVariant_modelId_idx" ON "VehicleVariant"("modelId");

-- CreateIndex
CREATE UNIQUE INDEX "TaxonomyNode_key_key" ON "TaxonomyNode"("key");

-- CreateIndex
CREATE INDEX "TaxonomyNode_parentId_idx" ON "TaxonomyNode"("parentId");

-- CreateIndex
CREATE INDEX "TaxonomyNode_kind_idx" ON "TaxonomyNode"("kind");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceOperation_key_key" ON "ServiceOperation"("key");

-- CreateIndex
CREATE INDEX "ServiceOperation_taxonomyNodeId_idx" ON "ServiceOperation"("taxonomyNodeId");

-- CreateIndex
CREATE INDEX "ServiceOperation_skillKey_idx" ON "ServiceOperation"("skillKey");

-- CreateIndex
CREATE UNIQUE INDEX "PartCategory_key_key" ON "PartCategory"("key");

-- CreateIndex
CREATE INDEX "PartCategory_taxonomyNodeId_idx" ON "PartCategory"("taxonomyNodeId");

-- CreateIndex
CREATE UNIQUE INDEX "MediaAsset_key_key" ON "MediaAsset"("key");

-- CreateIndex
CREATE INDEX "MediaAsset_taxonomyNodeId_idx" ON "MediaAsset"("taxonomyNodeId");

-- CreateIndex
CREATE INDEX "MediaAsset_vehicleModelId_idx" ON "MediaAsset"("vehicleModelId");

-- AddForeignKey
ALTER TABLE "VehicleModel" ADD CONSTRAINT "VehicleModel_makeId_fkey" FOREIGN KEY ("makeId") REFERENCES "VehicleMake"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VehicleVariant" ADD CONSTRAINT "VehicleVariant_modelId_fkey" FOREIGN KEY ("modelId") REFERENCES "VehicleModel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxonomyNode" ADD CONSTRAINT "TaxonomyNode_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "TaxonomyNode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceOperation" ADD CONSTRAINT "ServiceOperation_taxonomyNodeId_fkey" FOREIGN KEY ("taxonomyNodeId") REFERENCES "TaxonomyNode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartCategory" ADD CONSTRAINT "PartCategory_taxonomyNodeId_fkey" FOREIGN KEY ("taxonomyNodeId") REFERENCES "TaxonomyNode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_taxonomyNodeId_fkey" FOREIGN KEY ("taxonomyNodeId") REFERENCES "TaxonomyNode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_vehicleModelId_fkey" FOREIGN KEY ("vehicleModelId") REFERENCES "VehicleModel"("id") ON DELETE SET NULL ON UPDATE CASCADE;
