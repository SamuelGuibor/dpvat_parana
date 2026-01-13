/*
  Warnings:

  - Added the required column `targetName` to the `Comment` table without a default value. This is not possible if the table is not empty.
  - Added the required column `targetName` to the `Notification` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Comment" ADD COLUMN     "targetName" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "Notification" ADD COLUMN     "targetName" TEXT NOT NULL;
