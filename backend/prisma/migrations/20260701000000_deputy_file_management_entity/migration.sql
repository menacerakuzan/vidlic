-- Allow deputy files/folders to be attached to a management (управління).
-- ADD VALUE IF NOT EXISTS is idempotent and safe to re-run.
ALTER TYPE "DeputyFileEntityType" ADD VALUE IF NOT EXISTS 'management';
