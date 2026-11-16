/*
  Warnings:

  - You are about to drop the column `daysAbroad` on the `DeadlineRule` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "DeadlineRule" DROP COLUMN "daysAbroad",
ADD COLUMN     "monthsAbroad" INTEGER;
