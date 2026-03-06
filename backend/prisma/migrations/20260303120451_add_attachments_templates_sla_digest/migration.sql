-- CreateEnum
CREATE TYPE "AttachmentEntityType" AS ENUM ('report', 'task');

-- CreateEnum
CREATE TYPE "DigestFrequency" AS ENUM ('daily', 'weekly');

-- CreateTable
CREATE TABLE "attachments" (
    "id" TEXT NOT NULL,
    "entityType" "AttachmentEntityType" NOT NULL,
    "reportId" TEXT,
    "taskId" TEXT,
    "uploaderId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "department_report_templates" (
    "id" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "titlePattern" TEXT,
    "headerPattern" TEXT,
    "sectionSchema" JSONB NOT NULL DEFAULT '[]',
    "aiPrompt" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "department_report_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "digest_subscriptions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "frequency" "DigestFrequency" NOT NULL DEFAULT 'daily',
    "hour" INTEGER NOT NULL DEFAULT 9,
    "minute" INTEGER NOT NULL DEFAULT 0,
    "weekdays" TEXT NOT NULL DEFAULT '1,2,3,4,5',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastSentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "digest_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sla_escalation_events" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "stage" "ReportStatus" NOT NULL,
    "escalatedToId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sla_escalation_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "attachments_entityType_reportId_taskId_idx" ON "attachments"("entityType", "reportId", "taskId");

-- CreateIndex
CREATE INDEX "attachments_uploaderId_createdAt_idx" ON "attachments"("uploaderId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "department_report_templates_departmentId_key" ON "department_report_templates"("departmentId");

-- CreateIndex
CREATE INDEX "digest_subscriptions_isActive_frequency_hour_minute_idx" ON "digest_subscriptions"("isActive", "frequency", "hour", "minute");

-- CreateIndex
CREATE UNIQUE INDEX "digest_subscriptions_userId_frequency_key" ON "digest_subscriptions"("userId", "frequency");

-- CreateIndex
CREATE INDEX "sla_escalation_events_reportId_stage_createdAt_idx" ON "sla_escalation_events"("reportId", "stage", "createdAt");

-- CreateIndex
CREATE INDEX "sla_escalation_events_escalatedToId_createdAt_idx" ON "sla_escalation_events"("escalatedToId", "createdAt");

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_uploaderId_fkey" FOREIGN KEY ("uploaderId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "department_report_templates" ADD CONSTRAINT "department_report_templates_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "department_report_templates" ADD CONSTRAINT "department_report_templates_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "digest_subscriptions" ADD CONSTRAINT "digest_subscriptions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sla_escalation_events" ADD CONSTRAINT "sla_escalation_events_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sla_escalation_events" ADD CONSTRAINT "sla_escalation_events_escalatedToId_fkey" FOREIGN KEY ("escalatedToId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
