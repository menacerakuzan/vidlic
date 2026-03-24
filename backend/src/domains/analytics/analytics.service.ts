import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../shared/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class AnalyticsService implements OnModuleInit, OnModuleDestroy {
  private digestTimer: NodeJS.Timeout | null = null;
  private digestRunning = false;

  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
  ) {}

  onModuleInit() {
    this.digestTimer = setInterval(() => this.runDigestScheduler().catch(() => undefined), 5 * 60 * 1000);
    this.runDigestScheduler().catch(() => undefined);
  }

  onModuleDestroy() {
    if (this.digestTimer) clearInterval(this.digestTimer);
  }

  async getDashboard(user: any) {
    const departmentId = user.departmentId;
    const dateFrom = new Date();
    dateFrom.setDate(dateFrom.getDate() - 30);

    const [
      reportsStats,
      tasksStats,
      pendingApprovals,
      overdueTasks,
      recentReports,
    ] = await Promise.all([
      this.getReportsStats(departmentId, dateFrom),
      this.getTasksStats(departmentId),
      this.getPendingApprovals(user),
      this.getOverdueTasks(departmentId),
      this.getRecentReports(departmentId),
    ]);

    return {
      reports: reportsStats,
      tasks: tasksStats,
      pendingApprovals,
      overdueTasks,
      recentReports,
    };
  }

  async getReportsStats(departmentId: string | null, dateFrom: Date) {
    const where: any = {
      createdAt: { gte: dateFrom },
    };

    if (departmentId) {
      where.departmentId = departmentId;
    }

    const [total, byStatus, byType] = await Promise.all([
      this.prisma.report.count({ where }),
      this.prisma.report.groupBy({
        by: ['status'],
        where,
        _count: true,
      }),
      this.prisma.report.groupBy({
        by: ['reportType'],
        where,
        _count: true,
      }),
    ]);

    return {
      total,
      byStatus: byStatus.reduce((acc, s) => ({ ...acc, [s.status]: s._count }), {}),
      byType: byType.reduce((acc, t) => ({ ...acc, [t.reportType]: t._count }), {}),
    };
  }

  async getTasksStats(departmentId: string | null) {
    const where: any = {};

    if (departmentId) {
      where.departmentId = departmentId;
    }

    const [total, byStatus, byPriority, overdue] = await Promise.all([
      this.prisma.task.count({ where }),
      this.prisma.task.groupBy({
        by: ['status'],
        where,
        _count: true,
      }),
      this.prisma.task.groupBy({
        by: ['priority'],
        where,
        _count: true,
      }),
      this.prisma.task.count({
        where: {
          ...where,
          status: { not: 'done' },
          dueDate: { lt: new Date() },
        },
      }),
    ]);

    return {
      total,
      byStatus: byStatus.reduce((acc, s) => ({ ...acc, [s.status]: s._count }), {}),
      byPriority: byPriority.reduce((acc, p) => ({ ...acc, [p.priority]: p._count }), {}),
      overdue,
    };
  }

  async getPendingApprovals(user: any) {
    const where: any = {
      status: { in: ['pending_manager', 'pending_clerk', 'pending_director'] },
    };

    if (user.role === 'manager') {
      where.currentApproverId = user.id;
    } else if (user.role === 'clerk') {
      where.currentApproverId = user.id;
    } else if (user.role === 'director') {
      where.status = 'pending_director';
      if (user.departmentId) {
        where.departmentId = user.departmentId;
      }
    } else if (user.role === 'specialist') {
      return { total: 0, items: [] };
    }

    const reports = await this.prisma.report.findMany({
      where,
      take: 10,
      include: {
        author: { select: { firstName: true, lastName: true } },
        department: { select: { nameUk: true } },
      },
      orderBy: { submittedAt: 'asc' },
    });

    return {
      total: reports.length,
      items: reports.map(r => ({
        id: r.id,
        type: r.reportType,
        title: r.title,
        author: `${r.author.firstName} ${r.author.lastName}`,
        department: r.department?.nameUk,
        submittedAt: r.submittedAt,
      })),
    };
  }

  async getOverdueTasks(departmentId: string | null) {
    const where: any = {
      status: { not: 'done' },
      dueDate: { lt: new Date() },
    };

    if (departmentId) {
      where.departmentId = departmentId;
    }

    const tasks = await this.prisma.task.findMany({
      where,
      take: 10,
      include: {
        assignee: { select: { firstName: true, lastName: true } },
      },
      orderBy: { dueDate: 'asc' },
    });

    return tasks.map(t => ({
      id: t.id,
      title: t.title,
      dueDate: t.dueDate,
      assignee: t.assignee ? `${t.assignee.firstName} ${t.assignee.lastName}` : null,
    }));
  }

  async getRecentReports(departmentId: string | null) {
    const where: any = {};

    if (departmentId) {
      where.departmentId = departmentId;
    }

    const reports = await this.prisma.report.findMany({
      where,
      take: 5,
      include: {
        author: { select: { firstName: true, lastName: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return reports.map(r => ({
      id: r.id,
      type: r.reportType,
      title: r.title,
      status: r.status,
      author: `${r.author.firstName} ${r.author.lastName}`,
      createdAt: r.createdAt,
    }));
  }

  async getDepartmentPerformance(departmentId: string, dateFrom: Date, dateTo: Date) {
    const reports = await this.prisma.report.findMany({
      where: {
        departmentId,
        createdAt: { gte: dateFrom, lte: dateTo },
      },
      include: {
        author: { select: { firstName: true, lastName: true } },
      },
    });

    const byAuthor = reports.reduce((acc, r) => {
      const key = `${r.author.firstName} ${r.author.lastName}`;
      if (!acc[key]) {
        acc[key] = { total: 0, approved: 0, rejected: 0, pending: 0 };
      }
      acc[key].total++;
      if (r.status === 'approved') acc[key].approved++;
      else if (r.status === 'rejected') acc[key].rejected++;
      else acc[key].pending++;
      return acc;
    }, {});

    return byAuthor;
  }

  async getWorkload(user: any, departmentId?: string) {
    const deptId = departmentId || user.departmentId || null;
    const whereUser: any = { isActive: true };
    if (user.role === 'manager' || user.role === 'director') {
      whereUser.departmentId = deptId;
    }
    if (user.role === 'specialist') {
      whereUser.id = user.id;
    }

    const users = await this.prisma.user.findMany({
      where: whereUser,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        role: true,
        tasks: {
          where: { status: { not: 'done' } },
          select: { id: true, status: true, dueDate: true, priority: true },
        },
      },
      take: 200,
    });

    const now = new Date();
    const dueSoon = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);

    return users.map((employee) => {
      const open = employee.tasks.length;
      const overdue = employee.tasks.filter((task) => task.dueDate && task.dueDate < now).length;
      const soon = employee.tasks.filter((task) => task.dueDate && task.dueDate >= now && task.dueDate <= dueSoon).length;
      const inProgress = employee.tasks.filter((task) => task.status === 'in_progress').length;
      const critical = employee.tasks.filter((task) => task.priority === 'critical').length;
      const capacityScore = Math.max(0, 100 - open * 4 - overdue * 6 - critical * 7);

      return {
        userId: employee.id,
        fullName: `${employee.firstName} ${employee.lastName}`.trim(),
        role: employee.role,
        openTasks: open,
        inProgressTasks: inProgress,
        overdueTasks: overdue,
        dueSoonTasks: soon,
        criticalTasks: critical,
        capacityScore,
      };
    });
  }

  async getMyDigestSettings(userId: string) {
    const items = await this.prisma.digestSubscription.findMany({
      where: { userId },
      orderBy: [{ frequency: 'asc' }],
    });
    return items;
  }

  async upsertDigestSetting(
    userId: string,
    dto: { frequency: 'daily' | 'weekly'; hour: number; minute: number; weekdays: string; isActive: boolean },
  ) {
    return this.prisma.digestSubscription.upsert({
      where: {
        userId_frequency: {
          userId,
          frequency: dto.frequency,
        },
      },
      create: {
        userId,
        frequency: dto.frequency,
        hour: dto.hour,
        minute: dto.minute,
        weekdays: dto.weekdays,
        isActive: dto.isActive,
      },
      update: {
        hour: dto.hour,
        minute: dto.minute,
        weekdays: dto.weekdays,
        isActive: dto.isActive,
      },
    });
  }

  private async runDigestScheduler() {
    if (this.digestRunning) return;
    this.digestRunning = true;
    try {
      const now = new Date();
      const weekday = now.getDay();
      const hour = now.getHours();
      const minute = now.getMinutes();
      const subs = await this.prisma.digestSubscription.findMany({
        where: {
          isActive: true,
          hour,
          minute: { lte: minute },
          user: { isActive: true },
        },
        include: {
          user: { select: { id: true, departmentId: true } },
        },
        take: 200,
      });

      for (const sub of subs) {
        if (sub.frequency === 'weekly') {
          const allowed = new Set(
            String(sub.weekdays || '')
              .split(',')
              .map((item) => Number(item.trim()))
              .filter((num) => Number.isFinite(num)),
          );
          if (allowed.size && !allowed.has(weekday)) continue;
        }
        if (sub.lastSentAt && this.isSameDay(sub.lastSentAt, now)) continue;

        const summary = await this.buildDigestSummary(sub.user.id, sub.user.departmentId || undefined);
        await this.notifications.create({
          userId: sub.user.id,
          type: 'system',
          title: sub.frequency === 'daily' ? 'Щоденний дайджест' : 'Щотижневий дайджест',
          message: summary,
          referenceType: 'digest',
          referenceId: sub.id,
        });

        await this.prisma.digestSubscription.update({
          where: { id: sub.id },
          data: { lastSentAt: now },
        });
      }
    } finally {
      this.digestRunning = false;
    }
  }

  private async buildDigestSummary(userId: string, departmentId?: string) {
    const [pendingReports, overdueTasks, doneTasks] = await Promise.all([
      this.prisma.report.count({
        where: {
          ...(departmentId ? { departmentId } : {}),
          status: { in: ['pending_manager', 'pending_clerk', 'pending_director'] },
        },
      }),
      this.prisma.task.count({
        where: {
          ...(departmentId ? { departmentId } : {}),
          status: { not: 'done' },
          dueDate: { lt: new Date() },
        },
      }),
      this.prisma.task.count({
        where: {
          ...(departmentId ? { departmentId } : {}),
          reporterId: userId,
          status: 'done',
          updatedAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
        },
      }),
    ]);

    return `Очікують погодження: ${pendingReports}. Прострочені задачі: ${overdueTasks}. Виконано задач за добу: ${doneTasks}.`;
  }

  private isSameDay(a: Date, b: Date) {
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  }
}
