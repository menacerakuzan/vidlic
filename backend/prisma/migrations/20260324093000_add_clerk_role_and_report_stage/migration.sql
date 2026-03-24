-- Add new role and report stage
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'clerk';
ALTER TYPE "ReportStatus" ADD VALUE IF NOT EXISTS 'pending_clerk';

-- Add clerk assignment for department (one clerk can aggregate multiple child departments under one parent department)
ALTER TABLE "departments"
ADD COLUMN IF NOT EXISTS "clerkId" TEXT;

ALTER TABLE "departments"
ADD CONSTRAINT "departments_clerkId_fkey"
FOREIGN KEY ("clerkId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "departments_clerkId_idx" ON "departments"("clerkId");
