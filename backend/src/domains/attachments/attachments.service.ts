import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AttachmentEntityType } from '@prisma/client';
import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import * as path from 'path';
import { PrismaService } from '../../shared/prisma.service';

@Injectable()
export class AttachmentsService {
  constructor(private prisma: PrismaService) {}

  async create(
    dto: {
      entityType: AttachmentEntityType;
      reportId?: string;
      taskId?: string;
      fileName: string;
      mimeType: string;
      contentBase64: string;
    },
    user: any,
  ) {
    const entity = await this.ensureAccess(dto.entityType, dto.reportId, dto.taskId, user, 'write');
    if (!entity?.id) {
      throw new BadRequestException('Некоректна привʼязка вкладення');
    }

    const safeName = this.safeFileName(dto.fileName || 'attachment.bin');
    const buffer = this.decodeBase64(dto.contentBase64);
    if (!buffer.length) throw new BadRequestException('Порожній файл');
    if (buffer.length > 10 * 1024 * 1024) {
      throw new BadRequestException('Файл перевищує 10MB');
    }

    const storageRoot = path.join(process.cwd(), 'storage', 'attachments', dto.entityType, entity.id);
    await fs.mkdir(storageRoot, { recursive: true });
    const fileId = randomUUID();
    const filePath = path.join(storageRoot, `${fileId}_${safeName}`);
    await fs.writeFile(filePath, buffer);

    const created = await this.prisma.attachment.create({
      data: {
        entityType: dto.entityType,
        reportId: dto.entityType === 'report' ? entity.id : null,
        taskId: dto.entityType === 'task' ? entity.id : null,
        uploaderId: user.id,
        fileName: safeName,
        mimeType: dto.mimeType || 'application/octet-stream',
        filePath,
        fileSize: buffer.length,
      },
    });

    return this.map(created);
  }

  async list(entityType: AttachmentEntityType, entityId: string, user: any) {
    await this.ensureAccess(entityType, entityType === 'report' ? entityId : undefined, entityType === 'task' ? entityId : undefined, user, 'read');
    const items = await this.prisma.attachment.findMany({
      where: entityType === 'report' ? { entityType, reportId: entityId } : { entityType, taskId: entityId },
      include: {
        uploader: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    return items.map((item) => ({
      ...this.map(item),
      uploader: item.uploader ? `${item.uploader.firstName} ${item.uploader.lastName}` : '',
    }));
  }

  async delete(id: string, user: any) {
    const item = await this.prisma.attachment.findUnique({ where: { id } });
    if (!item) throw new NotFoundException('Вкладення не знайдено');
    await this.ensureAccess(item.entityType, item.reportId || undefined, item.taskId || undefined, user, 'write');

    try {
      await fs.unlink(item.filePath);
    } catch {
      // ignore fs deletion errors
    }
    await this.prisma.attachment.delete({ where: { id } });
    return { success: true };
  }

  async readFile(id: string, user: any) {
    const item = await this.prisma.attachment.findUnique({ where: { id } });
    if (!item) throw new NotFoundException('Вкладення не знайдено');
    await this.ensureAccess(item.entityType, item.reportId || undefined, item.taskId || undefined, user, 'read');

    const buffer = await fs.readFile(item.filePath);
    return {
      meta: this.map(item),
      buffer,
    };
  }

  private async ensureAccess(
    entityType: AttachmentEntityType,
    reportId: string | undefined,
    taskId: string | undefined,
    user: any,
    mode: 'read' | 'write',
  ) {
    if (entityType === 'report') {
      const report = await this.prisma.report.findUnique({ where: { id: reportId } });
      if (!report) throw new NotFoundException('Звіт не знайдено');
      if (user.role === 'admin' || user.role === 'director') return report;
      if (user.role === 'manager' && report.departmentId === user.departmentId) return report;
      if (report.authorId === user.id) return report;
      throw new ForbiddenException('Немає доступу до цього звіту');
    }

    const task = await this.prisma.task.findUnique({ where: { id: taskId } });
    if (!task) throw new NotFoundException('Задачу не знайдено');
    if (user.role === 'admin') return task;
    if ((user.role === 'director' || user.role === 'manager') && task.departmentId === user.departmentId) return task;
    if (user.role === 'specialist') {
      if (mode === 'read' && (task.assigneeId === user.id || task.reporterId === user.id)) return task;
      if (mode === 'write' && task.reporterId === user.id) return task;
    }
    throw new ForbiddenException('Немає доступу до цієї задачі');
  }

  private safeFileName(value: string) {
    return value.replace(/[^\w.\- ]+/g, '_').slice(0, 180);
  }

  private decodeBase64(value: string): Buffer {
    const clean = (value || '').replace(/^data:.*;base64,/, '');
    return Buffer.from(clean, 'base64');
  }

  private map(item: any) {
    return {
      id: item.id,
      entityType: item.entityType,
      reportId: item.reportId,
      taskId: item.taskId,
      fileName: item.fileName,
      mimeType: item.mimeType,
      fileSize: item.fileSize,
      createdAt: item.createdAt,
    };
  }
}
