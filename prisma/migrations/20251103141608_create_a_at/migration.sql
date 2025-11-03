-- AlterTable
ALTER TABLE "Document" ADD COLUMN     "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "updatedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Message" ADD COLUMN     "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "updatedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Process" ALTER COLUMN "fixed" SET DEFAULT true,
ALTER COLUMN "roleFixed" SET DEFAULT 'Acompanhamento de fluxo 1';

-- AlterTable
ALTER TABLE "SubMessage" ADD COLUMN     "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "updatedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "User" ALTER COLUMN "fixed" SET DEFAULT true,
ALTER COLUMN "roleFixed" SET DEFAULT 'Acompanhamento de fluxo 1';
