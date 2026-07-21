-- AlterTable
ALTER TABLE "_ProcessCardTags" ADD CONSTRAINT "_ProcessCardTags_AB_pkey" PRIMARY KEY ("A", "B");

-- DropIndex
DROP INDEX "_ProcessCardTags_AB_unique";

-- AlterTable
ALTER TABLE "_UserCardTags" ADD CONSTRAINT "_UserCardTags_AB_pkey" PRIMARY KEY ("A", "B");

-- DropIndex
DROP INDEX "_UserCardTags_AB_unique";

-- AlterTable
ALTER TABLE "whatsapp_contacts" ADD COLUMN     "adHeadline" TEXT,
ADD COLUMN     "adPlatform" TEXT,
ADD COLUMN     "adReferral" JSONB,
ADD COLUMN     "adSourceId" TEXT,
ADD COLUMN     "adSourceType" TEXT,
ADD COLUMN     "adSourceUrl" TEXT,
ADD COLUMN     "ctwaClid" TEXT;
