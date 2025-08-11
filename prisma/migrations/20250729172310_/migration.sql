/*
  Warnings:

  - You are about to drop the column `password` on the `Process` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "Process_email_key";

-- AlterTable
ALTER TABLE "Process" DROP COLUMN "password",
ALTER COLUMN "email" DROP NOT NULL;
