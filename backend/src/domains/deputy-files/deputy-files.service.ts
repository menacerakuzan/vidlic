import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../shared/prisma.service';

@Injectable()
export class DeputyFilesService {
  constructor(private prisma: PrismaService) {}

  private assertDeputyHead(user: any) {
    if (user?.role !== 'deputy_head') {
      throw new ForbiddenException('Ця функція доступна лише заступнику голови');
    }
  }

  async list(user: any, entityType?: string, entityId?: string) {
    this.assertDeputyHead(user);
    const where: any = { uploaderId: user.id };
    if (entityType) where.entityType = entityType;
    if (entityId) where.entityId = entityId;

    const files = await (this.prisma as any).deputyFile.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        entityType: true,
        entityId: true,
        fileName: true,
        mimeType: true,
        fileSize: true,
        notes: true,
        reminderAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    return files;
  }

  async upload(
    user: any,
    dto: {
      entityType: 'department' | 'user';
      entityId: string;
      fileName: string;
      mimeType: string;
      contentBase64: string;
      notes?: string;
      reminderAt?: string;
    },
  ) {
    this.assertDeputyHead(user);

    const clean = (dto.contentBase64 || '').replace(/^data:.*;base64,/, '');
    const buffer = Buffer.from(clean, 'base64');
    if (!buffer.length) throw new ForbiddenException('Порожній файл');
    if (buffer.length > 100 * 1024 * 1024) throw new ForbiddenException('Файл перевищує 100MB');

    const safe = this.safeFileName(dto.fileName || 'file');

    const file = await (this.prisma as any).deputyFile.create({
      data: {
        uploaderId: user.id,
        entityType: dto.entityType,
        entityId: dto.entityId,
        fileName: safe,
        mimeType: dto.mimeType || 'application/octet-stream',
        fileSize: buffer.length,
        fileData: buffer,
        notes: dto.notes ?? null,
        reminderAt: dto.reminderAt ? new Date(dto.reminderAt) : null,
      },
      select: {
        id: true,
        entityType: true,
        entityId: true,
        fileName: true,
        mimeType: true,
        fileSize: true,
        notes: true,
        reminderAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return file;
  }

  async read(user: any, id: string) {
    this.assertDeputyHead(user);
    const file = await (this.prisma as any).deputyFile.findUnique({ where: { id } });
    if (!file) throw new NotFoundException('Файл не знайдено');
    if (file.uploaderId !== user.id) throw new ForbiddenException();
    return { meta: this.mapMeta(file), buffer: file.fileData as Buffer };
  }

  async updateNotes(user: any, id: string, notes: string | null, reminderAt?: string | null) {
    this.assertDeputyHead(user);
    const file = await (this.prisma as any).deputyFile.findUnique({ where: { id }, select: { id: true, uploaderId: true } });
    if (!file) throw new NotFoundException('Файл не знайдено');
    if (file.uploaderId !== user.id) throw new ForbiddenException();

    const updated = await (this.prisma as any).deputyFile.update({
      where: { id },
      data: {
        notes: notes ?? null,
        reminderAt: reminderAt !== undefined ? (reminderAt ? new Date(reminderAt) : null) : undefined,
      },
      select: {
        id: true,
        entityType: true,
        entityId: true,
        fileName: true,
        mimeType: true,
        fileSize: true,
        notes: true,
        reminderAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    return updated;
  }

  async delete(user: any, id: string) {
    this.assertDeputyHead(user);
    const file = await (this.prisma as any).deputyFile.findUnique({ where: { id }, select: { id: true, uploaderId: true } });
    if (!file) throw new NotFoundException('Файл не знайдено');
    if (file.uploaderId !== user.id) throw new ForbiddenException();
    await (this.prisma as any).deputyFile.delete({ where: { id } });
    return { success: true };
  }

  async getReminders(user: any) {
    this.assertDeputyHead(user);
    const now = new Date();
    const soon = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const files = await (this.prisma as any).deputyFile.findMany({
      where: {
        uploaderId: user.id,
        reminderAt: { gte: now, lte: soon },
      },
      orderBy: { reminderAt: 'asc' },
      select: {
        id: true,
        fileName: true,
        entityType: true,
        entityId: true,
        notes: true,
        reminderAt: true,
      },
    });
    return files;
  }

  private mapMeta(file: any) {
    return {
      id: file.id,
      entityType: file.entityType,
      entityId: file.entityId,
      fileName: file.fileName,
      mimeType: file.mimeType,
      fileSize: file.fileSize,
      notes: file.notes,
      reminderAt: file.reminderAt,
      createdAt: file.createdAt,
    };
  }

  private safeFileName(value: string) {
    return value.replace(/[^\wЀ-ӿ.\- ]+/g, '_').slice(0, 220);
  }
}
