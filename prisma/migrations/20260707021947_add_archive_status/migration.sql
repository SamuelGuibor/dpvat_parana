-- AlterTable
ALTER TABLE "Process" ADD COLUMN     "archiveStatus" TEXT,
ADD COLUMN     "archivedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "archiveStatus" TEXT,
ADD COLUMN     "archivedAt" TIMESTAMP(3);
