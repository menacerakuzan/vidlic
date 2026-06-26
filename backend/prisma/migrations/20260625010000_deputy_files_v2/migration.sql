-- Deputy files v2: thumbnails, tags, pin, archive, versioning, folders
-- All column names use camelCase (matching Prisma conventions without @map)
-- All statements are idempotent (IF NOT EXISTS / DO $$ checks)

ALTER TABLE "deputy_files" ADD COLUMN IF NOT EXISTS "thumbnailData" BYTEA;
ALTER TABLE "deputy_files" ADD COLUMN IF NOT EXISTS "tags" TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE "deputy_files" ADD COLUMN IF NOT EXISTS "isPinned" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "deputy_files" ADD COLUMN IF NOT EXISTS "archivedAt" TIMESTAMP(3);
ALTER TABLE "deputy_files" ADD COLUMN IF NOT EXISTS "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "deputy_files" ADD COLUMN IF NOT EXISTS "parentFileId" TEXT;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'deputy_files_parentFileId_fkey') THEN
    ALTER TABLE "deputy_files"
      ADD CONSTRAINT "deputy_files_parentFileId_fkey"
      FOREIGN KEY ("parentFileId") REFERENCES "deputy_files"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "deputy_files_uploaderId_isPinned_idx" ON "deputy_files"("uploaderId", "isPinned");
CREATE INDEX IF NOT EXISTS "deputy_files_uploaderId_archivedAt_idx" ON "deputy_files"("uploaderId", "archivedAt");
CREATE INDEX IF NOT EXISTS "deputy_files_parentFileId_idx" ON "deputy_files"("parentFileId");

-- Folders table
CREATE TABLE IF NOT EXISTS "deputy_folders" (
    "id" TEXT NOT NULL,
    "uploaderId" TEXT NOT NULL,
    "entityType" "DeputyFileEntityType" NOT NULL,
    "entityId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "deputy_folders_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'deputy_folders_uploaderId_fkey') THEN
    ALTER TABLE "deputy_folders"
      ADD CONSTRAINT "deputy_folders_uploaderId_fkey"
      FOREIGN KEY ("uploaderId") REFERENCES "users"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "deputy_folders_uploaderId_entityType_entityId_idx"
  ON "deputy_folders"("uploaderId", "entityType", "entityId");

-- folderId on deputy_files
ALTER TABLE "deputy_files" ADD COLUMN IF NOT EXISTS "folderId" TEXT;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'deputy_files_folderId_fkey') THEN
    ALTER TABLE "deputy_files"
      ADD CONSTRAINT "deputy_files_folderId_fkey"
      FOREIGN KEY ("folderId") REFERENCES "deputy_folders"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "deputy_files_folderId_idx" ON "deputy_files"("folderId");
