-- Step 1: Add temporary text columns
ALTER TABLE "User" ADD COLUMN "data_nasc_tmp" TEXT;
ALTER TABLE "User" ADD COLUMN "data_acidente_tmp" TEXT;
ALTER TABLE "Process" ADD COLUMN "data_nasc_tmp" TEXT;
ALTER TABLE "Process" ADD COLUMN "data_acidente_tmp" TEXT;

-- Step 2: Copy converted values to temp columns
UPDATE "User" SET "data_nasc_tmp" = TO_CHAR("data_nasc", 'DD/MM/YYYY') WHERE "data_nasc" IS NOT NULL;
UPDATE "User" SET "data_acidente_tmp" = TO_CHAR("data_acidente", 'DD/MM/YYYY') WHERE "data_acidente" IS NOT NULL;
UPDATE "Process" SET "data_nasc_tmp" = TO_CHAR("data_nasc", 'DD/MM/YYYY') WHERE "data_nasc" IS NOT NULL;
UPDATE "Process" SET "data_acidente_tmp" = TO_CHAR("data_acidente", 'DD/MM/YYYY') WHERE "data_acidente" IS NOT NULL;

-- Step 3: Drop old columns and rename temp
ALTER TABLE "User" DROP COLUMN "data_nasc";
ALTER TABLE "User" RENAME COLUMN "data_nasc_tmp" TO "data_nasc";
ALTER TABLE "User" DROP COLUMN "data_acidente";
ALTER TABLE "User" RENAME COLUMN "data_acidente_tmp" TO "data_acidente";

ALTER TABLE "Process" DROP COLUMN "data_nasc";
ALTER TABLE "Process" RENAME COLUMN "data_nasc_tmp" TO "data_nasc";
ALTER TABLE "Process" DROP COLUMN "data_acidente";
ALTER TABLE "Process" RENAME COLUMN "data_acidente_tmp" TO "data_acidente";

-- CreateTable
CREATE TABLE "SavedPrompt" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SavedPrompt_pkey" PRIMARY KEY ("id")
);
