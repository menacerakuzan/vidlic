import { Injectable, NotFoundException, ConflictException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../shared/prisma.service';
import { CreateUserDto, UpdateUserDto, UserQueryDto, UpdateUserPasswordDto, UpdateOwnProfileDto } from './dto/users.dto';
import { AuditService } from '../audit/audit.service';
import { AuditAction, UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';

@Injectable()
export class UsersService {
  constructor(
    private prisma: PrismaService,
    private auditService: AuditService,
  ) {}

  async findAll(query: UserQueryDto, actor: any) {
    const { page = 1, limit = 20, departmentId, role, search } = query;
    const skip = (page - 1) * limit;

    const where: any = {};
    const scopedDepartmentIds = await this.resolveScopedDepartmentIdsForActor(actor);

    if (scopedDepartmentIds) {
      where.departmentId = { in: scopedDepartmentIds };
    }
    
    if (departmentId) {
      if (scopedDepartmentIds && !scopedDepartmentIds.includes(departmentId)) {
        throw new ForbiddenException('Немає доступу до користувачів цього підрозділу');
      }
      where.departmentId = departmentId;
    }
    
    if (role) {
      where.role = role;
    }
    
    if (search) {
      where.OR = [
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { employeeId: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip,
        take: limit,
        include: {
          department: true,
          position: true,
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      data: users.map(this.mapUser),
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async findAllAssignees(actor: any) {
    const users = await this.prisma.user.findMany({
      where: { isActive: true },
      select: { id: true, firstName: true, lastName: true, role: true, departmentId: true, department: { select: { id: true, name: true, nameUk: true } } },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    });
    return users;
  }

  async findById(id: string, actor: any) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: { department: true, position: true },
    });

    if (!user) {
      throw new NotFoundException('Користувача не знайдено');
    }

    await this.assertCanAccessUser(actor, user);
    return this.mapUser(user);
  }

  async create(dto: CreateUserDto, actor: any, ipAddress?: string) {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (existing) {
      throw new ConflictException('Email вже використовується');
    }

    if (actor.role === 'director' || actor.role === 'deputy_director') {
      await this.assertDirectorScope(actor, dto.departmentId, dto.role);
    }

    if (!['deputy_director', 'deputy_head'].includes(dto.role) && dto.scopeDepartmentIds && dto.scopeDepartmentIds.length > 0) {
      throw new ForbiddenException('scopeDepartmentIds можна задавати лише для заступника директора або заступника голови');
    }
    if (['deputy_director', 'deputy_head'].includes(dto.role)) {
      const validatedScope = await this.validateScopeDepartmentIds(actor, dto.scopeDepartmentIds || [], dto.departmentId);
      dto.scopeDepartmentIds = validatedScope;
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        employeeId: dto.employeeId,
        firstName: dto.firstName,
        lastName: dto.lastName,
        patronymic: dto.patronymic,
        passwordHash,
        role: dto.role,
        departmentId: dto.departmentId,
        positionId: dto.positionId,
        scopeDepartmentIds: Array.isArray(dto.scopeDepartmentIds) ? dto.scopeDepartmentIds : undefined,
        secondaryDepartmentIds: Array.isArray(dto.secondaryDepartmentIds) ? dto.secondaryDepartmentIds : [],
      },
      include: { department: true, position: true },
    });

    await this.auditService.log({
      userId: actor.id,
      action: AuditAction.create,
      entityType: 'user',
      entityId: user.id,
      newValue: { email: user.email, role: user.role },
      ipAddress,
    });

    return this.mapUser(user);
  }

  async update(id: string, dto: UpdateUserDto, actor: any, ipAddress?: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });

    if (!user) {
      throw new NotFoundException('Користувача не знайдено');
    }

    if (actor.role === 'director' || actor.role === 'deputy_director') {
      await this.assertDirectorScope(actor, dto.departmentId ?? user.departmentId, dto.role ?? user.role);
      if (user.role === 'director' || user.role === 'admin') {
        throw new ForbiddenException('Директор не може змінювати директора або адміністратора');
      }
    }

    if (!['deputy_director', 'deputy_head'].includes(dto.role ?? user.role) && dto.scopeDepartmentIds !== undefined) {
      throw new ForbiddenException('scopeDepartmentIds можна змінювати лише для заступника директора або заступника голови');
    }
    if (['deputy_director', 'deputy_head'].includes(dto.role ?? user.role) && dto.scopeDepartmentIds !== undefined) {
      dto.scopeDepartmentIds = await this.validateScopeDepartmentIds(
        actor,
        dto.scopeDepartmentIds || [],
        dto.departmentId ?? user.departmentId,
      );
    }

    const oldValue = { 
      firstName: user.firstName, 
      lastName: user.lastName, 
      role: user.role,
      departmentId: user.departmentId 
    };

    const updated = await this.prisma.user.update({
      where: { id },
      data: {
        firstName: dto.firstName ?? user.firstName,
        lastName: dto.lastName ?? user.lastName,
        patronymic: dto.patronymic ?? user.patronymic,
        role: dto.role ?? user.role,
        departmentId: dto.departmentId ?? user.departmentId,
        positionId: dto.positionId ?? user.positionId,
        scopeDepartmentIds: Array.isArray(dto.scopeDepartmentIds) ? dto.scopeDepartmentIds : user.scopeDepartmentIds,
        secondaryDepartmentIds: Array.isArray(dto.secondaryDepartmentIds) ? dto.secondaryDepartmentIds : user.secondaryDepartmentIds,
        isActive: dto.isActive ?? user.isActive,
      },
      include: { department: true, position: true },
    });

    await this.auditService.log({
      userId: actor.id,
      action: AuditAction.update,
      entityType: 'user',
      entityId: id,
      oldValue,
      newValue: dto,
      ipAddress,
    });

    return this.mapUser(updated);
  }

  async delete(id: string, actor: any, ipAddress?: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });

    if (!user) {
      throw new NotFoundException('Користувача не знайдено');
    }

    if (actor.role === 'director' || actor.role === 'deputy_director') {
      await this.assertDirectorScope(actor, user.departmentId, user.role);
      if (user.role === 'director' || user.role === 'admin') {
        throw new ForbiddenException('Директор не може видаляти директора або адміністратора');
      }
    }
    if (actor.id === user.id) {
      throw new ForbiddenException('Неможливо видалити власний обліковий запис');
    }

    const stamp = Date.now();
    await this.prisma.$transaction([
      this.prisma.department.updateMany({ where: { managerId: id }, data: { managerId: null } }),
      this.prisma.department.updateMany({ where: { clerkId: id }, data: { clerkId: null } }),
      this.prisma.department.updateMany({ where: { directorId: id }, data: { directorId: null } }),
      this.prisma.task.updateMany({ where: { assigneeId: id }, data: { assigneeId: null } }),
      this.prisma.user.update({
        where: { id },
        data: {
          isActive: false,
          email: `${user.email}.deleted.${stamp}`,
          employeeId: `${user.employeeId}-DEL-${String(stamp).slice(-6)}`,
          departmentId: null,
          positionId: null,
          scopeDepartmentIds: [],
          secondaryDepartmentIds: [],
        },
      }),
      this.prisma.session.deleteMany({ where: { userId: id } }),
    ]);

    await this.auditService.log({
      userId: actor.id,
      action: AuditAction.delete,
      entityType: 'user',
      entityId: id,
      oldValue: { email: user.email, role: user.role },
      ipAddress,
    });

    return { success: true, mode: 'deactivated' };
  }

  async updatePassword(id: string, dto: UpdateUserPasswordDto, actor: any, ipAddress?: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) {
      throw new NotFoundException('Користувача не знайдено');
    }

    // own password change is always allowed; changing someone else's requires admin
    if (actor?.id !== id && actor?.role !== 'admin') {
      throw new ForbiddenException('Лише адміністратор може змінювати пароль іншого користувача');
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);
    await this.prisma.user.update({
      where: { id },
      data: { passwordHash },
    });

    await this.auditService.log({
      userId: actor.id,
      action: AuditAction.update,
      entityType: 'user',
      entityId: id,
      oldValue: { email: user.email },
      newValue: { passwordChanged: true },
      ipAddress,
    });

    return { success: true };
  }

  async updateOwnProfile(id: string, dto: UpdateOwnProfileDto) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('Користувача не знайдено');

    if (dto.avatarBase64 !== undefined) {
      if (dto.avatarBase64 !== null && dto.avatarBase64.length > 5 * 1024 * 1024) {
        throw new BadRequestException('Зображення перевищує 5MB');
      }
    }

    const updated = await this.prisma.user.update({
      where: { id },
      data: { avatarBase64: dto.avatarBase64 },
      include: { department: true, position: true },
    });
    return this.mapUser(updated);
  }

  async findByDepartment(departmentId: string) {
    const users = await this.prisma.user.findMany({
      where: { departmentId, isActive: true },
      include: { position: true },
      orderBy: { lastName: 'asc' },
    });

    return users.map(this.mapUser);
  }

  private mapUser(user: any) {
    return {
      id: user.id,
      email: user.email,
      employeeId: user.employeeId,
      firstName: user.firstName,
      lastName: user.lastName,
      patronymic: user.patronymic,
      avatarBase64: user.avatarBase64 ?? null,
      role: user.role,
      isActive: user.isActive,
      department: user.department ? {
        id: user.department.id,
        name: user.department.name,
        nameUk: user.department.nameUk,
        code: user.department.code,
      } : null,
      position: user.position ? {
        id: user.position.id,
        title: user.position.title,
        titleUk: user.position.titleUk,
      } : null,
      scopeDepartmentIds: Array.isArray(user.scopeDepartmentIds) ? user.scopeDepartmentIds : [],
      secondaryDepartmentIds: Array.isArray(user.secondaryDepartmentIds) ? user.secondaryDepartmentIds : [],
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }

  private async assertDirectorScope(actor: any, departmentId?: string | null, role?: UserRole) {
    if (!departmentId) {
      throw new ForbiddenException('Не визначено цільовий підрозділ');
    }

    const targetDepartment = await this.prisma.department.findUnique({
      where: { id: departmentId },
      select: { id: true, parentId: true },
    });
    if (!targetDepartment) {
      throw new ForbiddenException('Цільовий підрозділ не знайдено');
    }

    let allowedDepartmentIds: string[] = [];
    if (actor.role === 'deputy_director') {
      const configured = Array.isArray(actor.scopeDepartmentIds) ? actor.scopeDepartmentIds.filter(Boolean) : [];
      if (configured.length) {
        allowedDepartmentIds = configured;
      } else if (actor.departmentId) {
        allowedDepartmentIds = [actor.departmentId];
      }
    } else {
      if (!actor?.departmentId) {
        throw new ForbiddenException('Директор може працювати тільки зі своїм підрозділом');
      }
      allowedDepartmentIds = [actor.departmentId];
    }

    const isOwnDepartment = allowedDepartmentIds.includes(targetDepartment.id);
    const isOwnChildDepartment = targetDepartment.parentId ? allowedDepartmentIds.includes(targetDepartment.parentId) : false;
    if (!isOwnDepartment && !isOwnChildDepartment) {
      throw new ForbiddenException('Доступ дозволено лише до курованих підрозділів');
    }

    if (role && (role === 'admin' || role === 'director')) {
      throw new ForbiddenException('Директор не може призначати адміністратора або директора');
    }
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

  private async resolveScopedDepartmentIdsForActor(actor: any): Promise<string[] | null> {
    if (!actor || actor.role === 'admin') return null;
    if (!actor.departmentId) return [];
    if (actor.role === 'director') return this.resolveDepartmentScopeIds(actor.departmentId);
    if (actor.role === 'deputy_director') {
      const configured = Array.isArray(actor.scopeDepartmentIds) ? actor.scopeDepartmentIds.filter(Boolean) : [];
      if (configured.length > 0) return configured;
      return this.resolveDepartmentScopeIds(actor.departmentId);
    }
    if (actor.role === 'deputy_head') {
      const configured = Array.isArray(actor.scopeDepartmentIds) ? actor.scopeDepartmentIds.filter(Boolean) : [];
      if (configured.length > 0) return configured;
      return this.resolveDepartmentScopeIds(actor.departmentId);
    }
    return [actor.departmentId];
  }

  private async assertCanAccessUser(actor: any, targetUser: any) {
    if (!actor || actor.role === 'admin') return;
    if (targetUser.id === actor.id) return;
    const scopedDepartmentIds = await this.resolveScopedDepartmentIdsForActor(actor);
    if (!scopedDepartmentIds || scopedDepartmentIds.includes(targetUser.departmentId)) return;
    throw new ForbiddenException('Немає доступу до цього користувача');
  }

  private async validateScopeDepartmentIds(actor: any, scopeDepartmentIds: string[], defaultDepartmentId?: string | null) {
    const normalized = Array.from(new Set((scopeDepartmentIds || []).filter(Boolean)));
    if (actor?.role === 'admin') return normalized;
    if (!['director', 'deputy_director'].includes(actor?.role)) {
      throw new ForbiddenException('Недостатньо прав для встановлення scopeDepartmentIds');
    }

    const actorScope = await this.resolveDepartmentScopeIds(actor.departmentId);
    const fallback = defaultDepartmentId ? [defaultDepartmentId] : [];
    const candidate = normalized.length > 0 ? normalized : fallback;
    const invalid = candidate.filter((id) => !actorScope.includes(id));
    if (invalid.length > 0) {
      throw new ForbiddenException('Можна задавати scopeDepartmentIds лише в межах вашого департаменту');
    }
    return candidate;
  }
}
