-- Deputy files v2: thumbnails, tags, pin, archive, versioning
-- Note: existing columns in deputy_files use camelCase (from migration 20260625000000)

ALTER TABLE "deputy_files" ADD COLUMN IF NOT EXISTS "thumbnailData" BYTEA;
ALTER TABLE "deputy_files" ADD COLUMN IF NOT EXISTS "tags" TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE "deputy_files" ADD COLUMN IF NOT EXISTS "isPinned" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "deputy_files" ADD COLUMN IF NOT EXISTS "archivedAt" TIMESTAMP(3);
ALTER TABLE "deputy_files" ADD COLUMN IF NOT EXISTS "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "deputy_files" ADD COLUMN IF NOT EXISTS "parentFileId" TEXT;

ALTER TABLE "deputy_files"
  ADD CONSTRAINT "deputy_files_parentFileId_fkey"
  FOREIGN KEY ("parentFileId") REFERENCES "deputy_files"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "deputy_files_uploaderId_isPinned_idx" ON "deputy_files"("uploaderId", "isPinned");
CREATE INDEX IF NOT EXISTS "deputy_files_uploaderId_archivedAt_idx" ON "deputy_files"("uploaderId", "archivedAt");
CREATE INDEX IF NOT EXISTS "deputy_files_parentFileId_idx" ON "deputy_files"("parentFileId");
