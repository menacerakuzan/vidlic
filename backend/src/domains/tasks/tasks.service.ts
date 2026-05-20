import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../shared/prisma.service';
import { CreateTaskDto, UpdateTaskDto, TaskQueryDto, UpdateTaskStatusDto, CreateTaskCommentDto } from './dto/tasks.dto';
import { TaskCompletedEvent, TaskCreatedEvent, TaskUpdatedEvent, TaskStatusChangedEvent, TaskCommentEvent } from '../../events/task.events';

@Injectable()
export class TasksService {
  constructor(
    private prisma: PrismaService,
    private eventEmitter: EventEmitter2,
  ) {}

  async findAll(query: TaskQueryDto, user: any) {
    const { page = 1, limit = 50, status, departmentId, assigneeId, reporterId, dueDateFrom, dueDateTo } = query;
    const skip = (page - 1) * limit;

    const where: any = { deletedAt: null, archivedAt: null };
    const andFilters: any[] = [];
    const visibilityClauses: any[] = [];

    if (['specialist', 'clerk', 'lawyer', 'accountant', 'hr'].includes(user.role)) {
      visibilityClauses.push(
        { assigneeId: user.id },
        { reporterId: user.id },
        { coAssigneeIds: { array_contains: user.id } },
        // parent tasks whose subtasks are assigned to this user
        { subtasks: { some: { OR: [{ assigneeId: user.id }, { reporterId: user.id }, { coAssigneeIds: { array_contains: user.id } }] } } },
      );
    } else if (['manager', 'director', 'deputy_director', 'deputy_head'].includes(user.role)) {
      const scopedDepartmentIds = await this.resolveScopedDepartmentIdsForUser(user);
      const effectiveDeptIds = scopedDepartmentIds.length ? scopedDepartmentIds : [user.departmentId].filter(Boolean);
      visibilityClauses.push(
        {
          AND: [
            { departmentId: { in: effectiveDeptIds } },
            { NOT: this.buildLeadershipExcludeFilter() },
          ],
        },
        // задачі де reporter зі свого відділу але без departmentId (напр. спеціаліст сам собі)
        {
          AND: [
            { departmentId: null },
            { reporter: { departmentId: { in: effectiveDeptIds } } },
            { NOT: this.buildLeadershipExcludeFilter() },
          ],
        },
        { assigneeId: user.id },
        { reporterId: user.id },
        { coAssigneeIds: { array_contains: user.id } },
      );
    }
    if (visibilityClauses.length > 0) {
      andFilters.push({ OR: visibilityClauses });
    }

    if (status) andFilters.push({ status });
    if (departmentId && user.role !== 'specialist') {
      if (user.role === 'admin' || user.role === 'deputy_head') {
        andFilters.push({ departmentId });
      } else {
        const scopedDepartmentIds = await this.resolveScopedDepartmentIdsForUser(user);
        if (!scopedDepartmentIds.includes(departmentId)) {
          throw new ForbiddenException('Немає доступу до задач цього підрозділу');
        }
        andFilters.push({ departmentId });
      }
    }
    if (assigneeId) andFilters.push({ assigneeId });
    if (reporterId) andFilters.push({ reporterId });

    if (dueDateFrom && dueDateTo) {
      andFilters.push({
        dueDate: {
          gte: new Date(dueDateFrom),
          lte: new Date(dueDateTo),
        },
      });
    }

    if (andFilters.length > 0) {
      where.AND = andFilters;
    }

    const [tasks, total] = await Promise.all([
      this.prisma.task.findMany({
        where,
        skip,
        take: limit,
        include: {
          assignee: { select: { id: true, firstName: true, lastName: true, email: true } },
          reporter: { select: { id: true, firstName: true, lastName: true, role: true } },
          department: { select: { id: true, name: true, nameUk: true } },
          report: { select: { id: true, title: true, reportType: true } },
          subtasks: { select: { id: true, status: true } },
        },
        orderBy: [
          { dueDate: 'asc' },
          { createdAt: 'desc' },
        ],
      }),
      this.prisma.task.count({ where }),
    ]);

    return {
      data: tasks.map(t => this.mapTask(t)),
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async getKanban(departmentId: string, user: any) {
    const where: any = { deletedAt: null, archivedAt: null };
    const visibilityClauses: any[] = [];

    if (['specialist', 'clerk', 'lawyer', 'accountant', 'hr'].includes(user.role)) {
      visibilityClauses.push(
        { assigneeId: user.id },
        { reporterId: user.id },
        { coAssigneeIds: { array_contains: user.id } },
      );
    } else if (['manager', 'director', 'deputy_director', 'deputy_head'].includes(user.role)) {
      const scopedDepartmentIds = await this.resolveScopedDepartmentIdsForUser(user);
      const effectiveDeptIds = scopedDepartmentIds.length ? scopedDepartmentIds : [user.departmentId].filter(Boolean);
      visibilityClauses.push(
        {
          AND: [
            { departmentId: { in: effectiveDeptIds } },
            { NOT: this.buildLeadershipExcludeFilter() },
          ],
        },
        {
          AND: [
            { departmentId: null },
            { reporter: { departmentId: { in: effectiveDeptIds } } },
            { NOT: this.buildLeadershipExcludeFilter() },
          ],
        },
        { assigneeId: user.id },
        { reporterId: user.id },
        { coAssigneeIds: { array_contains: user.id } },
      );
    } else if (departmentId) {
      visibilityClauses.push({ departmentId });
    }

    if (visibilityClauses.length > 0) {
      where.OR = visibilityClauses;
    }

    const tasks = await this.prisma.task.findMany({
      where,
      include: {
        assignee: { select: { id: true, firstName: true, lastName: true } },
        reporter: { select: { id: true, firstName: true, lastName: true, role: true } },
        department: { select: { id: true, nameUk: true } },
      },
      orderBy: [
        { dueDate: 'asc' },
        { createdAt: 'desc' },
      ],
    });

    const kanban = {
      todo: tasks.filter(t => t.status === 'todo').map(t => this.mapTask(t)),
      in_progress: tasks.filter(t => t.status === 'in_progress').map(t => this.mapTask(t)),
      done: tasks.filter(t => t.status === 'done').map(t => this.mapTask(t)),
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
        parent: { select: { id: true, title: true } },
        subtasks: {
          include: {
            assignee: { select: { id: true, firstName: true, lastName: true } },
          },
          orderBy: { createdAt: 'asc' },
        },
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

  async getSubtasks(parentId: string, user: any) {
    const parent = await this.prisma.task.findUnique({ where: { id: parentId } });
    if (!parent) throw new NotFoundException('Задачу не знайдено');
    if (!(await this.canViewTask(parent, user))) throw new ForbiddenException('Немає доступу');

    const subtasks = await this.prisma.task.findMany({
      where: { parentId },
      include: {
        assignee: { select: { id: true, firstName: true, lastName: true } },
        reporter: { select: { id: true, firstName: true, lastName: true } },
        department: { select: { id: true, name: true, nameUk: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
    return subtasks.map(t => this.mapTask(t));
  }

  async createSubtask(parentId: string, dto: CreateTaskDto, user: any) {
    const parent = await this.prisma.task.findUnique({ where: { id: parentId } });
    if (!parent) throw new NotFoundException('Батьківську задачу не знайдено');
    if (!(await this.canViewTask(parent, user))) throw new ForbiddenException('Немає доступу до батьківської задачі');
    if (parent.parentId) throw new BadRequestException('Підзадача не може мати власні підзадачі');

    // inherit department from parent if not provided
    const targetDepartmentId = dto.departmentId || parent.departmentId;
    if (!targetDepartmentId) throw new BadRequestException('Підрозділ не визначено');

    // allow self-assignment even if the parent task is in a different department
    const assigningSelf = dto.assigneeId === user.id;
    if (!assigningSelf && !(await this.canCreateTaskInDepartment(user, targetDepartmentId))) {
      throw new ForbiddenException('Немає доступу до створення задачі в цьому підрозділі');
    }

    if (dto.assigneeId && !assigningSelf) {
      const assignee = await this.prisma.user.findUnique({ where: { id: dto.assigneeId } });
      if (!assignee) throw new BadRequestException('Виконавця не знайдено');
      this.assertTaskAssignmentAllowed(user, assignee.role, dto.assigneeId);
    }

    const subtask = await this.prisma.task.create({
      data: {
        title: dto.title,
        description: dto.description,
        status: 'todo',
        priority: dto.priority ?? 'medium',
        isPrivate: false,
        departmentId: targetDepartmentId,
        assigneeId: dto.assigneeId || null,
        coAssigneeIds: [],
        reporterId: user.id,
        reportId: parent.reportId || null,
        parentId,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
      },
      include: {
        assignee: { select: { id: true, firstName: true, lastName: true } },
        reporter: { select: { id: true, firstName: true, lastName: true } },
        department: { select: { id: true, name: true, nameUk: true } },
      },
    });

    this.eventEmitter.emit('task.created', new TaskCreatedEvent(subtask.id, user.id, dto.assigneeId));

    return this.mapTask(subtask);
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
      if (!assignee) {
        throw new BadRequestException('Виконавця не знайдено');
      }
      const canAssignAcrossDepts = ['admin', 'director', 'deputy_head', 'deputy_director'].includes(user.role);
      if (!canAssignAcrossDepts) {
        const assigneeSecondary = Array.isArray(assignee.secondaryDepartmentIds) ? assignee.secondaryDepartmentIds as string[] : [];
        const assigneeBelongs = assignee.departmentId === targetDepartmentId || assigneeSecondary.includes(targetDepartmentId);
        if (!assigneeBelongs && dto.assigneeId !== user.id) {
          throw new BadRequestException('Виконавець має бути з того ж підрозділу або бути сумісником у ньому');
        }
      }
      this.assertTaskAssignmentAllowed(user, assignee.role, dto.assigneeId);
    }

    const isPrivateSpecialistTask =
      user.role === 'specialist' &&
      !dto.reportId &&
      (!dto.assigneeId || dto.assigneeId === user.id);

    const task = await this.prisma.task.create({
      data: {
        title: dto.title,
        description: dto.description,
        status: 'todo',
        priority: dto.priority ?? 'medium',
        isPrivate: isPrivateSpecialistTask,
        departmentId: targetDepartmentId,
        assigneeId: dto.assigneeId,
        coAssigneeIds: Array.isArray(dto.coAssigneeIds) ? dto.coAssigneeIds : [],
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

    const actorIsAssignee = task.assigneeId === user.id;
    const actorIsReporter = task.reporterId === user.id;
    const actorIsLeader = ['admin', 'director', 'deputy_director', 'manager'].includes(user.role);
    const assigneeOnlyUpdate =
      dto.assigneeId !== undefined &&
      dto.title === undefined &&
      dto.description === undefined &&
      dto.departmentId === undefined &&
      dto.dueDate === undefined;

    // Assignees can only forward tasks assigned to them; full edit is reserved for creator/leadership.
    if (actorIsAssignee && !actorIsReporter && !actorIsLeader && !assigneeOnlyUpdate) {
      throw new ForbiddenException('Ви можете лише перенаправити задачу, яку вам призначили');
    }

    const targetDepartmentId = dto.departmentId ?? task.departmentId;
    if (!(await this.canCreateTaskInDepartment(user, targetDepartmentId))) {
      throw new ForbiddenException('Немає доступу до цільового підрозділу задачі');
    }

    if (dto.assigneeId) {
      const assignee = await this.prisma.user.findUnique({ where: { id: dto.assigneeId } });
      const isActorReassigningOwnedTask = actorIsAssignee && dto.assigneeId !== task.assigneeId;
      if (!assignee) {
        throw new BadRequestException('Виконавця не знайдено');
      }
      if (!isActorReassigningOwnedTask) {
        const targetDep = dto.departmentId ?? task.departmentId;
        const assigneeSecondary = Array.isArray(assignee.secondaryDepartmentIds) ? assignee.secondaryDepartmentIds as string[] : [];
        if (assignee.departmentId !== targetDep && !assigneeSecondary.includes(targetDep)) {
          throw new BadRequestException('Виконавець має бути з того ж підрозділу або бути сумісником у ньому');
        }
      }
      if (isActorReassigningOwnedTask) {
        if (assignee.role === 'director') {
          throw new ForbiddenException('Задачу не можна перенаправити директору');
        }
      } else {
        this.assertTaskAssignmentAllowed(user, assignee.role);
      }
    }

    const updated = await this.prisma.task.update({
      where: { id },
      data: {
        title: dto.title ?? task.title,
        description: dto.description ?? task.description,
        priority: dto.priority ?? task.priority,
        departmentId: dto.departmentId ?? task.departmentId,
        assigneeId: dto.assigneeId ?? task.assigneeId,
        coAssigneeIds: Array.isArray(dto.coAssigneeIds) ? dto.coAssigneeIds : task.coAssigneeIds,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : (dto.dueDate === null ? null : task.dueDate),
      },
      include: {
        assignee: true,
        department: true,
      },
    });

    const contentChanged = (dto.title !== undefined && dto.title !== task.title) ||
      (dto.description !== undefined && dto.description !== task.description);
    if (dto.assigneeId && dto.assigneeId !== task.assigneeId) {
      this.eventEmitter.emit('task.updated', new TaskUpdatedEvent(id, user.id, dto.assigneeId, contentChanged));
    } else {
      this.eventEmitter.emit('task.updated', new TaskUpdatedEvent(id, user.id, null, contentChanged));
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
        startedAt: dto.status === 'in_progress' && !task.startedAt ? new Date() : task.startedAt,
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
    this.eventEmitter.emit('task.status_changed', new TaskStatusChangedEvent(id, user.id, dto.status));

    return this.mapTask(updated);
  }

  async getComments(id: string, user: any) {
    const task = await this.prisma.task.findUnique({ where: { id } });
    if (!task) throw new NotFoundException('Задачу не знайдено');
    if (!(await this.canViewTask(task, user))) throw new ForbiddenException('Немає доступу до задачі');

    const comments = await this.prisma.taskComment.findMany({
      where: { taskId: id },
      include: { user: { select: { id: true, firstName: true, lastName: true } } },
      orderBy: { createdAt: 'asc' },
    });

    return comments.map((c: any) => ({
      id: c.id,
      content: c.content,
      user: { id: c.user.id, firstName: c.user.firstName, lastName: c.user.lastName },
      createdAt: c.createdAt,
    }));
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

    this.eventEmitter.emit('task.comment_added', new TaskCommentEvent(id, userId, dto.content));

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

  async groupTasks(title: string, taskIds: string[], user: any) {
    if (!taskIds.length) throw new BadRequestException('Вкажіть хоча б одну задачу');

    const tasks = await this.prisma.task.findMany({
      where: { id: { in: taskIds }, deletedAt: null, parentId: null },
    });

    if (tasks.length === 0) throw new NotFoundException('Задачі не знайдено');

    // use departmentId and reporterId from first task
    const first = tasks[0];

    const parent = await this.prisma.task.create({
      data: {
        title,
        reporterId: user.id,
        departmentId: first.departmentId,
        priority: 'medium',
      },
      include: {
        assignee: { select: { id: true, firstName: true, lastName: true } },
        reporter: { select: { id: true, firstName: true, lastName: true } },
        department: { select: { id: true, name: true, nameUk: true } },
        subtasks: true,
      },
    });

    await this.prisma.task.updateMany({
      where: { id: { in: taskIds } },
      data: { parentId: parent.id },
    });

    return this.mapTask(parent);
  }

  async delete(id: string, user: any) {
    const task = await this.prisma.task.findUnique({ where: { id } });

    if (!task) {
      throw new NotFoundException('Задачу не знайдено');
    }

    if (!(await this.canManageTask(task, user))) {
      throw new ForbiddenException('Немає доступу до видалення задачі');
    }

    await this.prisma.task.update({ where: { id }, data: { deletedAt: new Date() } });

    this.eventEmitter.emit('task.deleted', { taskId: id, userId: user.id });

    return { success: true };
  }

  async getArchive(user: any) {
    const visibilityClauses: any[] = [];

    if (['specialist', 'clerk', 'lawyer', 'accountant', 'hr'].includes(user.role)) {
      visibilityClauses.push({ assigneeId: user.id }, { reporterId: user.id }, { coAssigneeIds: { array_contains: user.id } });
    } else if (['manager', 'director', 'deputy_director', 'deputy_head'].includes(user.role)) {
      const scopedDepartmentIds = await this.resolveScopedDepartmentIdsForUser(user);
      visibilityClauses.push(
        { departmentId: { in: scopedDepartmentIds.length ? scopedDepartmentIds : [user.departmentId].filter(Boolean) } },
        { assigneeId: user.id },
        { reporterId: user.id },
        { coAssigneeIds: { array_contains: user.id } },
      );
    }

    const archiveFilter = { OR: [{ NOT: { deletedAt: null } }, { NOT: { archivedAt: null } }] };
    const where: any = visibilityClauses.length > 0
      ? { AND: [archiveFilter, { OR: visibilityClauses }] }
      : archiveFilter;

    const tasks = await this.prisma.task.findMany({
      where,
      include: {
        assignee: { select: { id: true, firstName: true, lastName: true } },
        reporter: { select: { id: true, firstName: true, lastName: true, role: true } },
        department: { select: { id: true, name: true, nameUk: true } },
      },
      orderBy: { updatedAt: 'desc' },
      take: 200,
    });

    return tasks.map((t: any) => ({
      ...this.mapTask(t),
      deletedAt: t.deletedAt,
      archivedAt: t.archivedAt,
      archiveType: t.deletedAt ? 'deleted' : 'completed',
    }));
  }

  async restoreTask(id: string, user: any) {
    const task = await this.prisma.task.findUnique({ where: { id } });
    if (!task) throw new NotFoundException('Задачу не знайдено');
    if (!(await this.canManageTask(task, user))) throw new ForbiddenException('Немає доступу');
    await this.prisma.task.update({
      where: { id },
      data: {
        deletedAt: null,
        archivedAt: null,
        // Reset done status so cron doesn't immediately re-archive it
        ...(task.status === 'done' ? { status: 'in_progress', completedAt: null } : {}),
      },
    });
    return { success: true };
  }

  async hardDelete(id: string, user: any) {
    if (user.role !== 'admin') throw new ForbiddenException('Лише адміністратор може остаточно видалити задачу');
    const task = await this.prisma.task.findUnique({ where: { id } });
    if (!task) throw new NotFoundException('Задачу не знайдено');
    await this.prisma.task.delete({ where: { id } });
    return { success: true };
  }

  private mapTask(task: any) {
    return {
      id: task.id,
      title: task.title,
      description: task.description,
      status: task.status,
      priority: task.priority ?? 'medium',
      coAssigneeIds: Array.isArray(task.coAssigneeIds) ? task.coAssigneeIds : [],
      isPrivate: Boolean(task.isPrivate),
      parentId: task.parentId ?? null,
      subtasksCount: Array.isArray(task.subtasks) ? task.subtasks.length : undefined,
      subtasksDone: Array.isArray(task.subtasks) ? task.subtasks.filter((s: any) => s.status === 'done').length : undefined,
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
      startedAt: task.startedAt ?? null,
      completedAt: task.completedAt,
    };
  }

  private mapTaskFull(task: any) {
    return {
      ...this.mapTask(task),
      parent: task.parent ? { id: task.parent.id, title: task.parent.title } : null,
      subtasks: Array.isArray(task.subtasks) ? task.subtasks.map((s: any) => ({
        id: s.id,
        title: s.title,
        status: s.status,
        dueDate: s.dueDate,
        assignee: s.assignee ? { id: s.assignee.id, firstName: s.assignee.firstName, lastName: s.assignee.lastName } : null,
      })) : [],
      comments: task.comments?.map((c: any) => ({
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
    if (user.role === 'deputy_head') return false;
    if (user.role === 'director') {
      const scopedDepartmentIds = await this.resolveDepartmentScopeIds(user.departmentId);
      return scopedDepartmentIds.includes(departmentId);
    }
    if (user.role === 'deputy_director') {
      const scopedDepartmentIds = await this.resolveScopedDepartmentIdsForUser(user);
      return scopedDepartmentIds.includes(departmentId);
    }
    if (user.role === 'manager') {
      if (user.departmentId === departmentId) return true;
      const secondary = Array.isArray(user.secondaryDepartmentIds) ? user.secondaryDepartmentIds as string[] : [];
      return secondary.includes(departmentId);
    }
    if (user.role === 'specialist' || user.role === 'clerk') {
      return user.departmentId === departmentId;
    }
    return false;
  }

  private async canManageTask(task: any, user: any) {
    if (user.role === 'admin') return true;
    const coIds = Array.isArray(task.coAssigneeIds) ? task.coAssigneeIds as string[] : [];
    if (task.assigneeId === user.id || task.reporterId === user.id || coIds.includes(user.id)) return true;
    if (user.role === 'deputy_head') return false;
    if (this.shouldHideFromLeadership(task, user)) return false;
    if (user.role === 'director' || user.role === 'manager') {
      const scoped = await this.resolveScopedDepartmentIdsForUser(user);
      if (scoped.includes(task.departmentId)) return true;
    }
    if (user.role === 'deputy_director') {
      const scoped = await this.resolveScopedDepartmentIdsForUser(user);
      if (scoped.includes(task.departmentId)) return true;
    }
    if (user.role === 'clerk' && (task.reporterId === user.id || task.assigneeId === user.id)) return true;
    if (['specialist', 'lawyer', 'accountant', 'hr'].includes(user.role) && (task.reporterId === user.id || task.assigneeId === user.id)) return true;
    return false;
  }

  private async canMoveTaskStatus(task: any, user: any) {
    if (user.role === 'admin') return true;
    const coIds = Array.isArray(task.coAssigneeIds) ? task.coAssigneeIds as string[] : [];
    if (task.assigneeId === user.id || task.reporterId === user.id || coIds.includes(user.id)) return true;
    if (user.role === 'deputy_head') return false;
    if (this.shouldHideFromLeadership(task, user)) return false;
    if (user.role === 'director' || user.role === 'manager') {
      const scoped = await this.resolveScopedDepartmentIdsForUser(user);
      if (scoped.includes(task.departmentId)) return true;
    }
    if (user.role === 'deputy_director') {
      const scoped = await this.resolveScopedDepartmentIdsForUser(user);
      if (scoped.includes(task.departmentId)) return true;
    }
    return false;
  }

  private async canViewTask(task: any, user: any) {
    if (user.role === 'admin') return true;
    const coIds = Array.isArray(task.coAssigneeIds) ? task.coAssigneeIds as string[] : [];
    if (task.assigneeId === user.id || task.reporterId === user.id || coIds.includes(user.id)) return true;
    // спеціаліст може бачити батьківську задачу якщо він виконавець підзадачі
    if (task.id) {
      const hasSubtask = await this.prisma.task.findFirst({
        where: {
          parentId: task.id,
          OR: [{ assigneeId: user.id }, { reporterId: user.id }, { coAssigneeIds: { array_contains: user.id } }],
        },
        select: { id: true },
      });
      if (hasSubtask) return true;
    }
    if (this.shouldHideFromLeadership(task, user)) return false;
    if (user.role === 'director' || user.role === 'manager' || user.role === 'deputy_head') {
      const scoped = await this.resolveScopedDepartmentIdsForUser(user);
      if (scoped.includes(task.departmentId)) return true;
    }
    if (user.role === 'deputy_director') {
      const scoped = await this.resolveScopedDepartmentIdsForUser(user);
      if (scoped.includes(task.departmentId)) return true;
    }
    return false;
  }

  private buildLeadershipExcludeFilter() {
    return { isPrivate: true };
  }

  private shouldHideFromLeadership(task: any, user: any) {
    if (!(['director', 'deputy_director', 'manager', 'deputy_head'].includes(user.role))) return false;
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
      };
      current.total += 1;
      if (task.status === 'todo') current.todo += 1;
      if (task.status === 'in_progress') current.inProgress += 1;
      if (task.status === 'done') current.done += 1;
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
    if (user.role === 'manager') {
      const secondary = Array.isArray(user.secondaryDepartmentIds) ? (user.secondaryDepartmentIds as string[]).filter(Boolean) : [];
      return [user.departmentId, ...secondary];
    }
    if (user.role === 'director') {
      return this.resolveDepartmentScopeIds(user.departmentId);
    }
    if (user.role === 'deputy_director') {
      const configured = this.getScopedDepartmentIdsFromUserPayload(user);
      if (configured.length > 0) {
        const expanded = new Set<string>();
        expanded.add(user.departmentId);
        const own = await this.prisma.department.findUnique({
          where: { id: user.departmentId },
          select: { children: { select: { id: true } } },
        });
        for (const child of own?.children || []) expanded.add(child.id);
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
    if (user.role === 'deputy_head') {
      const configured = this.getScopedDepartmentIdsFromUserPayload(user);
      if (configured.length > 0) {
        const expanded = new Set<string>();
        expanded.add(user.departmentId);
        const own = await this.prisma.department.findUnique({
          where: { id: user.departmentId },
          select: { children: { select: { id: true } } },
        });
        for (const child of own?.children || []) expanded.add(child.id);
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

  private assertTaskAssignmentAllowed(actor: any, assigneeRole: string, assigneeId?: string) {
    if (actor?.role === 'admin') return;
    // anyone can assign to themselves
    if (assigneeId && assigneeId === actor?.id) return;
    if (actor?.role === 'director') {
      if (['deputy_director', 'manager', 'specialist', 'clerk', 'lawyer', 'accountant', 'hr'].includes(assigneeRole)) return;
      throw new ForbiddenException('Директор може призначати задачі лише співробітникам операційних ролей');
    }
    if (actor?.role === 'deputy_director') {
      if (['manager', 'specialist', 'clerk', 'lawyer', 'accountant', 'hr'].includes(assigneeRole)) return;
      throw new ForbiddenException('Заступник директора може призначати задачі керівнику та співробітникам відділу');
    }
    if (actor?.role === 'manager') {
      if (['specialist', 'clerk', 'lawyer', 'accountant', 'hr'].includes(assigneeRole)) return;
      throw new ForbiddenException('Керівник може призначати задачі лише співробітникам свого відділу');
    }
    if (actor?.role === 'deputy_head') {
      if (['deputy_director', 'manager', 'specialist', 'clerk', 'lawyer', 'accountant', 'hr'].includes(assigneeRole)) return;
      throw new ForbiddenException('Відсутнє право визначити цього користувача виконавцем задачі');
    }
    // all other roles can assign subtasks to anyone
    return;
  }
}
