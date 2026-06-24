-- CreateEnum
CREATE TYPE "ReportMode" AS ENUM ('regular', 'aggregate');

-- CreateEnum
CREATE TYPE "ReportSubtype" AS ENUM ('regular', 'activity_plan', 'daily_report');

-- Add quarterly to ReportType
ALTER TYPE "ReportType" ADD VALUE IF NOT EXISTS 'quarterly';

-- AlterTable: add reportMode and reportSubtype columns
ALTER TABLE "reports"
  ADD COLUMN "reportMode" "ReportMode" NOT NULL DEFAULT 'regular',
  ADD COLUMN "reportSubtype" "ReportSubtype" NOT NULL DEFAULT 'regular';

-- Backfill reportMode from content JSON field
UPDATE "reports"
SET "reportMode" = 'aggregate'
WHERE content::jsonb ->> 'reportMode' = 'aggregate';

-- Backfill reportSubtype from title prefix
UPDATE "reports"
SET "reportSubtype" = 'activity_plan'
WHERE title LIKE '[ACTIVITY_PLAN]%';

UPDATE "reports"
SET "reportSubtype" = 'daily_report'
WHERE title LIKE '[DAILY_REPORT]%';

-- CreateIndex: currentApproverId for fast pending-approval lookups
CREATE INDEX IF NOT EXISTS "reports_currentApproverId_idx" ON "reports"("currentApproverId");
