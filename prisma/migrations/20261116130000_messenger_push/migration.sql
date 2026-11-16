-- AlterTable
ALTER TABLE "Notification" ADD COLUMN     "pushedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "messengerChatId" TEXT;

