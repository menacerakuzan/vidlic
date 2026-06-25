-- CreateEnum
CREATE TYPE "DeputyFileEntityType" AS ENUM ('department', 'user');

-- CreateTable
CREATE TABLE "deputy_files" (
    "id" TEXT NOT NULL,
    "uploaderId" TEXT NOT NULL,
    "entityType" "DeputyFileEntityType" NOT NULL,
    "entityId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL DEFAULT 'application/octet-stream',
    "fileSize" INTEGER NOT NULL DEFAULT 0,
    "fileData" BYTEA,
    "notes" TEXT,
    "reminderAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "deputy_files_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "deputy_files_uploaderId_entityType_entityId_idx" ON "deputy_files"("uploaderId", "entityType", "entityId");
CREATE INDEX "deputy_files_uploaderId_reminderAt_idx" ON "deputy_files"("uploaderId", "reminderAt");

-- AddForeignKey
ALTER TABLE "deputy_files" ADD CONSTRAINT "deputy_files_uploaderId_fkey"
    FOREIGN KEY ("uploaderId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
