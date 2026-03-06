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

    const where: any = {};

    if (user.role === 'specialist') {
      where.OR = [
        { assigneeId: user.id },
        { reporterId: user.id },
      ];
    } else if (user.role === 'manager') {
      where.departmentId = user.departmentId;
    }

    if (status) where.status = status;
    if (priority) where.priority = priority;
    if (departmentId && user.role !== 'specialist') where.departmentId = departmentId;
    if (assigneeId) where.assigneeId = assigneeId;
    if (reporterId) where.reporterId = reporterId;
    
    if (dueDateFrom && dueDateTo) {
      where.dueDate = {
        gte: new Date(dueDateFrom),
        lte: new Date(dueDateTo),
      };
    }

    const [tasks, total] = await Promise.all([
      this.prisma.task.findMany({
        where,
        skip,
        take: limit,
        include: {
          assignee: { select: { id: true, firstName: true, lastName: true, email: true } },
          reporter: { select: { id: true, firstName: true, lastName: true } },
          department: { select: { id: true, name: true, nameUk: true } },
          report: { select: { id: true, title: true, reportType: true } },
        },
        orderBy: [
          { priority: 'desc' },
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
    const where: any = {};

    if (user.role === 'specialist') {
      where.OR = [
        { assigneeId: user.id },
        { reporterId: user.id },
      ];
    } else if (user.role === 'manager') {
      where.departmentId = user.departmentId;
    } else if (departmentId) {
      where.departmentId = departmentId;
    }

    const tasks = await this.prisma.task.findMany({
      where,
      include: {
        assignee: { select: { id: true, firstName: true, lastName: true } },
        reporter: { select: { id: true, firstName: true, lastName: true } },
        department: { select: { id: true, nameUk: true } },
      },
      orderBy: [
        { priority: 'desc' },
        { dueDate: 'asc' },
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
        comments: {
          include: { user: { select: { id: true, firstName: true, lastName: true } } },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!task) {
      throw new NotFoundException('Задачу не знайдено');
    }

    if (!this.canViewTask(task, user)) {
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

    if (!this.canCreateTaskInDepartment(user, targetDepartmentId)) {
      throw new ForbiddenException('Немає доступу до створення задачі в цьому підрозділі');
    }

    if (dto.assigneeId) {
      const assignee = await this.prisma.user.findUnique({ where: { id: dto.assigneeId } });
      if (!assignee || assignee.departmentId !== targetDepartmentId) {
        throw new BadRequestException('Виконавець має бути з того ж підрозділу');
      }
    }

    const task = await this.prisma.task.create({
      data: {
        title: dto.title,
        description: dto.description,
        priority: dto.priority || 'medium',
        status: 'todo',
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
    const task = await this.prisma.task.findUnique({ where: { id } });

    if (!task) {
      throw new NotFoundException('Задачу не знайдено');
    }

    if (!this.canManageTask(task, user)) {
      throw new ForbiddenException('Немає доступу до редагування задачі');
    }

    if (dto.assigneeId) {
      const assignee = await this.prisma.user.findUnique({ where: { id: dto.assigneeId } });
      if (!assignee || assignee.departmentId !== (dto.departmentId ?? task.departmentId)) {
        throw new BadRequestException('Виконавець має бути з того ж підрозділу');
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
    const task = await this.prisma.task.findUnique({ where: { id } });

    if (!task) {
      throw new NotFoundException('Задачу не знайдено');
    }

    if (!this.canMoveTaskStatus(task, user)) {
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
    const task = await this.prisma.task.findUnique({ where: { id } });

    if (!task) {
      throw new NotFoundException('Задачу не знайдено');
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

    if (!this.canManageTask(task, user)) {
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

  private canCreateTaskInDepartment(user: any, departmentId: string) {
    if (user.role === 'admin') return true;
    if (user.role === 'director' || user.role === 'manager' || user.role === 'specialist') {
      return user.departmentId === departmentId;
    }
    return false;
  }

  private canManageTask(task: any, user: any) {
    if (user.role === 'admin') return true;
    if ((user.role === 'director' || user.role === 'manager') && task.departmentId === user.departmentId) return true;
    if (user.role === 'specialist' && task.reporterId === user.id) return true;
    return false;
  }

  private canMoveTaskStatus(task: any, user: any) {
    if (user.role === 'admin') return true;
    if ((user.role === 'director' || user.role === 'manager') && task.departmentId === user.departmentId) return true;
    if (user.role === 'specialist' && (task.assigneeId === user.id || task.reporterId === user.id)) return true;
    return false;
  }

  private canViewTask(task: any, user: any) {
    if (user.role === 'admin') return true;
    if ((user.role === 'director' || user.role === 'manager') && task.departmentId === user.departmentId) return true;
    if (user.role === 'specialist' && (task.assigneeId === user.id || task.reporterId === user.id)) return true;
    return false;
  }
}
