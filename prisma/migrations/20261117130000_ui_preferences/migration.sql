-- AlterTable
ALTER TABLE "User" ADD COLUMN     "uiLayout" TEXT,
ADD COLUMN     "uiPrefs" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "uiSkin" TEXT;

-- CreateTable
CREATE TABLE "UserRecent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "subtitle" TEXT,
    "link" TEXT NOT NULL,
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "visitedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserRecent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UserRecent_userId_visitedAt_idx" ON "UserRecent"("userId", "visitedAt");

-- CreateIndex
CREATE UNIQUE INDEX "UserRecent_userId_entityType_entityId_key" ON "UserRecent"("userId", "entityType", "entityId");

-- AddForeignKey
ALTER TABLE "UserRecent" ADD CONSTRAINT "UserRecent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

