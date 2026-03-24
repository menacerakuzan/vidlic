import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../shared/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class SlaMonitorService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SlaMonitorService.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  onModuleInit() {
    const intervalMs = Number(process.env.SLA_MONITOR_INTERVAL_MS || 300000);
    this.timer = setInterval(() => this.check().catch(() => undefined), intervalMs);
    this.check().catch(() => undefined);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private async check() {
    if (this.running) return;
    this.running = true;
    try {
      const managerHours = Number(process.env.SLA_MANAGER_HOURS || 24);
      const clerkHours = Number(process.env.SLA_CLERK_HOURS || 24);
      const directorHours = Number(process.env.SLA_DIRECTOR_HOURS || 24);
      const managerThreshold = new Date(Date.now() - managerHours * 60 * 60 * 1000);
      const clerkThreshold = new Date(Date.now() - clerkHours * 60 * 60 * 1000);
      const directorThreshold = new Date(Date.now() - directorHours * 60 * 60 * 1000);

      const overdueManager = await this.prisma.report.findMany({
        where: {
          status: 'pending_manager',
          submittedAt: { lt: managerThreshold },
          currentApproverId: { not: null },
        },
        include: { department: true },
        take: 80,
      });

      const overdueDirector = await this.prisma.report.findMany({
        where: {
          status: 'pending_director',
          submittedAt: { lt: directorThreshold },
          currentApproverId: { not: null },
        },
        include: { department: true },
        take: 80,
      });

      const overdueClerk = await this.prisma.report.findMany({
        where: {
          status: 'pending_clerk',
          submittedAt: { lt: clerkThreshold },
          currentApproverId: { not: null },
        },
        include: { department: true },
        take: 80,
      });

      for (const report of [...overdueManager, ...overdueClerk, ...overdueDirector]) {
        await this.escalateReport(report);
      }
    } catch (error) {
      this.logger.warn(`SLA monitor failed: ${(error as Error)?.message || 'unknown error'}`);
    } finally {
      this.running = false;
    }
  }

  private async escalateReport(report: any) {
    const stage = report.status;
    const recipients = new Set<string>();
    if (report.currentApproverId) recipients.add(report.currentApproverId);

    if (stage === 'pending_manager' && report.department?.directorId) {
      recipients.add(report.department.directorId);
    }
    if (stage === 'pending_clerk' && report.department?.directorId) {
      recipients.add(report.department.directorId);
    }

    const admins = await this.prisma.user.findMany({
      where: { role: 'admin', isActive: true },
      select: { id: true },
      take: 5,
    });
    admins.forEach((admin) => recipients.add(admin.id));

    for (const userId of recipients) {
      const exists = await this.prisma.slaEscalationEvent.findFirst({
        where: {
          reportId: report.id,
          stage,
          escalatedToId: userId,
          createdAt: { gt: new Date(Date.now() - 24 * 60 * 60 * 1000) },
        },
      });
      if (exists) continue;

      await this.notifications.create({
        userId,
        type: 'reminder',
        title: 'SLA-ескалація погодження',
        message: `Звіт "${report.title || report.id}" перевищив SLA на етапі ${stage}. Потрібна дія.`,
        referenceType: 'report',
        referenceId: report.id,
      });
      await this.prisma.slaEscalationEvent.create({
        data: {
          reportId: report.id,
          stage,
          escalatedToId: userId,
          reason: `SLA overdue for ${stage}`,
        },
      });
    }
  }
}
