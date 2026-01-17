-- DropIndex
DROP INDEX "PartCategory_key_key";

-- DropIndex
DROP INDEX "PartGroup_key_key";

-- AlterTable
ALTER TABLE "PartCategory" ADD COLUMN     "imageKey" TEXT;

-- AlterTable
ALTER TABLE "PartElement" ADD COLUMN     "groupId" TEXT,
ADD COLUMN     "imageKey" TEXT,
ADD COLUMN     "systemId" TEXT;

-- AlterTable
ALTER TABLE "PartGroup" ADD COLUMN     "imageKey" TEXT;

-- AlterTable
ALTER TABLE "PartSystem" ADD COLUMN     "imageKey" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "PartCategory_groupId_key_key" ON "PartCategory"("groupId", "key");

-- CreateIndex
CREATE INDEX "PartElement_systemId_idx" ON "PartElement"("systemId");

-- CreateIndex
CREATE INDEX "PartElement_groupId_idx" ON "PartElement"("groupId");

-- CreateIndex
CREATE UNIQUE INDEX "PartGroup_systemId_key_key" ON "PartGroup"("systemId", "key");

-- AddForeignKey
ALTER TABLE "PartElement" ADD CONSTRAINT "PartElement_systemId_fkey" FOREIGN KEY ("systemId") REFERENCES "PartSystem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartElement" ADD CONSTRAINT "PartElement_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "PartGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;
