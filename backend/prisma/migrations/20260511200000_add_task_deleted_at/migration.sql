ALTER TABLE "tasks" ADD COLUMN "deletedAt" TIMESTAMP(3);
CREATE INDEX "tasks_deletedAt_idx" ON "tasks"("deletedAt");
