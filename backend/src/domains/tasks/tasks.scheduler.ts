import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../shared/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class TasksScheduler {
  private readonly logger = new Logger(TasksScheduler.name);

  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  async autoArchiveCompletedTasks() {
    const oneDayAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const result = await this.prisma.task.updateMany({
      where: {
        status: 'done',
        completedAt: { lte: oneDayAgo },
        deletedAt: null,
        archivedAt: null,
      },
      data: { archivedAt: new Date() },
    });

    if (result.count > 0) {
      this.logger.log(`Auto-archived ${result.count} completed tasks`);
    }
  }

  // Runs every day at 8:00 AM
  @Cron('0 8 * * *')
  async notifyOverdueTasks() {
    const now = new Date();

    const overdueTasks = await this.prisma.task.findMany({
      where: {
        status: { not: 'done' },
        dueDate: { lt: now },
        deletedAt: null,
        archivedAt: null,
        assigneeId: { not: null },
      },
      select: {
        id: true,
        title: true,
        dueDate: true,
        assigneeId: true,
        reporterId: true,
      },
    });

    if (!overdueTasks.length) return;

    // deduplicate by assigneeId to avoid spamming (one notification per user per run)
    const notifiedUsers = new Set<string>();
    let sent = 0;

    for (const task of overdueTasks) {
      const targets = [...new Set([task.assigneeId, task.reporterId].filter(Boolean))] as string[];
      for (const userId of targets) {
        if (notifiedUsers.has(`${userId}:${task.id}`)) continue;
        notifiedUsers.add(`${userId}:${task.id}`);

        // skip if we already sent an overdue notification for this task today
        const alreadySent = await this.prisma.notification.findFirst({
          where: {
            userId,
            type: 'task_overdue',
            referenceId: task.id,
            createdAt: { gte: new Date(now.getFullYear(), now.getMonth(), now.getDate()) },
          },
          select: { id: true },
        });
        if (alreadySent) continue;

        const daysOverdue = Math.floor((now.getTime() - task.dueDate!.getTime()) / 86400000);
        await this.notifications.create({
          userId,
          type: 'task_overdue',
          title: 'Прострочена задача',
          message: `Задача "${task.title}" прострочена на ${daysOverdue} ${this.pluralDays(daysOverdue)}`,
          referenceType: 'task',
          referenceId: task.id,
        });
        sent++;
      }
    }

    if (sent > 0) {
      this.logger.log(`Sent ${sent} task_overdue notifications`);
    }
  }

  private pluralDays(n: number) {
    if (n % 10 === 1 && n % 100 !== 11) return 'день';
    if ([2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100)) return 'дні';
    return 'днів';
  }
}
