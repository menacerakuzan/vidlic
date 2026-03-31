import { Injectable, NotFoundException, ConflictException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../shared/prisma.service';
import { CreateUserDto, UpdateUserDto, UserQueryDto, UpdateUserPasswordDto } from './dto/users.dto';
import { AuditService } from '../audit/audit.service';
import { AuditAction, UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';

@Injectable()
export class UsersService {
  constructor(
    private prisma: PrismaService,
    private auditService: AuditService,
  ) {}

  async findAll(query: UserQueryDto) {
    const { page = 1, limit = 20, departmentId, role, search } = query;
    const skip = (page - 1) * limit;

    const where: any = {};
    
    if (departmentId) {
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

  async findById(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: { department: true, position: true },
    });

    if (!user) {
      throw new NotFoundException('Користувача не знайдено');
    }

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

    await this.prisma.user.delete({ where: { id } });

    await this.auditService.log({
      userId: actor.id,
      action: AuditAction.delete,
      entityType: 'user',
      entityId: id,
      oldValue: { email: user.email, role: user.role },
      ipAddress,
    });

    return { success: true };
  }

  async updatePassword(id: string, dto: UpdateUserPasswordDto, actor: any, ipAddress?: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) {
      throw new NotFoundException('Користувача не знайдено');
    }

    if (actor?.role !== 'admin') {
      throw new ForbiddenException('Лише адміністратор може змінювати пароль користувача');
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

    if (role && (role === 'admin' || role === 'director' || role === 'deputy_head')) {
      throw new ForbiddenException('Директор не може призначати адміністратора, директора або заступника голови');
    }
  }
}
