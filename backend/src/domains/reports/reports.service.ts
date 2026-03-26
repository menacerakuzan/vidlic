import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../shared/prisma.service';
import { CreateReportDto, UpdateReportDto, ReportQueryDto, SubmitReportDto, ApproveReportDto, RejectReportDto, UpsertActivityRowDto } from './dto/reports.dto';
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
    } else if (user.role === 'manager' || user.role === 'clerk' || user.role === 'director') {
      const scopedDepartmentIds = await this.resolveDepartmentScopeIds(user.departmentId);
      where.OR = [
        { authorId: user.id },
        { departmentId: { in: scopedDepartmentIds.length ? scopedDepartmentIds : [user.departmentId].filter(Boolean) } },
        { currentApproverId: user.id },
      ];
    }

    if (status) where.status = status;
    if (type) where.reportType = type;
    if (departmentId && user.role !== 'specialist') {
      if (user.role === 'manager' || user.role === 'clerk' || user.role === 'director') {
        const scopedDepartmentIds = await this.resolveDepartmentScopeIds(user.departmentId);
        where.departmentId = scopedDepartmentIds.includes(departmentId)
          ? departmentId
          : '00000000-0000-0000-0000-000000000000';
      } else {
        where.departmentId = departmentId;
      }
    }
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

    if (!(await this.canViewReport(report, user))) {
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

    if (!['draft', 'rejected'].includes(report.status)) {
      throw new BadRequestException('Можна редагувати тільки чернетки або повернені звіти');
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
        status: report.status === 'rejected' ? 'draft' : report.status,
        currentApproverId: report.status === 'rejected' ? null : report.currentApproverId,
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
        department: { include: { parent: true } },
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

    const routing = await this.getApprovalRoutingContext(report.departmentId);
    const managerId = routing.managerId;
    const clerkId = routing.clerkId;
    const directorId = routing.directorId;

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
          { order: 2, role: 'clerk' as const },
          { order: 3, role: 'director' as const },
        ];

    const hasClerkStep = flowSteps.some((step) => step.role === 'clerk');
    const hasManagerStep = flowSteps.some((step) => step.role === 'manager');
    const hasDirectorStep = flowSteps.some((step) => step.role === 'director');
    if (hasManagerStep && !managerId) {
      throw new BadRequestException('У відділу не призначено керівника (manager). Неможливо відправити звіт.');
    }
    if (hasClerkStep && !clerkId) {
      throw new BadRequestException('У департаменту не призначено діловода (clerk). Неможливо відправити звіт.');
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
        approverId: this.resolveApproverByRole(step.role, managerId, clerkId, directorId),
      })),
      comment: dto.comment,
      resolveApprover: (role) => {
        return this.resolveApproverByRole(role, managerId, clerkId, directorId);
      },
    });

    const firstStep = flowSteps[0];
    const firstApproverId = firstStep ? this.resolveApproverByRole(firstStep.role, managerId, clerkId, directorId) : null;
    const firstStatus = this.statusByStepRole(firstStep?.role);
    if (firstStep && !firstApproverId) {
      throw new BadRequestException('Не вдалося визначити першого погоджувача для маршруту звіту.');
    }

    const updated = await this.prisma.report.update({
      where: { id },
      data: {
        status: firstStatus,
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
      firstStatus,
      userId,
      dto.comment,
    );

    this.eventEmitter.emit('report.submitted', new ReportSubmittedEvent(id, userId, firstApproverId));

    return this.mapReport(updated);
  }

  async generateManagerSubmissionDraft(id: string, userId: string, sourceReportIds?: string[]) {
    const report = await this.prisma.report.findUnique({
      where: { id },
      include: {
        author: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            role: true,
            position: { select: { titleUk: true, title: true } },
          },
        },
        department: { include: { parent: true, children: true } },
      },
    });

    if (!report) {
      throw new NotFoundException('Звіт не знайдено');
    }

    if (!['draft', 'rejected'].includes(report.status)) {
      throw new BadRequestException('AI-чернетку можна формувати лише для чернетки або поверненого звіту');
    }

    if (report.authorId !== userId) {
      throw new ForbiddenException('Можна формувати AI-чернетку лише для свого звіту');
    }

    const executorName = this.resolveAuthorName(report.author);
    const executorPosition = this.resolveAuthorPosition(report.author);

    const aggregation = await this.buildAggregationContextForDraft(report, sourceReportIds);
    const payloadContent = aggregation
      ? {
          aggregateMeta: aggregation.meta,
          sourceReports: aggregation.sources,
          sourceReportsOutline: this.buildSourceReportsOutline(aggregation.sources),
          currentReport: this.ensureObject(report.content),
        }
      : this.ensureObject(report.content);

    const aiSubmission = await this.aiProvider.buildManagerSubmission({
      title: report.title || (report.reportType === 'weekly' ? 'Тижневий звіт' : 'Місячний звіт'),
      periodLabel: this.buildPeriodLabel(report.periodStart, report.periodEnd),
      departmentFullName: report.department?.nameUk || report.department?.name || 'підрозділу',
      reportContent: payloadContent,
      authorName: executorName,
      authorPosition: executorPosition,
      authorRole: report.author?.role || undefined,
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

    if (!aiSubmission) {
      throw new BadRequestException(
        'AI-генерація чернетки тимчасово недоступна. Перевірте AI_PROVIDER/OPENAI_API_KEY/OPENAI_MODEL у змінних середовища та повторіть спробу.',
      );
    }

    const managerSubmission = this.applyDepartmentTemplate(
      aiSubmission,
      await this.prisma.departmentReportTemplate.findUnique({
        where: { departmentId: report.departmentId },
      }),
      report,
    );
    const normalizedHeaderLines = this.buildRoleAwareHeaderLines(report);

    const updated = await this.prisma.report.update({
      where: { id },
      data: {
        content: {
          ...this.ensureObject(report.content),
          managerSubmission: {
            documentTitle: managerSubmission.documentTitle,
            headerLines: normalizedHeaderLines,
            bodyText: managerSubmission.bodyText,
            style: managerSubmission.style,
          generatedAt: new Date().toISOString(),
          promptProfile: 'official_ua_manager_submission_v1',
          generatedBy: 'ai',
          aggregationLevel: aggregation?.meta?.level || 'specialist',
          sourceReportsCount: aggregation?.sources?.length || 0,
          sourceDepartmentsCount: aggregation?.meta?.sourceDepartmentsCount || 0,
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

  async getAggregationSourcesForDraft(id: string, userId: string) {
    const report = await this.prisma.report.findUnique({
      where: { id },
      include: {
        author: { select: { id: true, firstName: true, lastName: true, role: true } },
        department: { include: { parent: true, children: true } },
      },
    });

    if (!report) {
      throw new NotFoundException('Звіт не знайдено');
    }
    if (report.status !== 'draft') {
      throw new BadRequestException('Джерела доступні лише для чернетки звіту');
    }
    if (report.authorId !== userId) {
      throw new ForbiddenException('Можна працювати лише зі своїм звітом');
    }

    const aggregation = await this.buildAggregationContextForDraft(report);
    if (!aggregation) {
      return { meta: null, sources: [] };
    }

    return {
      meta: aggregation.meta,
      sources: aggregation.sources.map((source) => ({
        reportId: source.reportId,
        title: source.title,
        status: source.status,
        departmentId: source.departmentId,
        departmentName: source.departmentName,
        authorId: source.authorId,
        authorName: source.authorName,
        periodStart: source.periodStart,
        periodEnd: source.periodEnd,
      })),
    };
  }

  async approve(id: string, dto: ApproveReportDto, user: any) {
    const report = await this.prisma.report.findUnique({
      where: { id },
      include: { department: { include: { parent: true } }, author: true },
    });

    if (!report) {
      throw new NotFoundException('Звіт не знайдено');
    }

    if (user.role === 'manager' && report.status !== 'pending_manager') {
      throw new BadRequestException('Звіт не очікує погодження керівника');
    }

    if (user.role === 'clerk' && report.status !== 'pending_clerk') {
      throw new BadRequestException('Звіт не очікує узгодження діловода');
    }

    if (user.role === 'director' && report.status !== 'pending_director') {
      throw new BadRequestException('Звіт не очікує фінального погодження');
    }

    const routing = await this.getApprovalRoutingContext(report.departmentId);

    if (user.role === 'manager' || user.role === 'clerk') {
      if (report.currentApproverId && report.currentApproverId !== user.id) {
        throw new ForbiddenException('Ви не є погоджувачем цього звіту');
      }
      if (!report.currentApproverId) {
        const expectedApproverId = user.role === 'manager' ? routing.managerId : routing.clerkId;
        if (expectedApproverId !== user.id) {
          throw new ForbiddenException('Ви не є погоджувачем цього звіту');
        }
      }
    }

    const approvalResult = await this.approvalsService.approve({
      entityType: ApprovalEntityType.report,
      entityId: id,
      actorId: user.id,
      comment: dto.comment,
      resolveApprover: (role) => {
        return this.resolveApproverByRole(role, routing.managerId, routing.clerkId, routing.directorId);
      },
    });

    const newStatus: ReportStatus = approvalResult.nextStep
      ? this.statusByStepRole(approvalResult.nextStep.role)
      : 'approved';
    const nextApproverId = approvalResult.nextStep
      ? this.resolveApproverByRole(
          approvalResult.nextStep.role,
          routing.managerId,
          routing.clerkId,
          routing.directorId,
        )
      : null;

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

    if (!['pending_manager', 'pending_clerk', 'pending_director'].includes(report.status)) {
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
    const report = await this.prisma.report.findUnique({
      where: { id },
      include: { department: { select: { parentId: true } } },
    });
    if (!report) throw new NotFoundException('Звіт не знайдено');
    if (!(await this.canViewReport(report, user))) throw new ForbiddenException('Немає доступу до цього звіту');

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
        department: { select: { parentId: true } },
        author: { select: { id: true, firstName: true, lastName: true } },
      },
    });
    if (!report) throw new NotFoundException('Звіт не знайдено');
    if (!(await this.canViewReport(report, user))) throw new ForbiddenException('Немає доступу до цього звіту');

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
    const report = await this.prisma.report.findUnique({
      where: { id },
      include: { department: { select: { parentId: true } } },
    });
    if (!report) throw new NotFoundException('Звіт не знайдено');
    if (!(await this.canViewReport(report, user))) throw new ForbiddenException('Немає доступу до цього звіту');

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
      include: { department: { select: { parentId: true } } },
    });
    if (!report) throw new NotFoundException('Звіт не знайдено');
    if (!(await this.canViewReport(report, user))) throw new ForbiddenException('Немає доступу до цього звіту');

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

    if (!isAdmin && !['draft', 'rejected'].includes(report.status)) {
      throw new BadRequestException('Можна видаляти лише звіти у статусі чернетки або повернені (rejected)');
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

  private async canViewReport(report: any, user: any): Promise<boolean> {
    if (user.role === 'admin') return true;
    if (report.currentApproverId && report.currentApproverId === user.id) return true;
    if (user.role === 'clerk' || user.role === 'manager' || user.role === 'director') {
      const scopedDepartmentIds = await this.resolveDepartmentScopeIds(user.departmentId);
      if (scopedDepartmentIds.includes(report.departmentId)) return true;
    }
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

  private buildRoleAwareHeaderLines(report: any): string[] {
    const departmentName = report.department?.nameUk || report.department?.name || 'підрозділу';
    const role = report.author?.role;
    if (role === 'specialist') {
      return [
        `Про виконання роботи спеціаліста відділу ${departmentName}`,
        this.buildPeriodLabel(report.periodStart, report.periodEnd),
      ];
    }
    if (role === 'manager') {
      return [
        `Про виконання роботи сектору ${departmentName}`,
        this.buildPeriodLabel(report.periodStart, report.periodEnd),
      ];
    }
    if (role === 'clerk') {
      return [
        `Про виконання роботи діловода департаменту ${departmentName}`,
        this.buildPeriodLabel(report.periodStart, report.periodEnd),
      ];
    }
    if (role === 'director') {
      return [
        `Про виконання роботи директора департаменту ${departmentName}`,
        this.buildPeriodLabel(report.periodStart, report.periodEnd),
      ];
    }
    return [
      `Про виконання роботи ${departmentName}`,
      this.buildPeriodLabel(report.periodStart, report.periodEnd),
    ];
  }

  private formatDate(date: Date): string {
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}.${month}.${year}`;
  }

  private async resolveDepartmentScopeIds(departmentId?: string | null): Promise<string[]> {
    if (!departmentId) return [];
    const current = await this.prisma.department.findUnique({
      where: { id: departmentId },
      select: { id: true, parentId: true },
    });
    if (!current) return [];

    const rootId = current.parentId || current.id;
    const root = await this.prisma.department.findUnique({
      where: { id: rootId },
      select: {
        id: true,
        children: { select: { id: true } },
      },
    });

    if (!root) return [departmentId];
    return [root.id, ...(root.children || []).map((child) => child.id)];
  }

  private resolveAuthorName(author: any): string {
    const fullName = `${author?.firstName || ''} ${author?.lastName || ''}`.trim();
    if (fullName) return fullName;
    if (author?.email) return author.email;
    return 'Невказано';
  }

  private resolveAuthorPosition(author: any): string {
    const explicitPosition = author?.position?.titleUk || author?.position?.title;
    if (explicitPosition) return explicitPosition;
    switch (author?.role) {
      case 'specialist':
        return 'спеціаліст';
      case 'manager':
        return 'керівник відділу';
      case 'clerk':
        return 'діловод';
      case 'director':
        return 'директор департаменту';
      case 'admin':
        return 'адміністратор';
      default:
        return 'посада не вказана';
    }
  }

  private resolveApproverByRole(
    role: string,
    managerId?: string | null,
    clerkId?: string | null,
    directorId?: string | null,
  ) {
    if (role === 'manager') return managerId ?? null;
    if (role === 'clerk') return clerkId ?? null;
    if (role === 'director') return directorId ?? null;
    return null;
  }

  private statusByStepRole(role?: string): ReportStatus {
    if (role === 'director') return 'pending_director';
    if (role === 'clerk') return 'pending_clerk';
    return 'pending_manager';
  }

  private async getApprovalRoutingContext(departmentId: string) {
    const department = await this.prisma.department.findUnique({
      where: { id: departmentId },
      include: { parent: true },
    });
    const effectiveDepartment = department?.parentId ? department.parent : department;

    return {
      managerId: department?.managerId ?? null,
      clerkId: effectiveDepartment?.clerkId ?? null,
      directorId: effectiveDepartment?.directorId ?? null,
    };
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

  private async buildAggregationContextForDraft(
    report: any,
    sourceReportIds?: string[],
  ): Promise<{
    meta: {
      level: 'manager' | 'clerk' | 'director';
      sourceDepartmentsCount: number;
      sourceReportsCount: number;
    };
    sources: Array<{
      reportId: string;
      title: string;
      reportType: string;
      status: string;
      departmentId: string;
      departmentName: string;
      authorId: string;
      authorName: string;
      periodStart: string;
      periodEnd: string;
      content: Record<string, any>;
    }>;
  } | null> {
    const periodFilter = {
      periodStart: { gte: report.periodStart },
      periodEnd: { lte: report.periodEnd },
    } as const;

    if (report.author?.role === 'manager') {
      const sourceReports = await this.prisma.report.findMany({
        where: {
          ...periodFilter,
          departmentId: report.departmentId,
          author: { role: 'specialist', isActive: true },
          status: { in: ['pending_manager', 'pending_clerk', 'pending_director', 'approved'] },
          id: { not: report.id },
        },
        include: {
          author: { select: { id: true, firstName: true, lastName: true } },
          department: { select: { id: true, name: true, nameUk: true } },
        },
        orderBy: [{ periodEnd: 'asc' }, { createdAt: 'asc' }],
        take: 200,
      });

      if (!sourceReports.length) {
        throw new BadRequestException('Немає звітів спеціалістів за обраний період для формування зведення керівника.');
      }
      const filteredSourceReports = this.filterAggregationSources(sourceReports, sourceReportIds);
      if (!filteredSourceReports.length) {
        throw new BadRequestException('Оберіть хоча б один звіт спеціаліста для формування зведення керівника.');
      }

      return {
        meta: {
          level: 'manager',
          sourceDepartmentsCount: 1,
          sourceReportsCount: filteredSourceReports.length,
        },
        sources: filteredSourceReports.map((item) => this.mapSourceReport(item)),
      };
    }

    if (report.author?.role === 'clerk') {
      const childDepartmentIds = (report.department?.children || []).map((d: any) => d.id);
      if (!childDepartmentIds.length) {
        throw new BadRequestException('У департаменті не налаштовано відділи для зведення діловода.');
      }

      const sourceReports = await this.prisma.report.findMany({
        where: {
          ...periodFilter,
          departmentId: { in: childDepartmentIds },
          author: { role: 'manager', isActive: true },
          status: { in: ['pending_clerk', 'pending_director', 'approved'] },
          id: { not: report.id },
        },
        include: {
          author: { select: { id: true, firstName: true, lastName: true } },
          department: { select: { id: true, name: true, nameUk: true } },
        },
        orderBy: [{ departmentId: 'asc' }, { periodEnd: 'asc' }, { createdAt: 'asc' }],
        take: 300,
      });

      if (!sourceReports.length) {
        throw new BadRequestException('Немає звітів керівників відділів за обраний період для формування зведення діловода.');
      }
      const filteredSourceReports = this.filterAggregationSources(sourceReports, sourceReportIds);
      if (!filteredSourceReports.length) {
        throw new BadRequestException('Оберіть хоча б один звіт керівника для формування зведення діловода.');
      }

      return {
        meta: {
          level: 'clerk',
          sourceDepartmentsCount: new Set(filteredSourceReports.map((item) => item.departmentId)).size,
          sourceReportsCount: filteredSourceReports.length,
        },
        sources: filteredSourceReports.map((item) => this.mapSourceReport(item)),
      };
    }

    if (report.author?.role === 'director') {
      const sourceReports = await this.prisma.report.findMany({
        where: {
          ...periodFilter,
          departmentId: report.departmentId,
          author: { role: 'clerk', isActive: true },
          status: { in: ['pending_director', 'approved'] },
          id: { not: report.id },
        },
        include: {
          author: { select: { id: true, firstName: true, lastName: true } },
          department: { select: { id: true, name: true, nameUk: true } },
        },
        orderBy: [{ periodEnd: 'asc' }, { createdAt: 'asc' }],
        take: 120,
      });

      if (!sourceReports.length) {
        throw new BadRequestException('Немає зведених звітів діловода за обраний період для формування документа директора.');
      }
      const filteredSourceReports = this.filterAggregationSources(sourceReports, sourceReportIds);
      if (!filteredSourceReports.length) {
        throw new BadRequestException('Оберіть хоча б один звіт діловода для формування документа директора.');
      }

      return {
        meta: {
          level: 'director',
          sourceDepartmentsCount: 1,
          sourceReportsCount: filteredSourceReports.length,
        },
        sources: filteredSourceReports.map((item) => this.mapSourceReport(item)),
      };
    }

    return null;
  }

  async getOrCreateActivitiesPlan(period: string, periodType: 'weekly' | 'monthly', user: any) {
    const normalizedPeriod = this.normalizePeriod(period, periodType);
    if (!normalizedPeriod) {
      throw new BadRequestException(
        periodType === 'weekly'
          ? 'Тиждень має бути у форматі YYYY-Www'
          : 'Місяць має бути у форматі YYYY-MM',
      );
    }

    const { start, end } = this.periodBounds(normalizedPeriod, periodType);
    const scopedDepartmentIds = await this.resolveDepartmentScopeIds(user.departmentId);
    if (!scopedDepartmentIds.length) {
      throw new ForbiddenException('Немає доступу до підрозділу для плану заходів');
    }
    const rootDepartmentId = scopedDepartmentIds[0];

    let report = await this.prisma.report.findFirst({
      where: {
        departmentId: rootDepartmentId,
        reportType: periodType === 'weekly' ? 'weekly' : 'monthly',
        periodStart: start,
        periodEnd: end,
        title: { contains: `План заходів ${normalizedPeriod}` },
      },
      include: {
        department: { select: { id: true, nameUk: true, name: true } },
        author: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    if (!report) {
      report = await this.prisma.report.create({
        data: {
          reportType: periodType === 'weekly' ? 'weekly' : 'monthly',
          periodStart: start,
          periodEnd: end,
          title: `План заходів ${normalizedPeriod}`,
          status: 'draft',
          departmentId: rootDepartmentId,
          authorId: user.id,
          content: {
            activityPlan: {
              period: normalizedPeriod,
              periodType,
              rows: [],
            },
          },
        },
        include: {
          department: { select: { id: true, nameUk: true, name: true } },
          author: { select: { id: true, firstName: true, lastName: true } },
        },
      });
    }

    await this.ensureCanAccessActivitiesPlan(report, user);
    return this.mapActivitiesPlan(report);
  }

  async upsertActivitiesRow(reportId: string, dto: UpsertActivityRowDto, user: any) {
    const report = await this.prisma.report.findUnique({
      where: { id: reportId },
      include: {
        department: { select: { id: true, nameUk: true, name: true } },
        author: { select: { id: true, firstName: true, lastName: true } },
      },
    });
    if (!report) throw new NotFoundException('План заходів не знайдено');

    await this.ensureCanAccessActivitiesPlan(report, user);

    const content = this.ensureObject(report.content);
    const plan = this.ensureObject(content.activityPlan);
    const rows = Array.isArray(plan.rows) ? [...plan.rows] : [];
    const now = new Date().toISOString();

    if (dto.id) {
      const index = rows.findIndex((row: any) => row?.id === dto.id);
      if (index < 0) throw new NotFoundException('Рядок не знайдено');
      rows[index] = {
        ...rows[index],
        title: dto.title?.trim() || rows[index].title || '',
        location: dto.location?.trim() || '',
        schedule: dto.schedule?.trim() || '',
        responsible: dto.responsible?.trim() || '',
        updatedById: user.id,
        updatedAt: now,
      };
    } else {
      rows.push({
        id: uuidv4(),
        title: dto.title?.trim() || '',
        location: dto.location?.trim() || '',
        schedule: dto.schedule?.trim() || '',
        responsible: dto.responsible?.trim() || '',
        createdById: user.id,
        updatedById: user.id,
        createdAt: now,
        updatedAt: now,
      });
    }

    const updated = await this.prisma.report.update({
      where: { id: report.id },
      data: {
        content: {
          ...content,
          activityPlan: {
            ...plan,
            rows,
          },
        },
        version: report.version + 1,
      },
      include: {
        department: { select: { id: true, nameUk: true, name: true } },
        author: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    return this.mapActivitiesPlan(updated);
  }

  async deleteActivitiesRow(reportId: string, rowId: string, user: any) {
    const report = await this.prisma.report.findUnique({
      where: { id: reportId },
      include: {
        department: { select: { id: true, nameUk: true, name: true } },
        author: { select: { id: true, firstName: true, lastName: true } },
      },
    });
    if (!report) throw new NotFoundException('План заходів не знайдено');

    await this.ensureCanAccessActivitiesPlan(report, user);

    const content = this.ensureObject(report.content);
    const plan = this.ensureObject(content.activityPlan);
    const rows = Array.isArray(plan.rows) ? [...plan.rows] : [];
    const nextRows = rows.filter((row: any) => row?.id !== rowId);

    await this.prisma.report.update({
      where: { id: report.id },
      data: {
        content: {
          ...content,
          activityPlan: {
            ...plan,
            rows: nextRows,
          },
        },
        version: report.version + 1,
      },
    });

    return { success: true };
  }

  async exportActivitiesCsv(reportId: string, user: any) {
    const report = await this.prisma.report.findUnique({
      where: { id: reportId },
      include: {
        department: { select: { id: true, nameUk: true, name: true } },
      },
    });
    if (!report) throw new NotFoundException('План заходів не знайдено');

    await this.ensureCanAccessActivitiesPlan(report, user);

    const content = this.ensureObject(report.content);
    const plan = this.ensureObject(content.activityPlan);
    const rows = Array.isArray(plan.rows) ? plan.rows : [];

    const header = ['№', 'Назва заходу', 'Місце проведення заходу', 'Дата та час проведення заходу', 'Відповідальний за проведення заходу'];
    const csvLines = [header.map(this.escapeCsv).join(',')];
    rows.forEach((row: any, index: number) => {
      csvLines.push(
        [
          String(index + 1),
          row?.title || '',
          row?.location || '',
          row?.schedule || '',
          row?.responsible || '',
        ].map(this.escapeCsv).join(','),
      );
    });

    const month = this.normalizeMonth((plan.month as string) || '') || this.toMonth(report.periodStart);
    return {
      fileName: `zahody-${this.resolveActivityPeriodKey(plan, report)}.csv`,
      csv: csvLines.join('\n'),
    };
  }

  private async ensureCanAccessActivitiesPlan(report: any, user: any) {
    if (user?.role === 'admin') return;
    const scopedDepartmentIds = await this.resolveDepartmentScopeIds(user?.departmentId);
    if (!scopedDepartmentIds.includes(report.departmentId)) {
      throw new ForbiddenException('Немає доступу до цього плану заходів');
    }
  }

  private mapActivitiesPlan(report: any) {
    const content = this.ensureObject(report.content);
    const plan = this.ensureObject(content.activityPlan);
    const rows = Array.isArray(plan.rows) ? plan.rows : [];
    const periodType = plan.periodType === 'weekly' ? 'weekly' : (report.reportType === 'weekly' ? 'weekly' : 'monthly');
    const period = this.resolveActivityPeriodKey(plan, report);
    return {
      reportId: report.id,
      periodType,
      period,
      title: report.title,
      department: {
        id: report.department?.id,
        nameUk: report.department?.nameUk || report.department?.name || '',
      },
      rows: rows.map((row: any, idx: number) => ({
        id: row.id,
        index: idx + 1,
        title: row.title || '',
        location: row.location || '',
        schedule: row.schedule || '',
        responsible: row.responsible || '',
      })),
      updatedAt: report.updatedAt,
    };
  }

  private normalizeMonth(value?: string | null): string | null {
    const str = (value || '').trim();
    if (!/^\d{4}-\d{2}$/.test(str)) return null;
    return str;
  }

  private normalizeWeek(value?: string | null): string | null {
    const str = (value || '').trim();
    if (!/^\d{4}-W\d{2}$/.test(str)) return null;
    return str;
  }

  private normalizePeriod(value?: string | null, periodType: 'weekly' | 'monthly' = 'monthly'): string | null {
    if (periodType === 'weekly') return this.normalizeWeek(value);
    return this.normalizeMonth(value);
  }

  private monthBounds(month: string): { start: Date; end: Date } {
    const [yearRaw, monthRaw] = month.split('-');
    const year = Number(yearRaw);
    const mon = Number(monthRaw);
    const start = new Date(Date.UTC(year, mon - 1, 1, 0, 0, 0));
    const end = new Date(Date.UTC(year, mon, 0, 23, 59, 59));
    return { start, end };
  }

  private weekBounds(week: string): { start: Date; end: Date } {
    const match = week.match(/^(\d{4})-W(\d{2})$/);
    if (!match) throw new BadRequestException('Невірний формат тижня');
    const year = Number(match[1]);
    const weekNum = Number(match[2]);
    const jan4 = new Date(Date.UTC(year, 0, 4));
    const jan4Day = jan4.getUTCDay() || 7;
    const mondayWeek1 = new Date(jan4);
    mondayWeek1.setUTCDate(jan4.getUTCDate() - jan4Day + 1);
    const start = new Date(mondayWeek1);
    start.setUTCDate(mondayWeek1.getUTCDate() + (weekNum - 1) * 7);
    start.setUTCHours(0, 0, 0, 0);

    const end = new Date(start);
    end.setUTCDate(start.getUTCDate() + 6);
    end.setUTCHours(23, 59, 59, 999);
    return { start, end };
  }

  private periodBounds(period: string, periodType: 'weekly' | 'monthly'): { start: Date; end: Date } {
    return periodType === 'weekly' ? this.weekBounds(period) : this.monthBounds(period);
  }

  private toMonth(date: Date): string {
    const year = date.getUTCFullYear();
    const mon = String(date.getUTCMonth() + 1).padStart(2, '0');
    return `${year}-${mon}`;
  }

  private toIsoWeek(date: Date): string {
    const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
    const day = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - day);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
    return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
  }

  private resolveActivityPeriodKey(plan: Record<string, any>, report: any): string {
    const normalizedPlanPeriod = this.normalizeMonth((plan.period as string) || '') || this.normalizeWeek((plan.period as string) || '');
    if (normalizedPlanPeriod) return normalizedPlanPeriod;
    if (plan.periodType === 'weekly' || report.reportType === 'weekly') {
      return this.toIsoWeek(report.periodStart);
    }
    return this.toMonth(report.periodStart);
  }

  private escapeCsv(value: string): string {
    const str = String(value ?? '');
    if (/[",\n]/.test(str)) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  }

  private mapSourceReport(report: any) {
    return {
      reportId: report.id,
      title: report.title || '',
      reportType: report.reportType,
      status: report.status,
      departmentId: report.departmentId,
      departmentName: report.department?.nameUk || report.department?.name || 'Підрозділ',
      authorId: report.author?.id || '',
      authorName: `${report.author?.firstName || ''} ${report.author?.lastName || ''}`.trim(),
      periodStart: report.periodStart?.toISOString?.() || '',
      periodEnd: report.periodEnd?.toISOString?.() || '',
      content: this.ensureObject(report.content),
    };
  }

  private filterAggregationSources<T extends { id: string }>(sourceReports: T[], sourceReportIds?: string[]): T[] {
    if (!Array.isArray(sourceReportIds) || sourceReportIds.length === 0) {
      return sourceReports;
    }

    const allowedIds = new Set(sourceReportIds);
    return sourceReports.filter((item) => allowedIds.has(item.id));
  }

  private buildSourceReportsOutline(
    sources: Array<{
      departmentName: string;
      authorName: string;
      periodStart: string;
      periodEnd: string;
      content: Record<string, any>;
    }>,
  ): string {
    const lines: string[] = [];
    sources.forEach((source, index) => {
      lines.push(`${index + 1}. Відділ: ${source.departmentName || 'Невідомий підрозділ'}`);
      lines.push(`Відповідальний: ${source.authorName || 'Невідомий автор'}`);
      if (source.periodStart && source.periodEnd) {
        lines.push(`Період: ${this.formatDate(new Date(source.periodStart))} - ${this.formatDate(new Date(source.periodEnd))}`);
      }
      const points = this.extractSectionPoints(source.content || {}, [
        'workDone',
        'achievements',
        'problems',
        'nextWeekPlan',
        'summary',
      ]);
      if (points.length) {
        points.slice(0, 6).forEach((point, pointIndex) => {
          lines.push(`${pointIndex + 1}. ${point}`);
        });
      } else {
        lines.push('1. Дані по виконаних роботах надано у вільній формі.');
      }
      lines.push('');
    });

    return lines.join('\n').trim();
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
