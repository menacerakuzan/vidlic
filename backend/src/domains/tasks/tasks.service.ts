import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../shared/prisma.service';
import { CreateTaskDto, UpdateTaskDto, TaskQueryDto, UpdateTaskStatusDto, CreateTaskCommentDto } from './dto/tasks.dto';
import { TaskCompletedEvent, TaskCreatedEvent, TaskUpdatedEvent } from '../../events/task.events';

@Injectable()
export class TasksService {
  constructor(
    private prisma: PrismaService,
    private eventEmitter: EventEmitter2,
  ) {}

  async findAll(query: TaskQueryDto, user: any) {
    const { page = 1, limit = 50, status, priority, departmentId, assigneeId, reporterId, dueDateFrom, dueDateTo } = query;
    const skip = (page - 1) * limit;
    const isLeadership = ['manager', 'director', 'deputy_director', 'deputy_head'].includes(user.role);

    const where: any = {};

    if (['specialist', 'clerk', 'lawyer', 'accountant', 'hr'].includes(user.role)) {
      where.OR = [
        { assigneeId: user.id },
        { reporterId: user.id },
      ];
    } else if (['manager', 'director', 'deputy_director'].includes(user.role)) {
      const scopedDepartmentIds = await this.resolveScopedDepartmentIdsForUser(user);
      where.departmentId = { in: scopedDepartmentIds.length ? scopedDepartmentIds : [user.departmentId].filter(Boolean) };
      where.NOT = {
        OR: [
          { isPrivate: true },
          {
            AND: [
              { reportId: null },
              { assigneeId: null },
              { reporter: { is: { role: 'specialist' } } },
            ],
          },
        ],
      };
    }

    if (status) where.status = status;
    if (priority) where.priority = priority;
    if (departmentId && user.role !== 'specialist') {
      if (user.role === 'admin' || user.role === 'deputy_head') {
        where.departmentId = departmentId;
      } else {
        const scopedDepartmentIds = await this.resolveScopedDepartmentIdsForUser(user);
        if (!scopedDepartmentIds.includes(departmentId)) {
          throw new ForbiddenException('Немає доступу до задач цього підрозділу');
        }
        where.departmentId = departmentId;
      }
    }
    if (assigneeId) where.assigneeId = assigneeId;
    if (reporterId) where.reporterId = reporterId;
    
    if (dueDateFrom && dueDateTo) {
      where.dueDate = {
        gte: new Date(dueDateFrom),
        lte: new Date(dueDateTo),
      };
    }

    const tasks = await this.prisma.task.findMany({
      where,
      ...(isLeadership ? {} : { skip, take: limit }),
      include: {
        assignee: { select: { id: true, firstName: true, lastName: true, email: true } },
        reporter: { select: { id: true, firstName: true, lastName: true, role: true } },
        department: { select: { id: true, name: true, nameUk: true } },
        report: { select: { id: true, title: true, reportType: true } },
      },
      orderBy: [
        { priority: 'desc' },
        { dueDate: 'asc' },
        { createdAt: 'desc' },
      ],
    });

    const visibleTasks = isLeadership ? tasks.filter((task) => !this.shouldHideFromLeadership(task, user)) : tasks;
    const total = isLeadership ? visibleTasks.length : await this.prisma.task.count({ where });
    const pageData = isLeadership ? visibleTasks.slice(skip, skip + limit) : visibleTasks;

    return {
      data: pageData.map(t => this.mapTask(t)),
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async getKanban(departmentId: string, user: any) {
    const where: any = {};

    if (['specialist', 'clerk', 'lawyer', 'accountant', 'hr'].includes(user.role)) {
      where.OR = [
        { assigneeId: user.id },
        { reporterId: user.id },
      ];
    } else if (['manager', 'director', 'deputy_director'].includes(user.role)) {
      const scopedDepartmentIds = await this.resolveScopedDepartmentIdsForUser(user);
      where.departmentId = { in: scopedDepartmentIds.length ? scopedDepartmentIds : [user.departmentId].filter(Boolean) };
      where.NOT = {
        OR: [
          { isPrivate: true },
          {
            AND: [
              { reportId: null },
              { assigneeId: null },
              { reporter: { is: { role: 'specialist' } } },
            ],
          },
        ],
      };
    } else if (departmentId) {
      where.departmentId = departmentId;
    }

    const tasks = await this.prisma.task.findMany({
      where,
      include: {
        assignee: { select: { id: true, firstName: true, lastName: true } },
        reporter: { select: { id: true, firstName: true, lastName: true, role: true } },
        department: { select: { id: true, nameUk: true } },
      },
      orderBy: [
        { priority: 'desc' },
        { dueDate: 'asc' },
      ],
    });

    const visibleTasks = tasks.filter((task) => !this.shouldHideFromLeadership(task, user));

    const kanban = {
      todo: visibleTasks.filter(t => t.status === 'todo').map(t => this.mapTask(t)),
      in_progress: visibleTasks.filter(t => t.status === 'in_progress').map(t => this.mapTask(t)),
      done: visibleTasks.filter(t => t.status === 'done').map(t => this.mapTask(t)),
    };

    return kanban;
  }

  async findById(id: string, user: any) {
    const task = await this.prisma.task.findUnique({
      where: { id },
      include: {
        assignee: true,
        reporter: true,
        department: true,
        report: true,
        comments: {
          include: { user: { select: { id: true, firstName: true, lastName: true } } },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!task) {
      throw new NotFoundException('Задачу не знайдено');
    }

    if (!(await this.canViewTask(task, user))) {
      throw new ForbiddenException('Немає доступу до задачі');
    }

    return this.mapTaskFull(task);
  }

  async create(dto: CreateTaskDto, user: any) {
    const creator = await this.prisma.user.findUnique({ where: { id: user.id } });
    const targetDepartmentId = dto.departmentId || creator?.departmentId || null;

    if (!targetDepartmentId) {
      throw new BadRequestException('Підрозділ не визначено для задачі');
    }

    if (!(await this.canCreateTaskInDepartment(user, targetDepartmentId))) {
      throw new ForbiddenException('Немає доступу до створення задачі в цьому підрозділі');
    }

    if (dto.assigneeId) {
      const assignee = await this.prisma.user.findUnique({ where: { id: dto.assigneeId } });
      if (!assignee || assignee.departmentId !== targetDepartmentId) {
        throw new BadRequestException('Виконавець має бути з того ж підрозділу');
      }
      this.assertTaskAssignmentAllowed(user, assignee.role);
    }

    const isPrivateSpecialistTask =
      user.role === 'specialist' &&
      !dto.reportId &&
      (!dto.assigneeId || dto.assigneeId === user.id);

    const task = await this.prisma.task.create({
      data: {
        title: dto.title,
        description: dto.description,
        priority: dto.priority || 'medium',
        status: 'todo',
        executionHours: dto.executionHours,
        isPrivate: isPrivateSpecialistTask,
        departmentId: targetDepartmentId,
        assigneeId: dto.assigneeId,
        reporterId: user.id,
        reportId: dto.reportId,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
      },
      include: {
        assignee: true,
        reporter: true,
        department: true,
      },
    });

    this.eventEmitter.emit('task.created', new TaskCreatedEvent(task.id, user.id, dto.assigneeId));

    return this.mapTask(task);
  }

  async update(id: string, dto: UpdateTaskDto, user: any) {
    const task = await this.prisma.task.findUnique({
      where: { id },
      include: {
        reporter: { select: { id: true, role: true } },
      },
    });

    if (!task) {
      throw new NotFoundException('Задачу не знайдено');
    }

    if (!(await this.canManageTask(task, user))) {
      throw new ForbiddenException('Немає доступу до редагування задачі');
    }

    const targetDepartmentId = dto.departmentId ?? task.departmentId;
    if (!(await this.canCreateTaskInDepartment(user, targetDepartmentId))) {
      throw new ForbiddenException('Немає доступу до цільового підрозділу задачі');
    }

    if (dto.assigneeId) {
      const assignee = await this.prisma.user.findUnique({ where: { id: dto.assigneeId } });
      if (!assignee || assignee.departmentId !== (dto.departmentId ?? task.departmentId)) {
        throw new BadRequestException('Виконавець має бути з того ж підрозділу');
      }
      this.assertTaskAssignmentAllowed(user, assignee.role);
    }

    const updated = await this.prisma.task.update({
      where: { id },
      data: {
        title: dto.title ?? task.title,
        description: dto.description ?? task.description,
        priority: dto.priority ?? task.priority,
        executionHours: dto.executionHours ?? task.executionHours,
        departmentId: dto.departmentId ?? task.departmentId,
        assigneeId: dto.assigneeId ?? task.assigneeId,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : (dto.dueDate === null ? null : task.dueDate),
      },
      include: {
        assignee: true,
        department: true,
      },
    });

    if (dto.assigneeId && dto.assigneeId !== task.assigneeId) {
      this.eventEmitter.emit('task.updated', new TaskUpdatedEvent(id, user.id, dto.assigneeId));
    } else {
      this.eventEmitter.emit('task.updated', new TaskUpdatedEvent(id, user.id, null));
    }

    return this.mapTask(updated);
  }

  async updateStatus(id: string, dto: UpdateTaskStatusDto, user: any) {
    const task = await this.prisma.task.findUnique({
      where: { id },
      include: {
        reporter: { select: { id: true, role: true } },
      },
    });

    if (!task) {
      throw new NotFoundException('Задачу не знайдено');
    }

    if (!(await this.canMoveTaskStatus(task, user))) {
      throw new ForbiddenException('Немає доступу до зміни статусу задачі');
    }

    const oldStatus = task.status;
    
    if (oldStatus === dto.status) {
      return this.mapTask(task);
    }

    const updated = await this.prisma.task.update({
      where: { id },
      data: {
        status: dto.status,
        completedAt: dto.status === 'done' ? new Date() : null,
      },
      include: {
        assignee: true,
        reporter: true,
        department: true,
      },
    });

    if (dto.status === 'done') {
      this.eventEmitter.emit('task.completed', new TaskCompletedEvent(id, user.id, task.reporterId));
    } else {
      this.eventEmitter.emit('task.updated', new TaskUpdatedEvent(id, user.id, task.assigneeId));
    }

    return this.mapTask(updated);
  }

  async addComment(id: string, dto: CreateTaskCommentDto, userId: string) {
    const task = await this.prisma.task.findUnique({
      where: { id },
      include: {
        reporter: { select: { id: true, role: true } },
      },
    });

    if (!task) {
      throw new NotFoundException('Задачу не знайдено');
    }

    const actor = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true, departmentId: true, scopeDepartmentIds: true },
    });
    if (!actor || !(await this.canViewTask(task, actor))) {
      throw new ForbiddenException('Немає доступу до задачі');
    }

    const comment = await this.prisma.taskComment.create({
      data: {
        taskId: id,
        userId,
        content: dto.content,
      },
      include: {
        user: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    this.eventEmitter.emit('task.comment', { taskId: id, userId, commentId: comment.id });

    return {
      id: comment.id,
      content: comment.content,
      user: {
        id: comment.user.id,
        firstName: comment.user.firstName,
        lastName: comment.user.lastName,
      },
      createdAt: comment.createdAt,
    };
  }

  async delete(id: string, user: any) {
    const task = await this.prisma.task.findUnique({ where: { id } });

    if (!task) {
      throw new NotFoundException('Задачу не знайдено');
    }

    if (!(await this.canManageTask(task, user))) {
      throw new ForbiddenException('Немає доступу до видалення задачі');
    }

    await this.prisma.task.delete({ where: { id } });

    this.eventEmitter.emit('task.deleted', { taskId: id, userId: user.id });

    return { success: true };
  }

  private mapTask(task: any) {
    return {
      id: task.id,
      title: task.title,
      description: task.description,
      status: task.status,
      priority: task.priority,
      executionHours: task.executionHours ?? null,
      isPrivate: Boolean(task.isPrivate),
      dueDate: task.dueDate,
      assignee: task.assignee ? {
        id: task.assignee.id,
        firstName: task.assignee.firstName,
        lastName: task.assignee.lastName,
      } : null,
      reporter: task.reporter ? {
        id: task.reporter.id,
        firstName: task.reporter.firstName,
        lastName: task.reporter.lastName,
      } : null,
      department: task.department ? {
        id: task.department.id,
        name: task.department.nameUk,
      } : null,
      report: task.report ? {
        id: task.report.id,
        title: task.report.title,
        reportType: task.report.reportType,
      } : null,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
      completedAt: task.completedAt,
    };
  }

  private mapTaskFull(task: any) {
    return {
      ...this.mapTask(task),
      comments: task.comments?.map(c => ({
        id: c.id,
        content: c.content,
        user: {
          id: c.user.id,
          firstName: c.user.firstName,
          lastName: c.user.lastName,
        },
        createdAt: c.createdAt,
      })),
    };
  }

  private async canCreateTaskInDepartment(user: any, departmentId: string) {
    if (user.role === 'admin') return true;
    if (user.role === 'deputy_head') return true;
    if (user.role === 'director') {
      const scopedDepartmentIds = await this.resolveDepartmentScopeIds(user.departmentId);
      return scopedDepartmentIds.includes(departmentId);
    }
    if (user.role === 'deputy_director') {
      const scopedDepartmentIds = await this.resolveScopedDepartmentIdsForUser(user);
      return scopedDepartmentIds.includes(departmentId);
    }
    if (user.role === 'manager' || user.role === 'specialist' || user.role === 'clerk') {
      return user.departmentId === departmentId;
    }
    return false;
  }

  private async canManageTask(task: any, user: any) {
    if (user.role === 'admin') return true;
    if (user.role === 'deputy_head') return false;
    if (this.shouldHideFromLeadership(task, user) && task.reporterId !== user.id) return false;
    if (user.role === 'director' || user.role === 'manager') {
      const scoped = await this.resolveScopedDepartmentIdsForUser(user);
      if (scoped.includes(task.departmentId)) return true;
    }
    if (user.role === 'deputy_director') {
      const scoped = await this.resolveScopedDepartmentIdsForUser(user);
      if (scoped.includes(task.departmentId)) return true;
    }
    if (user.role === 'clerk' && (task.reporterId === user.id || task.assigneeId === user.id)) return true;
    if (user.role === 'specialist' && task.reporterId === user.id) return true;
    return false;
  }

  private async canMoveTaskStatus(task: any, user: any) {
    if (user.role === 'admin') return true;
    if (user.role === 'deputy_head') return false;
    if (this.shouldHideFromLeadership(task, user) && task.reporterId !== user.id) return false;
    if (user.role === 'director' || user.role === 'manager') {
      const scoped = await this.resolveScopedDepartmentIdsForUser(user);
      if (scoped.includes(task.departmentId)) return true;
    }
    if (user.role === 'deputy_director') {
      const scoped = await this.resolveScopedDepartmentIdsForUser(user);
      if (scoped.includes(task.departmentId)) return true;
    }
    if (user.role === 'clerk' && (task.assigneeId === user.id || task.reporterId === user.id)) return true;
    if (user.role === 'specialist' && (task.assigneeId === user.id || task.reporterId === user.id)) return true;
    return false;
  }

  private async canViewTask(task: any, user: any) {
    if (user.role === 'admin') return true;
    if (user.role === 'deputy_head') return true;
    if (this.shouldHideFromLeadership(task, user) && task.reporterId !== user.id) return false;
    if (user.role === 'director' || user.role === 'manager') {
      const scoped = await this.resolveScopedDepartmentIdsForUser(user);
      if (scoped.includes(task.departmentId)) return true;
    }
    if (user.role === 'deputy_director') {
      const scoped = await this.resolveScopedDepartmentIdsForUser(user);
      if (scoped.includes(task.departmentId)) return true;
    }
    if (user.role === 'clerk' && (task.assigneeId === user.id || task.reporterId === user.id)) return true;
    if (['specialist', 'lawyer', 'accountant', 'hr'].includes(user.role) && (task.assigneeId === user.id || task.reporterId === user.id)) return true;
    return false;
  }

  private shouldHideFromLeadership(task: any, user: any) {
    if (!(['director', 'deputy_director', 'manager'].includes(user.role))) return false;
    if (task.isPrivate) return true;

    const reporterRole = task?.reporter?.role;
    const isLegacyPrivateSpecialistTask =
      reporterRole === 'specialist' &&
      !task.reportId &&
      (!task.assigneeId || task.assigneeId === task.reporterId);

    return isLegacyPrivateSpecialistTask;
  }

  async getDepartmentTransparency(user: any) {
    if (user?.role === 'clerk') {
      return [];
    }
    const where: any = { isPrivate: false };
    if (!['admin', 'deputy_head'].includes(user?.role)) {
      const scopedDepartmentIds = await this.resolveScopedDepartmentIdsForUser(user);
      where.departmentId = { in: scopedDepartmentIds.length ? scopedDepartmentIds : [user?.departmentId].filter(Boolean) };
    }

    const tasks = await this.prisma.task.findMany({
      where,
      select: {
        id: true,
        status: true,
        priority: true,
        departmentId: true,
        department: { select: { id: true, nameUk: true, code: true } },
      },
    });

    const summary = new Map<string, any>();
    for (const task of tasks) {
      const key = task.departmentId || 'none';
      const current = summary.get(key) || {
        departmentId: task.departmentId,
        departmentName: task.department?.nameUk || 'Без підрозділу',
        departmentCode: task.department?.code || '-',
        total: 0,
        todo: 0,
        inProgress: 0,
        done: 0,
        high: 0,
        medium: 0,
        low: 0,
        critical: 0,
      };
      current.total += 1;
      if (task.status === 'todo') current.todo += 1;
      if (task.status === 'in_progress') current.inProgress += 1;
      if (task.status === 'done') current.done += 1;
      if (task.priority === 'critical') current.critical += 1;
      if (task.priority === 'high') current.high += 1;
      if (task.priority === 'medium') current.medium += 1;
      if (task.priority === 'low') current.low += 1;
      summary.set(key, current);
    }

    return Array.from(summary.values()).sort((a, b) => b.total - a.total);
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

  private getScopedDepartmentIdsFromUserPayload(user: any): string[] {
    if (Array.isArray(user?.scopeDepartmentIds) && user.scopeDepartmentIds.length > 0) {
      return user.scopeDepartmentIds.filter(Boolean);
    }
    return [user?.departmentId].filter(Boolean);
  }

  private async resolveScopedDepartmentIdsForUser(user: any): Promise<string[]> {
    if (!user?.departmentId) return [];
    if (user.role === 'manager') return [user.departmentId];
    if (user.role === 'director') {
      return this.resolveDepartmentScopeIds(user.departmentId);
    }
    if (user.role === 'deputy_director') {
      const configured = this.getScopedDepartmentIdsFromUserPayload(user);
      if (configured.length > 0) {
        const expanded = new Set<string>();
        for (const depId of configured) {
          expanded.add(depId);
          const dep = await this.prisma.department.findUnique({
            where: { id: depId },
            select: { children: { select: { id: true } } },
          });
          for (const child of dep?.children || []) expanded.add(child.id);
        }
        return Array.from(expanded);
      }
      return this.resolveDepartmentScopeIds(user.departmentId);
    }
    return [user.departmentId];
  }

  private assertTaskAssignmentAllowed(actor: any, assigneeRole: string) {
    if (actor?.role === 'admin') return;
    if (actor?.role === 'director') {
      if (['deputy_director', 'manager', 'specialist'].includes(assigneeRole)) return;
      throw new ForbiddenException('Директор може призначати задачі лише заступнику директора, керівнику або спеціалісту');
    }
    if (actor?.role === 'deputy_director') {
      if (['manager', 'specialist'].includes(assigneeRole)) return;
      throw new ForbiddenException('Заступник директора може призначати задачі лише керівнику або спеціалісту');
    }
    if (actor?.role === 'manager') {
      if (assigneeRole === 'specialist') return;
      throw new ForbiddenException('Керівник може призначати задачі лише спеціалісту');
    }
    if (actor?.role === 'specialist' || actor?.role === 'clerk') {
      if (!assigneeRole || assigneeRole === actor?.role) return;
      throw new ForbiddenException('Недостатньо прав для призначення задачі іншому користувачу');
    }
  }
}
