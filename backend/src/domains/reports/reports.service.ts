import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../shared/prisma.service';
import { CreateReportDto, UpdateReportDto, ReportQueryDto, SubmitReportDto, ApproveReportDto, RejectReportDto } from './dto/reports.dto';
import { ReportStatus, ApprovalEntityType } from '@prisma/client';
import { ApprovalsService } from '../approvals/approvals.service';
import { ReportApprovedEvent, ReportCreatedEvent, ReportRejectedEvent, ReportSubmittedEvent } from '../../events/report.events';
import { AiProviderService } from '../ai/ai.provider';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class ReportsService {
  constructor(
    private prisma: PrismaService,
    private approvalsService: ApprovalsService,
    private eventEmitter: EventEmitter2,
    private aiProvider: AiProviderService,
  ) {}

  async findAll(query: ReportQueryDto, user: any) {
    const { page = 1, limit = 20, status, type, departmentId, authorId, periodStart, periodEnd, search } = query;
    const skip = (page - 1) * limit;

    const where: any = {};

    if (user.role === 'specialist') {
      where.authorId = user.id;
    } else if (user.role === 'manager') {
      where.OR = [
        { authorId: user.id },
        { departmentId: user.departmentId },
      ];
    }

    if (status) where.status = status;
    if (type) where.reportType = type;
    if (departmentId && user.role !== 'specialist') where.departmentId = departmentId;
    if (authorId) where.authorId = authorId;
    if (periodStart && periodEnd) {
      where.periodStart = { gte: new Date(periodStart) };
      where.periodEnd = { lte: new Date(periodEnd) };
    }

    if (search) {
      where.AND = [
        {
          OR: [
            { title: { contains: search, mode: 'insensitive' } },
            { author: { firstName: { contains: search, mode: 'insensitive' } } },
            { author: { lastName: { contains: search, mode: 'insensitive' } } },
          ],
        },
      ];
    }

    const [reports, total] = await Promise.all([
      this.prisma.report.findMany({
        where,
        skip,
        take: limit,
        include: {
          author: { select: { id: true, firstName: true, lastName: true, email: true } },
          department: { select: { id: true, name: true, nameUk: true } },
          currentApprover: { select: { id: true, firstName: true, lastName: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.report.count({ where }),
    ]);

    return {
      data: reports.map(r => this.mapReport(r)),
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async findById(id: string, user: any) {
    const report = await this.prisma.report.findUnique({
      where: { id },
      include: {
        author: { include: { department: true, position: true } },
        department: true,
        currentApprover: true,
        versions: { orderBy: { version: 'desc' }, take: 5 },
        statusHistory: { 
          include: { changedBy: { select: { firstName: true, lastName: true } } },
          orderBy: { createdAt: 'desc' }
        },
      },
    });

    if (!report) {
      throw new NotFoundException('Звіт не знайдено');
    }

    if (!this.canViewReport(report, user)) {
      throw new ForbiddenException('Немає доступу до цього звіту');
    }

    return this.mapReportFull(report);
  }

  async create(dto: CreateReportDto, userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    
    const departmentId = dto.departmentId || user?.departmentId;
    
    if (!departmentId) {
      throw new BadRequestException('Департамент не визначено. Зверніться до адміністратора.');
    }
    
    const report = await this.prisma.report.create({
      data: {
        reportType: dto.reportType,
        periodStart: new Date(dto.periodStart),
        periodEnd: new Date(dto.periodEnd),
        title: dto.title,
        content: dto.content || {},
        authorId: userId,
        departmentId,
        status: 'draft',
      },
      include: {
        author: true,
        department: true,
      },
    });

    this.eventEmitter.emit('report.created', new ReportCreatedEvent(report.id, userId));

    return this.mapReport(report);
  }

  async update(id: string, dto: UpdateReportDto, userId: string) {
    const report = await this.prisma.report.findUnique({ where: { id } });

    if (!report) {
      throw new NotFoundException('Звіт не знайдено');
    }

    if (report.status !== 'draft') {
      throw new BadRequestException('Можна редагувати тільки чернетки');
    }

    if (report.authorId !== userId) {
      throw new ForbiddenException('Можна редагувати тільки свої звіти');
    }

    const oldVersion = await this.prisma.reportVersion.create({
      data: {
        reportId: id,
        version: report.version,
        content: report.content,
        changedById: userId,
        changeReason: 'Оновлення чернетки',
      },
    });

    const updated = await this.prisma.report.update({
      where: { id },
      data: {
        title: dto.title ?? report.title,
        content: dto.content ?? report.content,
        periodStart: dto.periodStart ? new Date(dto.periodStart) : report.periodStart,
        periodEnd: dto.periodEnd ? new Date(dto.periodEnd) : report.periodEnd,
        version: report.version + 1,
      },
      include: {
        author: true,
        department: true,
      },
    });

    this.eventEmitter.emit('report.updated', { reportId: id, userId, version: updated.version });

    return this.mapReport(updated);
  }

  async submit(id: string, dto: SubmitReportDto, userId: string) {
    const report = await this.prisma.report.findUnique({
      where: { id },
      include: {
        author: { select: { firstName: true, lastName: true } },
        department: { include: { manager: true } },
      },
    });

    if (!report) {
      throw new NotFoundException('Звіт не знайдено');
    }

    if (report.status !== 'draft') {
      throw new BadRequestException('Звіт вже відправлено на погодження');
    }

    if (report.authorId !== userId) {
      throw new ForbiddenException('Можна відправляти тільки свої звіти');
    }

    const managerId = report.department?.managerId;
    const directorId = report.department?.directorId;

    const content = this.ensureObject(report.content);
    const managerSubmission = this.ensureObject(content.managerSubmission);
    const hasSubmissionText = typeof managerSubmission.bodyText === 'string' && managerSubmission.bodyText.trim().length > 0;
    if (!hasSubmissionText) {
      throw new BadRequestException(
        'Перед відправкою сформуйте AI-чернетку для погодження та за потреби відредагуйте її.',
      );
    }
    const template = await this.prisma.departmentReportTemplate.findUnique({
      where: { departmentId: report.departmentId },
    });
    const requiredSections = Array.isArray(template?.sectionSchema)
      ? (template?.sectionSchema as any[]).filter((item) => item?.required && item?.key)
      : [];
    for (const section of requiredSections) {
      const value = (content as any)?.[section.key];
      if (typeof value !== 'string' || !value.trim()) {
        throw new BadRequestException(`Не заповнено обов'язковий розділ: ${section.title || section.key}`);
      }
    }

    const configuredFlow = await this.approvalsService.getActiveFlow(ApprovalEntityType.report);
    const flowSteps = configuredFlow?.steps?.length
      ? configuredFlow.steps
          .slice()
          .sort((a, b) => a.stepOrder - b.stepOrder)
          .map((step) => ({ order: step.stepOrder, role: step.role }))
      : [
          { order: 1, role: 'manager' as const },
          { order: 2, role: 'director' as const },
        ];

    const hasManagerStep = flowSteps.some((step) => step.role === 'manager');
    const hasDirectorStep = flowSteps.some((step) => step.role === 'director');
    if (hasManagerStep && !managerId) {
      throw new BadRequestException('У підрозділу не призначено керівника (manager). Неможливо відправити звіт.');
    }
    if (hasDirectorStep && !directorId) {
      throw new BadRequestException('У підрозділу не призначено директора. Неможливо завершити маршрут погодження.');
    }

    await this.approvalsService.submit({
      entityType: ApprovalEntityType.report,
      entityId: id,
      actorId: userId,
      steps: flowSteps.map((step) => ({
        order: step.order,
        role: step.role,
        approverId: this.resolveApproverByRole(step.role, managerId, directorId),
      })),
      comment: dto.comment,
      resolveApprover: (role) => {
        return this.resolveApproverByRole(role, managerId, directorId);
      },
    });

    const firstStep = flowSteps[0];
    const firstApproverId = firstStep ? this.resolveApproverByRole(firstStep.role, managerId, directorId) : null;

    const updated = await this.prisma.report.update({
      where: { id },
      data: {
        status: firstStep?.role === 'director' ? 'pending_director' : 'pending_manager',
        currentApproverId: firstApproverId,
        submittedAt: new Date(),
      },
      include: {
        author: true,
        department: true,
      },
    });

    await this.createStatusHistory(
      id,
      report.status,
      firstStep?.role === 'director' ? 'pending_director' : 'pending_manager',
      userId,
      dto.comment,
    );

    this.eventEmitter.emit('report.submitted', new ReportSubmittedEvent(id, userId, firstApproverId));

    return this.mapReport(updated);
  }

  async generateManagerSubmissionDraft(id: string, userId: string) {
    const report = await this.prisma.report.findUnique({
      where: { id },
      include: {
        author: { select: { firstName: true, lastName: true } },
        department: true,
      },
    });

    if (!report) {
      throw new NotFoundException('Звіт не знайдено');
    }

    if (report.status !== 'draft') {
      throw new BadRequestException('AI-чернетку можна формувати лише для чернетки звіту');
    }

    if (report.authorId !== userId) {
      throw new ForbiddenException('Можна формувати AI-чернетку лише для свого звіту');
    }

    const aiSubmission = await this.aiProvider.buildManagerSubmission({
      title: report.title || (report.reportType === 'weekly' ? 'Тижневий звіт' : 'Місячний звіт'),
      periodLabel: this.buildPeriodLabel(report.periodStart, report.periodEnd),
      departmentFullName: report.department?.nameUk || report.department?.name || 'підрозділу',
      reportContent: this.ensureObject(report.content),
      authorName: `${report.author?.firstName || ''} ${report.author?.lastName || ''}`.trim(),
      customPrompt: (
        await this.prisma.departmentReportTemplate.findUnique({
          where: { departmentId: report.departmentId },
          select: { aiPrompt: true },
        })
      )?.aiPrompt || undefined,
      sectionSchema: (
        await this.prisma.departmentReportTemplate.findUnique({
          where: { departmentId: report.departmentId },
          select: { sectionSchema: true },
        })
      )?.sectionSchema as any[] | undefined,
    });

    const managerSubmission = this.applyDepartmentTemplate(
      aiSubmission || this.buildFallbackManagerSubmission(report),
      await this.prisma.departmentReportTemplate.findUnique({
        where: { departmentId: report.departmentId },
      }),
      report,
    );

    const updated = await this.prisma.report.update({
      where: { id },
      data: {
        content: {
          ...this.ensureObject(report.content),
          managerSubmission: {
            documentTitle: managerSubmission.documentTitle,
            headerLines: managerSubmission.headerLines,
            bodyText: managerSubmission.bodyText,
            style: managerSubmission.style,
            generatedAt: new Date().toISOString(),
            promptProfile: 'official_ua_manager_submission_v1',
            generatedBy: aiSubmission ? 'ai' : 'fallback',
          },
        },
        version: report.version + 1,
      },
      include: {
        author: true,
        department: true,
      },
    });

    return this.mapReportFull(updated);
  }

  async approve(id: string, dto: ApproveReportDto, user: any) {
    const report = await this.prisma.report.findUnique({
      where: { id },
      include: { department: { include: { director: true } }, author: true },
    });

    if (!report) {
      throw new NotFoundException('Звіт не знайдено');
    }

    if (user.role === 'manager' && report.status !== 'pending_manager') {
      throw new BadRequestException('Звіт не очікує погодження керівника');
    }

    if (user.role === 'director' && report.status !== 'pending_director') {
      throw new BadRequestException('Звіт не очікує фінального погодження');
    }

    if (user.role === 'manager' && report.currentApproverId !== user.id) {
      throw new ForbiddenException('Ви не є погоджувачем цього звіту');
    }

    const approvalResult = await this.approvalsService.approve({
      entityType: ApprovalEntityType.report,
      entityId: id,
      actorId: user.id,
      comment: dto.comment,
      resolveApprover: (role) => {
        if (role === 'director') return report.department?.directorId ?? null;
        return null;
      },
    });

    const newStatus: ReportStatus = approvalResult.nextStep ? 'pending_director' : 'approved';
    const nextApproverId = approvalResult.nextStep ? report.department?.directorId ?? null : null;

    const updated = await this.prisma.report.update({
      where: { id },
      data: {
        status: newStatus,
        currentApproverId: nextApproverId,
        approvedAt: newStatus === 'approved' ? new Date() : null,
      },
      include: {
        author: true,
        department: true,
        currentApprover: true,
      },
    });

    await this.createStatusHistory(id, report.status, newStatus, user.id, dto.comment);

    this.eventEmitter.emit('report.approved', new ReportApprovedEvent(id, user.id, report.authorId, nextApproverId));

    return this.mapReport(updated);
  }

  async reject(id: string, dto: RejectReportDto, user: any) {
    const report = await this.prisma.report.findUnique({ where: { id } });

    if (!report) {
      throw new NotFoundException('Звіт не знайдено');
    }

    if (!['pending_manager', 'pending_director'].includes(report.status)) {
      throw new BadRequestException('Звіт не очікує погодження');
    }

    if (!dto.comment) {
      throw new BadRequestException('При відхиленні обов\'язковий коментар');
    }

    await this.approvalsService.reject({
      entityType: ApprovalEntityType.report,
      entityId: id,
      actorId: user.id,
      comment: dto.comment,
    });

    const updated = await this.prisma.report.update({
      where: { id },
      data: {
        status: 'rejected',
        currentApproverId: null,
      },
      include: {
        author: true,
        department: true,
      },
    });

    await this.createStatusHistory(id, report.status, 'rejected', user.id, dto.comment);

    this.eventEmitter.emit('report.rejected', new ReportRejectedEvent(id, user.id, report.authorId, dto.comment));

    return this.mapReport(updated);
  }

  async getHistory(id: string, user: any) {
    const report = await this.prisma.report.findUnique({ where: { id } });

    if (!report) {
      throw new NotFoundException('Звіт не знайдено');
    }

    const history = await this.prisma.reportStatusHistory.findMany({
      where: { reportId: id },
      include: {
        changedBy: { select: { firstName: true, lastName: true, role: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return history.map(h => ({
      id: h.id,
      fromStatus: h.fromStatus,
      toStatus: h.toStatus,
      comment: h.comment,
      changedBy: h.changedBy ? {
        firstName: h.changedBy.firstName,
        lastName: h.changedBy.lastName,
        role: h.changedBy.role,
      } : null,
      createdAt: h.createdAt,
    }));
  }

  async getComments(id: string, user: any) {
    const report = await this.prisma.report.findUnique({ where: { id } });
    if (!report) throw new NotFoundException('Звіт не знайдено');
    if (!this.canViewReport(report, user)) throw new ForbiddenException('Немає доступу до цього звіту');

    const content = this.ensureObject(report.content);
    const comments = Array.isArray(content.reviewComments) ? content.reviewComments : [];
    return comments.sort((a: any, b: any) => {
      const aTime = new Date(a.createdAt || 0).getTime();
      const bTime = new Date(b.createdAt || 0).getTime();
      return bTime - aTime;
    });
  }

  async addComment(
    id: string,
    dto: { sectionKey: string; sectionLabel?: string; text: string },
    user: any,
  ) {
    const report = await this.prisma.report.findUnique({
      where: { id },
      include: {
        author: { select: { id: true, firstName: true, lastName: true } },
      },
    });
    if (!report) throw new NotFoundException('Звіт не знайдено');
    if (!this.canViewReport(report, user)) throw new ForbiddenException('Немає доступу до цього звіту');

    const content = this.ensureObject(report.content);
    const reviewComments = Array.isArray(content.reviewComments) ? content.reviewComments : [];
    const newComment = {
      id: uuidv4(),
      sectionKey: dto.sectionKey,
      sectionLabel: dto.sectionLabel || dto.sectionKey,
      text: dto.text.trim(),
      createdAt: new Date().toISOString(),
      createdById: user.id,
      createdByName: `${user.firstName || ''} ${user.lastName || ''}`.trim(),
      status: 'open',
      note: null,
      resolvedAt: null,
      resolvedById: null,
      resolvedByName: null,
    };

    if (!newComment.text) {
      throw new BadRequestException('Текст коментаря не може бути порожнім');
    }

    await this.prisma.report.update({
      where: { id },
      data: {
        content: {
          ...content,
          reviewComments: [newComment, ...reviewComments],
        },
        version: report.version + 1,
      },
    });

    if (report.authorId && report.authorId !== user.id) {
      this.eventEmitter.emit('report.comment_created', {
        reportId: id,
        authorId: report.authorId,
        actorName: newComment.createdByName || 'Користувач',
      });
    }

    return newComment;
  }

  async resolveComment(
    id: string,
    commentId: string,
    dto: { note?: string },
    user: any,
  ) {
    const report = await this.prisma.report.findUnique({ where: { id } });
    if (!report) throw new NotFoundException('Звіт не знайдено');
    if (!this.canViewReport(report, user)) throw new ForbiddenException('Немає доступу до цього звіту');

    const content = this.ensureObject(report.content);
    const reviewComments = Array.isArray(content.reviewComments) ? content.reviewComments : [];
    const next = reviewComments.map((comment: any) => {
      if (comment.id !== commentId) return comment;
      return {
        ...comment,
        status: 'resolved',
        note: dto.note || null,
        resolvedAt: new Date().toISOString(),
        resolvedById: user.id,
        resolvedByName: `${user.firstName || ''} ${user.lastName || ''}`.trim(),
      };
    });

    await this.prisma.report.update({
      where: { id },
      data: {
        content: {
          ...content,
          reviewComments: next,
        },
        version: report.version + 1,
      },
    });

    return { success: true };
  }

  async getVersionDiff(id: string, user: any, fromVersion?: number, toVersion?: number) {
    const report = await this.prisma.report.findUnique({
      where: { id },
    });
    if (!report) throw new NotFoundException('Звіт не знайдено');
    if (!this.canViewReport(report, user)) throw new ForbiddenException('Немає доступу до цього звіту');

    const targetToVersion = toVersion || report.version;
    const targetFromVersion = fromVersion || Math.max(1, targetToVersion - 1);

    const [fromContent, toContent] = await Promise.all([
      this.loadReportVersionContent(report.id, targetFromVersion, report.version, report.content),
      this.loadReportVersionContent(report.id, targetToVersion, report.version, report.content),
    ]);

    const changes = this.computeSimpleDiff(this.ensureObject(fromContent), this.ensureObject(toContent));
    return {
      fromVersion: targetFromVersion,
      toVersion: targetToVersion,
      changedFields: changes,
      totalChanged: changes.length,
    };
  }

  async delete(id: string, user: any) {
    const report = await this.prisma.report.findUnique({ where: { id } });

    if (!report) {
      throw new NotFoundException('Звіт не знайдено');
    }

    const isAdmin = user?.role === 'admin';
    const isAuthor = report.authorId === user?.id;

    if (!isAdmin && !isAuthor) {
      throw new ForbiddenException('Немає доступу до видалення цього звіту');
    }

    if (!isAdmin && report.status !== 'draft') {
      throw new BadRequestException('Можна видаляти лише звіти у статусі чернетки');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.task.updateMany({
        where: { reportId: id },
        data: { reportId: null },
      });

      await tx.exportJob.deleteMany({
        where: { entityType: 'report', entityId: id },
      });

      await tx.approvalAction.deleteMany({
        where: {
          instance: {
            entityType: ApprovalEntityType.report,
            entityId: id,
          },
        },
      });

      await tx.approvalInstance.deleteMany({
        where: {
          entityType: ApprovalEntityType.report,
          entityId: id,
        },
      });

      await tx.reportStatusHistory.deleteMany({ where: { reportId: id } });
      await tx.reportVersion.deleteMany({ where: { reportId: id } });
      await tx.report.delete({ where: { id } });
    });

    return { success: true };
  }

  private async createStatusHistory(reportId: string, fromStatus: ReportStatus | null, toStatus: ReportStatus, userId: string, comment?: string) {
    await this.prisma.reportStatusHistory.create({
      data: {
        reportId,
        fromStatus,
        toStatus,
        changedById: userId,
        comment,
      },
    });
  }

  private canViewReport(report: any, user: any): boolean {
    if (user.role === 'admin' || user.role === 'director') return true;
    if (user.role === 'manager' && report.departmentId === user.departmentId) return true;
    if (report.authorId === user.id) return true;
    return false;
  }

  private mapReport(report: any) {
    return {
      id: report.id,
      reportType: report.reportType,
      periodStart: report.periodStart,
      periodEnd: report.periodEnd,
      title: report.title,
      status: report.status,
      version: report.version,
      author: report.author ? {
        id: report.author.id,
        firstName: report.author.firstName,
        lastName: report.author.lastName,
        email: report.author.email,
      } : null,
      department: report.department ? {
        id: report.department.id,
        name: report.department.name,
        nameUk: report.department.nameUk,
      } : null,
      currentApprover: report.currentApprover ? {
        id: report.currentApprover.id,
        firstName: report.currentApprover.firstName,
        lastName: report.currentApprover.lastName,
      } : null,
      createdAt: report.createdAt,
      updatedAt: report.updatedAt,
      submittedAt: report.submittedAt,
      approvedAt: report.approvedAt,
    };
  }

  private mapReportFull(report: any) {
    return {
      ...this.mapReport(report),
      content: report.content,
      versions: report.versions?.map(v => ({
        id: v.id,
        version: v.version,
        changedBy: v.changedById,
        changeReason: v.changeReason,
        createdAt: v.createdAt,
      })),
      statusHistory: report.statusHistory,
    };
  }

  private ensureObject(value: any): Record<string, any> {
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  }

  private async loadReportVersionContent(
    reportId: string,
    version: number,
    currentVersion: number,
    currentContent: any,
  ) {
    if (version === currentVersion) {
      return currentContent;
    }
    const snapshot = await this.prisma.reportVersion.findUnique({
      where: {
        reportId_version: {
          reportId,
          version,
        },
      },
    });
    return snapshot?.content || {};
  }

  private computeSimpleDiff(fromContent: Record<string, any>, toContent: Record<string, any>) {
    const keys = new Set([...Object.keys(fromContent), ...Object.keys(toContent)]);
    const changes: Array<{ key: string; from: string; to: string }> = [];

    for (const key of keys) {
      const a = this.stringifyDiffValue(fromContent[key]);
      const b = this.stringifyDiffValue(toContent[key]);
      if (a === b) continue;
      changes.push({
        key,
        from: a.slice(0, 300),
        to: b.slice(0, 300),
      });
    }
    return changes.slice(0, 30);
  }

  private stringifyDiffValue(value: any): string {
    if (typeof value === 'string') return value;
    if (value === null || value === undefined) return '';
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }

  private buildPeriodLabel(periodStart: Date, periodEnd: Date): string {
    return `${periodEnd.getFullYear()} (станом на ${this.formatDate(periodEnd)})`;
  }

  private formatDate(date: Date): string {
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}.${month}.${year}`;
  }

  private resolveApproverByRole(role: string, managerId?: string | null, directorId?: string | null) {
    if (role === 'manager') return managerId ?? null;
    if (role === 'director') return directorId ?? null;
    return null;
  }

  private buildFallbackManagerSubmission(report: any) {
    const content = this.ensureObject(report.content);
    const lines: string[] = [];

    const sectionOne = this.extractSectionPoints(content, [
      'workDone',
      'achievements',
      'problems',
      'nextWeekPlan',
      'summary',
    ]);

    lines.push('1. Сектор цифрових трансформацій та інформатизації');
    if (sectionOne.length === 0) {
      lines.push('1. Проведено планові заходи за напрямом діяльності відповідно до затвердженого плану робіт.');
    } else {
      sectionOne.forEach((point, index) => {
        lines.push(`${index + 1}. ${point}`);
      });
    }

    lines.push('');
    lines.push('2. Відділ кібербезпеки та аналітики');
    lines.push('1. Опрацьовано поточні завдання за напрямом інформаційної безпеки та координації взаємодії з територіальними громадами.');

    return {
      documentTitle: 'ЗВІТ',
      headerLines: [
        `Про виконання роботи ${report.department?.nameUk || report.department?.name || 'підрозділу'}`,
        `${this.buildPeriodLabel(report.periodStart, report.periodEnd)}`,
      ],
      bodyText: lines.join('\n'),
      style: {
        fontFamily: 'Times New Roman',
        fontSize: 14,
      },
    };
  }

  private applyDepartmentTemplate(base: any, template: any, report: any) {
    if (!template) return base;
    const title = (template.titlePattern || base.documentTitle || 'ЗВІТ')
      .replace(/\{\{departmentName\}\}/g, report.department?.nameUk || report.department?.name || '')
      .replace(/\{\{period\}\}/g, this.buildPeriodLabel(report.periodStart, report.periodEnd))
      .replace(/\{\{title\}\}/g, report.title || '')
      .trim();

    const headerRaw = (template.headerPattern || '').replace(/\r/g, '');
    const headerLines = headerRaw
      .split('\n')
      .map((line: string) =>
        line
          .replace(/\{\{departmentName\}\}/g, report.department?.nameUk || report.department?.name || '')
          .replace(/\{\{period\}\}/g, this.buildPeriodLabel(report.periodStart, report.periodEnd))
          .replace(/\{\{title\}\}/g, report.title || '')
          .replace(/\{\{author\}\}/g, `${report.author?.firstName || ''} ${report.author?.lastName || ''}`.trim())
          .trim(),
      )
      .filter(Boolean);

    return {
      ...base,
      documentTitle: title || base.documentTitle,
      headerLines: headerLines.length ? headerLines : base.headerLines,
    };
  }

  private extractSectionPoints(content: Record<string, any>, keys: string[]): string[] {
    const values = keys
      .map((key) => content[key])
      .filter((value) => typeof value === 'string' && value.trim().length > 0)
      .map((value) => String(value).trim());

    return values
      .flatMap((value) => value.split(/\n+/))
      .map((line) => line.replace(/^\d+[\).\s-]*/, '').trim())
      .filter(Boolean)
      .slice(0, 14);
  }
}
