/*
 Cleanup demo/prototype data.
 Run: node scripts/cleanup-demo.js
*/
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  await prisma.$connect();
  try {
    await prisma.notification.deleteMany({});
    await prisma.reportStatusHistory.deleteMany({});
    await prisma.reportVersion.deleteMany({});
    await prisma.exportJob.deleteMany({});
    await prisma.taskComment.deleteMany({});
    await prisma.task.deleteMany({});
    await prisma.report.deleteMany({});
    await prisma.approvalAction.deleteMany({});
    await prisma.approvalInstance.deleteMany({});
    await prisma.approvalStep.deleteMany({});
    await prisma.approvalFlow.deleteMany({});
    await prisma.auditLog.deleteMany({});

    console.log('Demo data cleared.');
  } catch (e) {
    console.error('Cleanup failed:', e);
  } finally {
    await prisma.$disconnect();
  }
}

main();
