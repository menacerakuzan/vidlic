import { Injectable, NotFoundException, ConflictException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../../shared/prisma.service';
import { CreateDepartmentDto, UpdateDepartmentDto } from './dto/departments.dto';
import { AuditService } from '../../audit/audit.service';
import { AuditAction } from '@prisma/client';

@Injectable()
export class DepartmentsService {
  constructor(
    private prisma: PrismaService,
    private auditService: AuditService,
  ) {}

  async findAll(actor?: any) {
    const visibleDepartmentIds = await this.resolveVisibleDepartmentIds(actor);
    const where = visibleDepartmentIds ? { id: { in: visibleDepartmentIds } } : {};

    const departments = await this.prisma.department.findMany({
      where,
      include: {
        parent: true,
        children: {
          select: {
            id: true,
            _count: { select: { users: true } },
          },
        },
        manager: {
          select: { id: true, firstName: true, lastName: true, email: true }
        },
        clerk: {
          select: { id: true, firstName: true, lastName: true, email: true }
        },
        director: {
          select: { id: true, firstName: true, lastName: true, email: true }
        },
        _count: { select: { users: true } }
      },
      orderBy: { name: 'asc' },
    });

    return departments.map(d => ({
      id: d.id,
      name: d.name,
      nameUk: d.nameUk,
      code: d.code,
      parentId: d.parentId,
      parent: d.parent ? { id: d.parent.id, name: d.parent.name } : null,
      manager: d.manager,
      clerk: d.clerk,
      director: d.director,
      childrenCount: d.children.length,
      usersCount: d._count.users + d.children.reduce((sum, child) => sum + child._count.users, 0),
      createdAt: d.createdAt,
    }));
  }

  async findById(id: string, actor?: any) {
    await this.assertDepartmentAccess(id, actor);
    const department = await this.prisma.department.findUnique({
      where: { id },
      include: {
        parent: true,
        children: true,
        manager: true,
        clerk: true,
        director: true,
        users: {
          include: { position: true },
          orderBy: { lastName: 'asc' }
        },
      },
    });

    if (!department) {
      throw new NotFoundException('Підрозділ не знайдено');
    }

    return {
      id: department.id,
      name: department.name,
      nameUk: department.nameUk,
      code: department.code,
      parentId: department.parentId,
      parent: department.parent ? { id: department.parent.id, name: department.parent.name } : null,
      children: department.children.map(c => ({ id: c.id, name: c.name, nameUk: c.nameUk })),
      manager: department.manager ? {
        id: department.manager.id,
        firstName: department.manager.firstName,
        lastName: department.manager.lastName,
        email: department.manager.email,
      } : null,
      clerk: department.clerk ? {
        id: department.clerk.id,
        firstName: department.clerk.firstName,
        lastName: department.clerk.lastName,
        email: department.clerk.email,
      } : null,
      director: department.director ? {
        id: department.director.id,
        firstName: department.director.firstName,
        lastName: department.director.lastName,
        email: department.director.email,
      } : null,
      users: department.users.map(u => ({
        id: u.id,
        firstName: u.firstName,
        lastName: u.lastName,
        email: u.email,
        position: u.position ? { title: u.position.title, titleUk: u.position.titleUk } : null,
      })),
      createdAt: department.createdAt,
    };
  }

  async create(dto: CreateDepartmentDto, actor: any, ipAddress?: string) {
    const isAdmin = actor?.role === 'admin';
    const isDirector = actor?.role === 'director';
    if (!isAdmin && !isDirector) {
      throw new ForbiddenException('Недостатньо прав для створення підрозділу');
    }

    if (isDirector) {
      if (!actor.departmentId) {
        throw new ForbiddenException('Для директора не визначено базовий підрозділ');
      }
      if (dto.parentId !== actor.departmentId) {
        throw new ForbiddenException('Директор може створювати відділи лише у своєму департаменті');
      }
      if (dto.directorId && dto.directorId !== actor.id) {
        throw new ForbiddenException('Директор не може призначити іншого директора для свого відділу');
      }
    }

    const existing = await this.prisma.department.findUnique({
      where: { code: dto.code },
    });

    if (existing) {
      throw new ConflictException('Підрозділ з таким кодом вже існує');
    }

    const department = await this.prisma.department.create({
      data: {
        name: dto.name,
        nameUk: dto.nameUk,
        code: dto.code,
        parentId: dto.parentId,
        managerId: dto.managerId,
        clerkId: dto.clerkId,
        directorId: isDirector ? actor.id : dto.directorId,
      },
    });

    await this.auditService.log({
      userId: actor.id,
      action: AuditAction.create,
      entityType: 'department',
      entityId: department.id,
      newValue: { name: department.name, code: department.code },
      ipAddress,
    });

    return department;
  }

  async update(id: string, dto: UpdateDepartmentDto, actor: any, ipAddress?: string) {
    const department = await this.prisma.department.findUnique({ where: { id } });

    if (!department) {
      throw new NotFoundException('Підрозділ не знайдено');
    }

    const isAdmin = actor?.role === 'admin';
    const isDirector = actor?.role === 'director';
    if (!isAdmin && !isDirector) {
      throw new ForbiddenException('Недостатньо прав для оновлення підрозділу');
    }
    if (isDirector) {
      const canManageOwnDepartment = department.id === actor.departmentId;
      const canManageOwnChild = department.parentId === actor.departmentId;
      if (!canManageOwnDepartment && !canManageOwnChild) {
        throw new ForbiddenException('Директор може змінювати тільки свій департамент або його відділи');
      }
      if (dto.directorId && dto.directorId !== actor.id) {
        throw new ForbiddenException('Директор не може призначати іншого директора');
      }
    }

    if (dto.code && dto.code !== department.code) {
      const existing = await this.prisma.department.findUnique({ where: { code: dto.code } });
      if (existing) {
        throw new ConflictException('Код підрозділу вже використовується');
      }
    }

    const updated = await this.prisma.department.update({
      where: { id },
      data: {
        name: dto.name ?? department.name,
        nameUk: dto.nameUk ?? department.nameUk,
        code: dto.code ?? department.code,
        parentId: dto.parentId !== undefined ? dto.parentId : department.parentId,
        managerId: dto.managerId !== undefined ? dto.managerId : department.managerId,
        clerkId: dto.clerkId !== undefined ? dto.clerkId : department.clerkId,
        directorId: dto.directorId !== undefined ? dto.directorId : department.directorId,
      },
    });

    await this.auditService.log({
      userId: actor.id,
      action: AuditAction.update,
      entityType: 'department',
      entityId: id,
      oldValue: { name: department.name },
      newValue: dto,
      ipAddress,
    });

    return updated;
  }

  async delete(id: string, adminId: string, ipAddress?: string) {
    const department = await this.prisma.department.findUnique({ 
      where: { id },
      include: { users: true }
    });

    if (!department) {
      throw new NotFoundException('Підрозділ не знайдено');
    }

    if (department.users.length > 0) {
      throw new ConflictException('Неможливо видалити підрозділ з користувачами');
    }

    await this.prisma.department.delete({ where: { id } });

    await this.auditService.log({
      userId: adminId,
      action: AuditAction.delete,
      entityType: 'department',
      entityId: id,
      oldValue: { name: department.name, code: department.code },
      ipAddress,
    });

    return { success: true };
  }

  async getTeam(departmentId: string, actor?: any) {
    await this.assertDepartmentAccess(departmentId, actor);
    const department = await this.prisma.department.findUnique({
      where: { id: departmentId },
      select: {
        id: true,
        children: { select: { id: true } },
      },
    });
    if (!department) {
      throw new NotFoundException('Підрозділ не знайдено');
    }

    // For a parent department, include team members from its child departments (sections),
    // so transferred users remain visible in the department context.
    const departmentIds = [department.id, ...department.children.map((child) => child.id)];

    const users = await this.prisma.user.findMany({
      where: { departmentId: { in: departmentIds }, isActive: true },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        patronymic: true,
        email: true,
        role: true,
        department: { select: { id: true, nameUk: true, code: true } },
        position: { select: { titleUk: true } },
      },
      orderBy: [{ departmentId: 'asc' }, { role: 'asc' }, { lastName: 'asc' }],
    });

    return users;
  }

  async getReportTemplate(departmentId: string, actor?: any) {
    await this.assertDepartmentAccess(departmentId, actor);
    const department = await this.prisma.department.findUnique({ where: { id: departmentId } });
    if (!department) throw new NotFoundException('Підрозділ не знайдено');

    const template = await this.prisma.departmentReportTemplate.findUnique({
      where: { departmentId },
    });

    if (!template) {
      return {
        departmentId,
        titlePattern: 'ЗВІТ',
        headerPattern: 'Про виконання роботи {{departmentName}}\n{{period}}',
        sectionSchema: [
          { key: 'workDone', title: 'Виконана робота', required: true },
          { key: 'achievements', title: 'Досягнення', required: false },
          { key: 'problems', title: 'Проблемні питання', required: false },
          { key: 'nextWeekPlan', title: 'План наступного періоду', required: true },
        ],
        aiPrompt: '',
      };
    }

    return template;
  }

  async upsertReportTemplate(departmentId: string, dto: any, actor: any) {
    await this.assertDepartmentAccess(departmentId, actor);
    const department = await this.prisma.department.findUnique({ where: { id: departmentId } });
    if (!department) throw new NotFoundException('Підрозділ не знайдено');
    if (actor.role === 'specialist') {
      throw new ForbiddenException('Недостатньо прав для редагування шаблону');
    }
    if ((actor.role === 'manager' || actor.role === 'director') && actor.departmentId !== departmentId) {
      throw new ForbiddenException('Можна редагувати шаблон лише свого підрозділу');
    }

    const template = await this.prisma.departmentReportTemplate.upsert({
      where: { departmentId },
      create: {
        departmentId,
        titlePattern: dto.titlePattern,
        headerPattern: dto.headerPattern,
        sectionSchema: dto.sectionSchema ?? [],
        aiPrompt: dto.aiPrompt,
        updatedById: actor.id,
      },
      update: {
        titlePattern: dto.titlePattern,
        headerPattern: dto.headerPattern,
        sectionSchema: dto.sectionSchema ?? [],
        aiPrompt: dto.aiPrompt,
        updatedById: actor.id,
      },
    });

    return template;
  }

  private async resolveVisibleDepartmentIds(actor?: any): Promise<string[] | null> {
    if (!actor || actor.role === 'admin') return null;
    if (!actor.departmentId) return [];

    const current = await this.prisma.department.findUnique({
      where: { id: actor.departmentId },
      select: { id: true, parentId: true },
    });
    if (!current) return [];

    // Any non-admin user sees only own root department and its child sections.
    const rootId = current.parentId || current.id;
    const root = await this.prisma.department.findUnique({
      where: { id: rootId },
      select: { id: true, children: { select: { id: true } } },
    });
    if (!root) return [actor.departmentId];
    return [root.id, ...(root.children || []).map((child) => child.id)];
  }

  private async assertDepartmentAccess(departmentId: string, actor?: any): Promise<void> {
    const visibleDepartmentIds = await this.resolveVisibleDepartmentIds(actor);
    if (!visibleDepartmentIds) return;
    if (!visibleDepartmentIds.includes(departmentId)) {
      throw new ForbiddenException('Немає доступу до цього підрозділу');
    }
  }
}
