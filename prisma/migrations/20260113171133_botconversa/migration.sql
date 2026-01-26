-- CreateTable
CREATE TABLE "Botconversa" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "evento" TEXT NOT NULL,
    "telefone" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),

    CONSTRAINT "Botconversa_pkey" PRIMARY KEY ("id")
);
