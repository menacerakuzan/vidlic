-- Deputy files v2: thumbnails, tags, pin, archive, versioning

ALTER TABLE "deputy_files" ADD COLUMN IF NOT EXISTS "thumbnail_data" BYTEA;
ALTER TABLE "deputy_files" ADD COLUMN IF NOT EXISTS "tags" TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE "deputy_files" ADD COLUMN IF NOT EXISTS "is_pinned" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "deputy_files" ADD COLUMN IF NOT EXISTS "archived_at" TIMESTAMP(3);
ALTER TABLE "deputy_files" ADD COLUMN IF NOT EXISTS "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "deputy_files" ADD COLUMN IF NOT EXISTS "parent_file_id" TEXT;

ALTER TABLE "deputy_files"
  ADD CONSTRAINT "deputy_files_parent_file_id_fkey"
  FOREIGN KEY ("parent_file_id") REFERENCES "deputy_files"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "deputy_files_uploader_id_is_pinned_idx" ON "deputy_files"("uploader_id", "is_pinned");
CREATE INDEX IF NOT EXISTS "deputy_files_uploader_id_archived_at_idx" ON "deputy_files"("uploader_id", "archived_at");
CREATE INDEX IF NOT EXISTS "deputy_files_parent_file_id_idx" ON "deputy_files"("parent_file_id");
