-- AlterTable
ALTER TABLE "DeadlineRule" ADD COLUMN     "articleNos" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "lawCode" TEXT;

-- AlterTable
ALTER TABLE "LegalSource" ADD COLUMN     "editedAt" TIMESTAMP(3),
ADD COLUMN     "editedById" TEXT,
ADD COLUMN     "headingPath" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "lawCode" TEXT,
ADD COLUMN     "orderNo" INTEGER,
ADD COLUMN     "sourcePages" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'VALID',
ADD COLUMN     "statusNote" TEXT;

-- CreateTable
CREATE TABLE "Law" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "shortTitle" TEXT,
    "approvedAt" TEXT,
    "sourceName" TEXT NOT NULL,
    "sourceSha256" TEXT,
    "sourceFileKey" TEXT,
    "sourcePageOffset" INTEGER NOT NULL DEFAULT 0,
    "headings" JSONB NOT NULL DEFAULT '[]',
    "closing" TEXT,
    "articleCount" INTEGER NOT NULL DEFAULT 0,
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verifiedAt" TIMESTAMP(3),
    "verifiedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Law_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Law_code_key" ON "Law"("code");

-- CreateIndex
CREATE INDEX "LegalSource_lawCode_orderNo_idx" ON "LegalSource"("lawCode", "orderNo");

-- CreateIndex
CREATE UNIQUE INDEX "LegalSource_lawCode_articleNo_key" ON "LegalSource"("lawCode", "articleNo");

-- AddForeignKey
ALTER TABLE "LegalSource" ADD CONSTRAINT "LegalSource_lawCode_fkey" FOREIGN KEY ("lawCode") REFERENCES "Law"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

