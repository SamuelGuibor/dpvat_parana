-- CreateTable
CREATE TABLE "admin_checklist_items" (
    "id" TEXT NOT NULL,
    "processId" TEXT,
    "userId" TEXT,
    "text" TEXT NOT NULL,
    "checked" BOOLEAN NOT NULL DEFAULT false,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "admin_checklist_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "admin_checklist_items_processId_idx" ON "admin_checklist_items"("processId");

-- CreateIndex
CREATE INDEX "admin_checklist_items_userId_idx" ON "admin_checklist_items"("userId");
