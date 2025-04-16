-- DropForeignKey
ALTER TABLE "SubMessage" DROP CONSTRAINT "SubMessage_messageId_fkey";

-- AddForeignKey
ALTER TABLE "SubMessage" ADD CONSTRAINT "SubMessage_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;
