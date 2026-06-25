import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../shared/prisma.service';

const META_SELECT = {
  id: true,
  entityType: true,
  entityId: true,
  fileName: true,
  mimeType: true,
  fileSize: true,
  notes: true,
  reminderAt: true,
  tags: true,
  isPinned: true,
  archivedAt: true,
  version: true,
  parentFileId: true,
  createdAt: true,
  updatedAt: true,
};

@Injectable()
export class DeputyFilesService {
  constructor(private prisma: PrismaService) {}

  private assertDeputyHead(user: any) {
    if (user?.role !== 'deputy_head') {
      throw new ForbiddenException('Ця функція доступна лише заступнику голови');
    }
  }

  private db() {
    return (this.prisma as any).deputyFile;
  }

  async list(user: any, entityType?: string, entityId?: string, showArchived = false) {
    this.assertDeputyHead(user);
    const where: any = {
      uploaderId: user.id,
      parentFileId: null, // only show current/root versions
    };
    if (entityType) where.entityType = entityType;
    if (entityId) where.entityId = entityId;
    if (!showArchived) where.archivedAt = null;

    return this.db().findMany({
      where,
      orderBy: [{ isPinned: 'desc' }, { createdAt: 'desc' }],
      select: META_SELECT,
    });
  }

  async upload(
    user: any,
    dto: {
      entityType: 'department' | 'user';
      entityId: string;
      fileName: string;
      mimeType: string;
      contentBase64: string;
      thumbnailBase64?: string;
      notes?: string;
      reminderAt?: string;
      tags?: string[];
      isPinned?: boolean;
      parentFileId?: string;
    },
  ) {
    this.assertDeputyHead(user);

    const clean = (dto.contentBase64 || '').replace(/^data:.*;base64,/, '');
    const buffer = Buffer.from(clean, 'base64');
    if (!buffer.length) throw new ForbiddenException('Порожній файл');
    if (buffer.length > 100 * 1024 * 1024) throw new ForbiddenException('Файл перевищує 100MB');

    let thumbnailBuffer: Buffer | null = null;
    if (dto.thumbnailBase64) {
      const thumbClean = dto.thumbnailBase64.replace(/^data:.*;base64,/, '');
      thumbnailBuffer = Buffer.from(thumbClean, 'base64');
      if (thumbnailBuffer.length > 2 * 1024 * 1024) thumbnailBuffer = null;
    }

    let version = 1;
    if (dto.parentFileId) {
      const parent = await this.db().findUnique({
        where: { id: dto.parentFileId },
        select: { id: true, uploaderId: true, version: true },
      });
      if (!parent || parent.uploaderId !== user.id) throw new ForbiddenException();
      version = parent.version + 1;
      // archive old version
      await this.db().update({
        where: { id: dto.parentFileId },
        data: { archivedAt: new Date() },
      });
    }

    const safe = this.safeFileName(dto.fileName || 'file');

    return this.db().create({
      data: {
        uploaderId: user.id,
        entityType: dto.entityType,
        entityId: dto.entityId,
        fileName: safe,
        mimeType: dto.mimeType || 'application/octet-stream',
        fileSize: buffer.length,
        fileData: buffer,
        thumbnailData: thumbnailBuffer,
        notes: dto.notes ?? null,
        reminderAt: dto.reminderAt ? new Date(dto.reminderAt) : null,
        tags: dto.tags ?? [],
        isPinned: dto.isPinned ?? false,
        version,
        parentFileId: dto.parentFileId ?? null,
      },
      select: META_SELECT,
    });
  }

  async read(user: any, id: string) {
    this.assertDeputyHead(user);
    const file = await this.db().findUnique({ where: { id } });
    if (!file) throw new NotFoundException('Файл не знайдено');
    if (file.uploaderId !== user.id) throw new ForbiddenException();
    return { meta: file, buffer: file.fileData as Buffer };
  }

  async thumbnail(user: any, id: string) {
    this.assertDeputyHead(user);
    const file = await this.db().findUnique({
      where: { id },
      select: { uploaderId: true, thumbnailData: true, mimeType: true },
    });
    if (!file) throw new NotFoundException();
    if (file.uploaderId !== user.id) throw new ForbiddenException();
    return { buffer: file.thumbnailData as Buffer | null, mimeType: file.mimeType };
  }

  async updateNotes(
    user: any,
    id: string,
    notes: string | null,
    reminderAt?: string | null,
    tags?: string[],
  ) {
    this.assertDeputyHead(user);
    const file = await this.db().findUnique({ where: { id }, select: { id: true, uploaderId: true } });
    if (!file) throw new NotFoundException('Файл не знайдено');
    if (file.uploaderId !== user.id) throw new ForbiddenException();

    return this.db().update({
      where: { id },
      data: {
        notes: notes ?? null,
        reminderAt: reminderAt !== undefined ? (reminderAt ? new Date(reminderAt) : null) : undefined,
        ...(tags !== undefined ? { tags } : {}),
      },
      select: META_SELECT,
    });
  }

  async togglePin(user: any, id: string) {
    this.assertDeputyHead(user);
    const file = await this.db().findUnique({ where: { id }, select: { id: true, uploaderId: true, isPinned: true } });
    if (!file) throw new NotFoundException();
    if (file.uploaderId !== user.id) throw new ForbiddenException();
    return this.db().update({ where: { id }, data: { isPinned: !file.isPinned }, select: META_SELECT });
  }

  async toggleArchive(user: any, id: string) {
    this.assertDeputyHead(user);
    const file = await this.db().findUnique({ where: { id }, select: { id: true, uploaderId: true, archivedAt: true } });
    if (!file) throw new NotFoundException();
    if (file.uploaderId !== user.id) throw new ForbiddenException();
    return this.db().update({
      where: { id },
      data: { archivedAt: file.archivedAt ? null : new Date() },
      select: META_SELECT,
    });
  }

  async getVersions(user: any, id: string) {
    this.assertDeputyHead(user);
    // id may be the root or a child — find the root
    const target = await this.db().findUnique({ where: { id }, select: { id: true, uploaderId: true, parentFileId: true } });
    if (!target || target.uploaderId !== user.id) throw new NotFoundException();

    const rootId = target.parentFileId ?? target.id;

    // All versions: root + children (recursively)
    const all = await this.db().findMany({
      where: { OR: [{ id: rootId }, { parentFileId: rootId }] },
      orderBy: { version: 'asc' },
      select: META_SELECT,
    });

    return all;
  }

  async delete(user: any, id: string) {
    this.assertDeputyHead(user);
    const file = await this.db().findUnique({ where: { id }, select: { id: true, uploaderId: true } });
    if (!file) throw new NotFoundException('Файл не знайдено');
    if (file.uploaderId !== user.id) throw new ForbiddenException();
    await this.db().delete({ where: { id } });
    return { success: true };
  }

  async getReminders(user: any) {
    this.assertDeputyHead(user);
    const now = new Date();
    return this.db().findMany({
      where: {
        uploaderId: user.id,
        reminderAt: { gte: now },
        archivedAt: null,
      },
      orderBy: { reminderAt: 'asc' },
      select: { ...META_SELECT },
    });
  }

  private safeFileName(value: string) {
    return value.replace(/[^\wЀ-ӿ.\- ]+/g, '_').slice(0, 220);
  }
}
