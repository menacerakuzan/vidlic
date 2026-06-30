-- Create managements table
CREATE TABLE IF NOT EXISTS "managements" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameUk" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "headId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "managements_pkey" PRIMARY KEY ("id")
);

-- FK: managements.departmentId → departments.id
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'managements_departmentId_fkey') THEN
    ALTER TABLE "managements"
      ADD CONSTRAINT "managements_departmentId_fkey"
      FOREIGN KEY ("departmentId") REFERENCES "departments"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- FK: managements.headId → users.id
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'managements_headId_fkey') THEN
    ALTER TABLE "managements"
      ADD CONSTRAINT "managements_headId_fkey"
      FOREIGN KEY ("headId") REFERENCES "users"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "managements_departmentId_idx" ON "managements"("departmentId");

-- Add managementId to departments
ALTER TABLE "departments" ADD COLUMN IF NOT EXISTS "managementId" TEXT;

-- FK: departments.managementId → managements.id
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'departments_managementId_fkey') THEN
    ALTER TABLE "departments"
      ADD CONSTRAINT "departments_managementId_fkey"
      FOREIGN KEY ("managementId") REFERENCES "managements"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "departments_managementId_idx" ON "departments"("managementId");
