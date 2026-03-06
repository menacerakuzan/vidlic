import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../shared/prisma.service';
import { UiPresetsService } from '../ui-presets/ui-presets.service';
import { AiProviderService } from './ai.provider';
import { RedisService } from '../../shared/redis.service';
import { UiLayoutDto } from './dto/ui-config.dto';

@Injectable()
export class AiService {
  constructor(
    private prisma: PrismaService,
    private uiPresets: UiPresetsService,
    private aiProvider: AiProviderService,
    private redis: RedisService,
  ) {}

  async summarizeReport(reportId: string) {
    const report = await this.prisma.report.findUnique({
      where: { id: reportId },
      include: {
        author: { select: { firstName: true, lastName: true } },
        department: { select: { nameUk: true } },
      },
    });

    if (!report) {
      throw new NotFoundException('Звіт не знайдено');
    }

    const content = (report.content || {}) as any;
    const providerSummary = await this.aiProvider.summarize({
      title: report.title || report.reportType,
      content,
      language: 'uk',
    });

    if (providerSummary) {
      return {
        reportId: report.id,
        author: `${report.author.firstName} ${report.author.lastName}`,
        department: report.department?.nameUk,
        period: {
          start: report.periodStart,
          end: report.periodEnd,
        },
        status: report.status,
        summary: providerSummary.summary,
        highlights: providerSummary.highlights,
        risks: providerSummary.risks,
        nextSteps: providerSummary.nextSteps,
      };
    }

    const summaryParts = [
      content.workDone && `Виконано: ${this.trimSentence(content.workDone)}`,
      content.achievements && `Досягнення: ${this.trimSentence(content.achievements)}`,
      content.problems && `Проблеми: ${this.trimSentence(content.problems)}`,
      content.nextWeekPlan && `План: ${this.trimSentence(content.nextWeekPlan)}`,
    ].filter(Boolean);

    const summary = summaryParts.join(' ');

    return {
      reportId: report.id,
      author: `${report.author.firstName} ${report.author.lastName}`,
      department: report.department?.nameUk,
      period: {
        start: report.periodStart,
        end: report.periodEnd,
      },
      status: report.status,
      summary: summary || 'Недостатньо даних для узагальнення',
      highlights: this.splitHighlights(content.achievements),
      risks: this.splitHighlights(content.problems),
      nextSteps: this.splitHighlights(content.nextWeekPlan),
    };
  }

  async getUiConfig(user: any, page: string, query?: string) {
    const baseQuery = query || this.queryForRole(user?.role);
    const config = this.uiPresets.getDesignSystem(baseQuery, user?.role || 'specialist', page);
    const override = await this.getOverride(user?.id, page);

    if (override) {
      config.layout = {
        ...config.layout,
        ...override,
      };
    }

    return {
      role: user?.role,
      page,
      ...config,
    };
  }

  async saveUiConfig(user: any, page: string, layout: UiLayoutDto) {
    const key = this.overrideKey(user?.id, page);
    await this.redis.set(key, JSON.stringify(layout));
    return { success: true };
  }

  async detectKpiAnomalies(user: any) {
    const departmentId = user?.departmentId || null;
    const since = new Date();
    since.setDate(since.getDate() - 30);

    const reports = await this.prisma.report.findMany({
      where: departmentId ? { departmentId, createdAt: { gte: since } } : { createdAt: { gte: since } },
    });

    const tasks = await this.prisma.task.findMany({
      where: departmentId ? { departmentId } : {},
    });

    const rejected = reports.filter(r => r.status === 'rejected').length;
    const approved = reports.filter(r => r.status === 'approved').length;
    const rejectionRate = reports.length ? rejected / reports.length : 0;
    const overdueTasks = tasks.filter(t => t.dueDate && t.status !== 'done' && t.dueDate < new Date()).length;

    const anomalies: { type: string; message: string; severity: 'low' | 'medium' | 'high' }[] = [];

    if (rejectionRate > 0.2) {
      anomalies.push({
        type: 'reports.rejection_rate',
        message: `Високий рівень відхилення звітів (${Math.round(rejectionRate * 100)}%).`,
        severity: rejectionRate > 0.35 ? 'high' : 'medium',
      });
    }

    if (overdueTasks > 5) {
      anomalies.push({
        type: 'tasks.overdue',
        message: `Значна кількість прострочених задач (${overdueTasks}).`,
        severity: overdueTasks > 10 ? 'high' : 'medium',
      });
    }

    if (approved === 0 && reports.length > 3) {
      anomalies.push({
        type: 'reports.approvals',
        message: 'Немає затверджених звітів за останні 30 днів.',
        severity: 'medium',
      });
    }

    return {
      since,
      totalReports: reports.length,
      totalTasks: tasks.length,
      anomalies,
    };
  }

  private trimSentence(value: string) {
    const clean = value.replace(/\s+/g, ' ').trim();
    if (clean.length <= 160) return clean;
    return `${clean.slice(0, 157)}...`;
  }

  private splitHighlights(value?: string) {
    if (!value) return [];
    return value
      .split(/\n|\u2022|\u2023|\-\s/)
      .map(item => item.trim())
      .filter(Boolean)
      .slice(0, 5);
  }

  private queryForRole(role?: string) {
    switch (role) {
      case 'director':
        return 'executive analytics dashboard bento glassmorphism premium';
      case 'manager':
        return 'management dashboard reports tasks bento glassmorphism';
      default:
        return 'enterprise productivity dashboard bento glassmorphism';
    }
  }

  private overrideKey(userId: string, page: string) {
    return `ui:config:${userId}:${page}`;
  }

  private async getOverride(userId: string, page: string) {
    if (!userId) return null;
    const raw = await this.redis.get(this.overrideKey(userId, page));
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }
}
