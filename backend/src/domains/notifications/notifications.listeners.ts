import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../../shared/prisma.service';
import { NotificationsService } from './notifications.service';
import { ReportApprovedEvent, ReportCreatedEvent, ReportRejectedEvent, ReportSubmittedEvent } from '../../events/report.events';
import { TaskCompletedEvent, TaskCreatedEvent, TaskUpdatedEvent, TaskStatusChangedEvent, TaskCommentEvent } from '../../events/task.events';

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
    const task = await this.prisma.task.findUnique({ where: { id: event.taskId } });
    if (!task) return;

    const notifyIds = new Set<string>();
    if (event.assigneeId && event.assigneeId !== event.reporterId) {
      notifyIds.add(event.assigneeId);
    }
    const coIds = Array.isArray(task.coAssigneeIds) ? task.coAssigneeIds as string[] : [];
    for (const coId of coIds) {
      if (coId && coId !== event.reporterId) notifyIds.add(coId);
    }

    for (const userId of notifyIds) {
      await this.notifications.create({
        userId,
        type: 'task_assigned',
        title: 'Нова задача',
        message: `Вам призначено задачу: ${task.title}`,
        referenceType: 'task',
        referenceId: task.id,
      });
    }
  }

  @OnEvent('task.updated')
  async handleTaskUpdated(event: TaskUpdatedEvent) {
    const task = await this.prisma.task.findUnique({ where: { id: event.taskId } });
    if (!task) return;

    if (event.newAssigneeId && event.newAssigneeId !== event.actorId) {
      await this.notifications.create({
        userId: event.newAssigneeId,
        type: 'task_assigned',
        title: 'Змінено виконавця задачі',
        message: `Ви призначені виконавцем: ${task.title}`,
        referenceType: 'task',
        referenceId: task.id,
      });
    }

    const coIds = Array.isArray(task.coAssigneeIds) ? task.coAssigneeIds as string[] : [];
    for (const coId of coIds) {
      if (coId && coId !== event.actorId && coId !== event.newAssigneeId) {
        await this.notifications.create({
          userId: coId,
          type: 'task_assigned',
          title: 'Вас додано як співвиконавця',
          message: `Вас додано як співвиконавця до задачі: ${task.title}`,
          referenceType: 'task',
          referenceId: task.id,
        });
      }
    }
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

  @OnEvent('task.status_changed')
  async handleTaskStatusChanged(event: TaskStatusChangedEvent) {
    const task = await this.prisma.task.findUnique({ where: { id: event.taskId } });
    if (!task) return;

    const statusLabel: Record<string, string> = {
      todo: 'Нове',
      in_progress: 'В роботі',
      done: 'Виконано',
    };
    const label = statusLabel[event.newStatus] ?? event.newStatus;

    const recipients = new Set<string>();
    if (task.assigneeId && task.assigneeId !== event.actorId) recipients.add(task.assigneeId);
    if (task.reporterId && task.reporterId !== event.actorId) recipients.add(task.reporterId);
    const coIds = Array.isArray(task.coAssigneeIds) ? task.coAssigneeIds as string[] : [];
    for (const coId of coIds) {
      if (coId && coId !== event.actorId) recipients.add(coId);
    }

    for (const userId of recipients) {
      await this.notifications.create({
        userId,
        type: 'task_updated',
        title: 'Статус задачі змінено',
        message: `Задача "${task.title}": статус змінено на "${label}"`,
        referenceType: 'task',
        referenceId: task.id,
      });
    }
  }

  @OnEvent('task.comment_added')
  async handleTaskCommentAdded(event: TaskCommentEvent) {
    const task = await this.prisma.task.findUnique({ where: { id: event.taskId } });
    if (!task) return;

    const recipients = new Set<string>();
    if (task.assigneeId && task.assigneeId !== event.actorId) recipients.add(task.assigneeId);
    if (task.reporterId && task.reporterId !== event.actorId) recipients.add(task.reporterId);
    const coIds = Array.isArray(task.coAssigneeIds) ? task.coAssigneeIds as string[] : [];
    for (const coId of coIds) {
      if (coId && coId !== event.actorId) recipients.add(coId);
    }

    const preview = event.commentContent.length > 60
      ? event.commentContent.slice(0, 60) + '...'
      : event.commentContent;

    for (const userId of recipients) {
      await this.notifications.create({
        userId,
        type: 'task_updated',
        title: 'Новий коментар до задачі',
        message: `Задача "${task.title}": ${preview}`,
        referenceType: 'task',
        referenceId: task.id,
      });
    }
  }
}
