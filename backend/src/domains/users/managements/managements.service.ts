import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../../shared/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { AuditAction } from '@prisma/client';

@Injectable()
export class ManagementsService {
  constructor(
    private prisma: PrismaService,
    private auditService: AuditService,
  ) {}

  async findAll(departmentId: string, _actor?: any) {
    const managements = await (this.prisma as any).management.findMany({
      where: { departmentId },
      include: {
        head: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        sections: {
          select: { id: true, name: true, nameUk: true, code: true },
        },
      },
      orderBy: { name: 'asc' },
    });

    return managements;
  }

  async findOne(id: string) {
    const management = await (this.prisma as any).management.findUnique({
      where: { id },
      include: {
        department: { select: { id: true, name: true, nameUk: true } },
        head: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        sections: {
          select: { id: true, name: true, nameUk: true, code: true },
        },
      },
    });

    if (!management) {
      throw new NotFoundException('Управління не знайдено');
    }

    return management;
  }

  async create(
    dto: { name: string; nameUk: string; departmentId: string; headId?: string },
    actor: any,
    ipAddress?: string,
  ) {
    const isAdmin = actor?.role === 'admin';
    const isDirector =
      actor?.role === 'director' || actor?.role === 'deputy_director';

    if (!isAdmin && !isDirector) {
      throw new ForbiddenException('Недостатньо прав для створення управління');
    }

    const management = await (this.prisma as any).management.create({
      data: {
        name: dto.name,
        nameUk: dto.nameUk,
        departmentId: dto.departmentId,
        headId: dto.headId ?? null,
      },
    });

    await this.auditService.log({
      userId: actor.id,
      action: AuditAction.create,
      entityType: 'management',
      entityId: management.id,
      newValue: { name: management.name, departmentId: management.departmentId },
      ipAddress,
    });

    return management;
  }

  async update(
    id: string,
    dto: { name?: string; nameUk?: string; headId?: string | null },
    actor: any,
    ipAddress?: string,
  ) {
    const isAdmin = actor?.role === 'admin';
    const isDirector =
      actor?.role === 'director' || actor?.role === 'deputy_director';

    if (!isAdmin && !isDirector) {
      throw new ForbiddenException('Недостатньо прав для оновлення управління');
    }

    const existing = await (this.prisma as any).management.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new NotFoundException('Управління не знайдено');
    }

    const updated = await (this.prisma as any).management.update({
      where: { id },
      data: {
        name: dto.name ?? existing.name,
        nameUk: dto.nameUk ?? existing.nameUk,
        headId: dto.headId !== undefined ? dto.headId : existing.headId,
      },
    });

    await this.auditService.log({
      userId: actor.id,
      action: AuditAction.update,
      entityType: 'management',
      entityId: id,
      oldValue: { name: existing.name },
      newValue: dto,
      ipAddress,
    });

    return updated;
  }

  async delete(id: string, actor: any, ipAddress?: string) {
    if (actor?.role !== 'admin') {
      throw new ForbiddenException('Тільки адміністратор може видаляти управління');
    }

    const existing = await (this.prisma as any).management.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new NotFoundException('Управління не знайдено');
    }

    // Detach all sections from this management before deletion
    await this.prisma.department.updateMany({
      where: { managementId: id } as any,
      data: { managementId: null } as any,
    });

    await (this.prisma as any).management.delete({ where: { id } });

    await this.auditService.log({
      userId: actor.id,
      action: AuditAction.delete,
      entityType: 'management',
      entityId: id,
      oldValue: { name: existing.name },
      ipAddress,
    });

    return { success: true };
  }

  async assignSections(
    id: string,
    sectionIds: string[],
    actor: any,
    ipAddress?: string,
  ) {
    const isAdmin = actor?.role === 'admin';
    const isDirector =
      actor?.role === 'director' || actor?.role === 'deputy_director';

    if (!isAdmin && !isDirector) {
      throw new ForbiddenException('Недостатньо прав для призначення відділів');
    }

    const existing = await (this.prisma as any).management.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new NotFoundException('Управління не знайдено');
    }

    await this.prisma.department.updateMany({
      where: { id: { in: sectionIds } } as any,
      data: { managementId: id } as any,
    });

    await this.auditService.log({
      userId: actor.id,
      action: AuditAction.update,
      entityType: 'management',
      entityId: id,
      newValue: { assignedSections: sectionIds },
      ipAddress,
    });

    return this.findOne(id);
  }

  async removeSections(
    id: string,
    sectionIds: string[],
    actor: any,
    ipAddress?: string,
  ) {
    const isAdmin = actor?.role === 'admin';
    const isDirector =
      actor?.role === 'director' || actor?.role === 'deputy_director';

    if (!isAdmin && !isDirector) {
      throw new ForbiddenException('Недостатньо прав для відкріплення відділів');
    }

    const existing = await (this.prisma as any).management.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new NotFoundException('Управління не знайдено');
    }

    await this.prisma.department.updateMany({
      where: { id: { in: sectionIds }, managementId: id } as any,
      data: { managementId: null } as any,
    });

    await this.auditService.log({
      userId: actor.id,
      action: AuditAction.update,
      entityType: 'management',
      entityId: id,
      newValue: { removedSections: sectionIds },
      ipAddress,
    });

    return this.findOne(id);
  }
}
