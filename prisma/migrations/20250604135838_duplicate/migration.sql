-- AlterTable
ALTER TABLE "Document" ADD COLUMN     "processId" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "obs" TEXT,
ADD COLUMN     "service" TEXT;

-- CreateTable
CREATE TABLE "Process" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT,
    "statusStartedAt" TIMESTAMP(3),
    "data_acidente" TIMESTAMP(3),
    "atendimento_via" TEXT,
    "hospital" TEXT,
    "outro_hospital" TEXT,
    "lesoes" TEXT,
    "type" TEXT,
    "observacao" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "status" "Status",

    CONSTRAINT "Process_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "Process" ADD CONSTRAINT "Process_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_processId_fkey" FOREIGN KEY ("processId") REFERENCES "Process"("id") ON DELETE CASCADE ON UPDATE CASCADE;
