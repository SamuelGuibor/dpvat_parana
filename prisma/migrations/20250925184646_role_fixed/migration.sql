-- DropForeignKey
ALTER TABLE "Document" DROP CONSTRAINT "Document_userId_fkey";

-- AlterTable
ALTER TABLE "Process" ADD COLUMN     "fixed" BOOLEAN,
ADD COLUMN     "roleFixed" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "fixed" BOOLEAN,
ADD COLUMN     "roleFixed" TEXT,
ALTER COLUMN "role" SET DEFAULT 'Filtro de Cartões';

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
