import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../../shared/prisma.service';
import { NotificationsService } from './notifications.service';
import { ReportApprovedEvent, ReportCreatedEvent, ReportRejectedEvent, ReportSubmittedEvent } from '../../events/report.events';
import { TaskCompletedEvent, TaskCreatedEvent, TaskUpdatedEvent } from '../../events/task.events';

@Injectable()
export class NotificationsListener {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
  ) {}

  @OnEvent('report.created')
  async handleReportCreated(event: ReportCreatedEvent) {
    const report = await this.prisma.report.findUnique({
      where: { id: event.reportId },
      include: { department: true },
    });

    if (!report) return;

    await this.notifications.create({
      userId: event.authorId,
      type: 'system',
      title: 'Чернетку створено',
      message: `Чернетка звіту успішно створена для періоду ${report.periodStart.toISOString().split('T')[0]}`,
      referenceType: 'report',
      referenceId: report.id,
    });
  }

  @OnEvent('report.submitted')
  async handleReportSubmitted(event: ReportSubmittedEvent) {
    if (!event.approverId) return;

    const report = await this.prisma.report.findUnique({
      where: { id: event.reportId },
      include: { author: true },
    });

    if (!report) return;

    await this.notifications.create({
      userId: event.approverId,
      type: 'report_submitted',
      title: 'Новий звіт на погодження',
      message: `Користувач ${report.author.firstName} ${report.author.lastName} відправив звіт на погодження`,
      referenceType: 'report',
      referenceId: report.id,
    });
  }

  @OnEvent('report.approved')
  async handleReportApproved(event: ReportApprovedEvent) {
    const report = await this.prisma.report.findUnique({
      where: { id: event.reportId },
    });

    if (!report) return;

    await this.notifications.create({
      userId: event.authorId,
      type: 'report_approved',
      title: 'Звіт погоджено',
      message: `Ваш звіт "${report.title || report.reportType}" погоджено`,
      referenceType: 'report',
      referenceId: report.id,
    });

    if (event.nextApproverId) {
      await this.notifications.create({
        userId: event.nextApproverId,
        type: 'report_submitted',
        title: 'Звіт на фінальне погодження',
        message: 'Звіт очікує фінального погодження',
        referenceType: 'report',
        referenceId: report.id,
      });
    }
  }

  @OnEvent('report.rejected')
  async handleReportRejected(event: ReportRejectedEvent) {
    const report = await this.prisma.report.findUnique({
      where: { id: event.reportId },
    });

    if (!report) return;

    await this.notifications.create({
      userId: event.authorId,
      type: 'report_rejected',
      title: 'Звіт відхилено',
      message: `Ваш звіт "${report.title || report.reportType}" відхилено. Причина: ${event.comment}`,
      referenceType: 'report',
      referenceId: report.id,
    });
  }

  @OnEvent('report.comment_created')
  async handleReportCommentCreated(event: { reportId: string; authorId: string; actorName: string }) {
    if (!event?.authorId) return;
    await this.notifications.create({
      userId: event.authorId,
      type: 'reminder',
      title: 'Нове зауваження до звіту',
      message: `${event.actorName} залишив(ла) коментар до вашого звіту`,
      referenceType: 'report',
      referenceId: event.reportId,
    });
  }

  @OnEvent('task.created')
  async handleTaskCreated(event: TaskCreatedEvent) {
    if (!event.assigneeId || event.assigneeId === event.reporterId) return;

    const task = await this.prisma.task.findUnique({
      where: { id: event.taskId },
    });

    if (!task) return;

    await this.notifications.create({
      userId: event.assigneeId,
      type: 'task_assigned',
      title: 'Нова задача',
      message: `Вам призначено задачу: ${task.title}`,
      referenceType: 'task',
      referenceId: task.id,
    });
  }

  @OnEvent('task.updated')
  async handleTaskUpdated(event: TaskUpdatedEvent) {
    if (!event.newAssigneeId) return;

    const task = await this.prisma.task.findUnique({
      where: { id: event.taskId },
    });

    if (!task) return;

    await this.notifications.create({
      userId: event.newAssigneeId,
      type: 'task_assigned',
      title: 'Змінено виконавця задачі',
      message: `Ви призначені виконавцем: ${task.title}`,
      referenceType: 'task',
      referenceId: task.id,
    });
  }

  @OnEvent('task.completed')
  async handleTaskCompleted(event: TaskCompletedEvent) {
    if (event.actorId === event.reporterId) return;

    const task = await this.prisma.task.findUnique({
      where: { id: event.taskId },
    });

    if (!task) return;

    await this.notifications.create({
      userId: event.reporterId,
      type: 'task_completed',
      title: 'Задачу виконано',
      message: `Задача "${task.title}" позначена як виконана`,
      referenceType: 'task',
      referenceId: task.id,
    });
  }
}
