-- AlterTable
ALTER TABLE "CaseParty" ADD COLUMN     "birthDate" DATE,
ADD COLUMN     "fatherName" TEXT,
ADD COLUMN     "occupation" TEXT,
ADD COLUMN     "partyType" TEXT NOT NULL DEFAULT 'PERSON',
ADD COLUMN     "postalCode" TEXT;

-- AlterTable
ALTER TABLE "Client" ADD COLUMN     "occupation" TEXT;

-- AlterTable
ALTER TABLE "LegalDraft" ADD COLUMN     "petitionData" JSONB,
ADD COLUMN     "petitionTypeId" TEXT;

-- CreateTable
CREATE TABLE "PetitionType" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "subKind" TEXT,
    "category" TEXT NOT NULL,
    "court" TEXT,
    "courtBasis" TEXT,
    "eligible" TEXT,
    "defendant" TEXT,
    "valueType" TEXT,
    "valueOptions" JSONB NOT NULL DEFAULT '[]',
    "evidence" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "evidenceInfo" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "fees" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "investigations" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "ancillary" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "bodyTemplate" TEXT NOT NULL,
    "blanks" JSONB NOT NULL DEFAULT '[]',
    "optionalClauses" JSONB NOT NULL DEFAULT '[]',
    "requirements" JSONB NOT NULL DEFAULT '[]',
    "notes" TEXT,
    "rules" JSONB NOT NULL DEFAULT '{}',
    "formCode" TEXT,
    "source" TEXT NOT NULL,
    "sourceLabel" TEXT,
    "sourceFileKey" TEXT,
    "sourceFileName" TEXT,
    "sourceSha256" TEXT,
    "lawCode" TEXT,
    "articleRefs" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "deadlineRuleKey" TEXT,
    "keywords" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL DEFAULT 1,
    "importReport" JSONB,
    "editedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "publishedById" TEXT,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PetitionType_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PetitionType_code_key" ON "PetitionType"("code");

-- CreateIndex
CREATE INDEX "PetitionType_kind_status_idx" ON "PetitionType"("kind", "status");

-- CreateIndex
CREATE INDEX "PetitionType_category_idx" ON "PetitionType"("category");

-- AddForeignKey
ALTER TABLE "LegalDraft" ADD CONSTRAINT "LegalDraft_petitionTypeId_fkey" FOREIGN KEY ("petitionTypeId") REFERENCES "PetitionType"("id") ON DELETE SET NULL ON UPDATE CASCADE;

