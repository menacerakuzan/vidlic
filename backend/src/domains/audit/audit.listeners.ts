import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { AuditService } from './audit.service';
import { AuditAction } from '@prisma/client';
import { ReportApprovedEvent, ReportCreatedEvent, ReportRejectedEvent, ReportSubmittedEvent } from '../../events/report.events';
import { TaskCompletedEvent, TaskCreatedEvent, TaskUpdatedEvent } from '../../events/task.events';

@Injectable()
export class AuditListener {
  constructor(private auditService: AuditService) {}

  @OnEvent('report.created')
  handleReportCreated(event: ReportCreatedEvent) {
    return this.auditService.log({
      userId: event.authorId,
      action: AuditAction.create,
      entityType: 'report',
      entityId: event.reportId,
    });
  }

  @OnEvent('report.submitted')
  handleReportSubmitted(event: ReportSubmittedEvent) {
    return this.auditService.log({
      userId: event.authorId,
      action: AuditAction.update,
      entityType: 'report',
      entityId: event.reportId,
      newValue: { status: 'pending_manager', approver: event.approverId },
    });
  }

  @OnEvent('report.approved')
  handleReportApproved(event: ReportApprovedEvent) {
    return this.auditService.log({
      userId: event.actorId,
      action: AuditAction.approve,
      entityType: 'report',
      entityId: event.reportId,
    });
  }

  @OnEvent('report.rejected')
  handleReportRejected(event: ReportRejectedEvent) {
    return this.auditService.log({
      userId: event.actorId,
      action: AuditAction.reject,
      entityType: 'report',
      entityId: event.reportId,
      newValue: { reason: event.comment },
    });
  }

  @OnEvent('task.created')
  handleTaskCreated(event: TaskCreatedEvent) {
    return this.auditService.log({
      userId: event.reporterId,
      action: AuditAction.create,
      entityType: 'task',
      entityId: event.taskId,
    });
  }

  @OnEvent('task.updated')
  handleTaskUpdated(event: TaskUpdatedEvent) {
    return this.auditService.log({
      userId: event.actorId,
      action: AuditAction.update,
      entityType: 'task',
      entityId: event.taskId,
    });
  }

  @OnEvent('task.completed')
  handleTaskCompleted(event: TaskCompletedEvent) {
    return this.auditService.log({
      userId: event.actorId,
      action: AuditAction.update,
      entityType: 'task',
      entityId: event.taskId,
      newValue: { status: 'done' },
    });
  }
}
