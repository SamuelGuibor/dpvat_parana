-- AlterTable
ALTER TABLE "Process" ADD COLUMN     "otherObs" TEXT,
ADD COLUMN     "service" TEXT,
ALTER COLUMN "observacao" DROP NOT NULL;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "otherObs" TEXT;
