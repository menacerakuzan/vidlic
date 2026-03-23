-- AlterTable
ALTER TABLE "tasks"
ADD COLUMN "executionHours" INTEGER,
ADD COLUMN "isPrivate" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "tasks_isPrivate_idx" ON "tasks"("isPrivate");
