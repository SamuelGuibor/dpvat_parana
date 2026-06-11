-- CreateTable
CREATE TABLE "instructions" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "text" TEXT,
    "color" TEXT NOT NULL DEFAULT 'amber',
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "folderName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "instructions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "instruction_files" (
    "id" TEXT NOT NULL,
    "instructionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "size" TEXT,
    "type" TEXT,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "instruction_files_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "instructions_folderName_key" ON "instructions"("folderName");

-- CreateIndex
CREATE INDEX "instruction_files_instructionId_idx" ON "instruction_files"("instructionId");

-- AddForeignKey
ALTER TABLE "instruction_files" ADD CONSTRAINT "instruction_files_instructionId_fkey" FOREIGN KEY ("instructionId") REFERENCES "instructions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
