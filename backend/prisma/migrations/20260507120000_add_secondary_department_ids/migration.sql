-- AlterTable
ALTER TABLE "users" ADD COLUMN "secondaryDepartmentIds" JSONB NOT NULL DEFAULT '[]';
