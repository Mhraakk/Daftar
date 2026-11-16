-- DropForeignKey
ALTER TABLE "SkillRun" DROP CONSTRAINT "SkillRun_interactionId_fkey";

-- DropIndex
DROP INDEX "SkillRun_interactionId_key";

-- AlterTable
ALTER TABLE "AiInteraction" ADD COLUMN     "attempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "finishedAt" TIMESTAMP(3),
ADD COLUMN     "meta" JSONB,
ADD COLUMN     "request" JSONB,
ADD COLUMN     "skillRunId" TEXT,
ADD COLUMN     "startedAt" TIMESTAMP(3),
ADD COLUMN     "stopReason" TEXT,
ADD COLUMN     "title" TEXT,
ALTER COLUMN "status" SET DEFAULT 'QUEUED';

-- AlterTable
ALTER TABLE "LegalSkill" ADD COLUMN     "category" TEXT,
ADD COLUMN     "mode" TEXT NOT NULL DEFAULT 'RUN',
ADD COLUMN     "path" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "sizeBytes" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "summaryFa" TEXT,
ADD COLUMN     "version" TEXT;

-- AlterTable
ALTER TABLE "SkillRun" DROP COLUMN "interactionId",
ADD COLUMN     "dataScope" JSONB,
ADD COLUMN     "gates" JSONB,
ADD COLUMN     "messages" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "preflight" JSONB,
ADD COLUMN     "skillSha256" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "title" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ALTER COLUMN "status" SET DEFAULT 'QUEUED';

-- CreateIndex
CREATE INDEX "AiInteraction_status_createdAt_idx" ON "AiInteraction"("status", "createdAt");

-- CreateIndex
CREATE INDEX "AiInteraction_skillRunId_idx" ON "AiInteraction"("skillRunId");

-- CreateIndex
CREATE INDEX "SkillRun_skillId_idx" ON "SkillRun"("skillId");

-- AddForeignKey
ALTER TABLE "AiInteraction" ADD CONSTRAINT "AiInteraction_skillRunId_fkey" FOREIGN KEY ("skillRunId") REFERENCES "SkillRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

