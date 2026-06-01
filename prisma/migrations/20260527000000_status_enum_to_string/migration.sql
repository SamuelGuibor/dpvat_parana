-- AlterTable: convert User.status from enum to TEXT
ALTER TABLE "User" ALTER COLUMN "status" TYPE TEXT USING "status"::TEXT;

-- AlterTable: convert Process.status from enum to TEXT
ALTER TABLE "Process" ALTER COLUMN "status" TYPE TEXT USING "status"::TEXT;

-- DropEnum
DROP TYPE "Status";
