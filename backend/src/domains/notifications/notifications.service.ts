import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../shared/prisma.service';
import { NotificationType } from '@prisma/client';
import { EventEmitter } from 'events';

export interface CreateNotificationDto {
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  referenceType?: string;
  referenceId?: string;
}

@Injectable()
export class NotificationsService {
  private streamEmitter = new EventEmitter();

  constructor(private prisma: PrismaService) {}

  async findAll(userId: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit;

    const [notifications, total, unreadCount] = await Promise.all([
      this.prisma.notification.findMany({
        where: { userId },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.notification.count({ where: { userId } }),
      this.prisma.notification.count({ where: { userId, isRead: false } }),
    ]);

    return {
      data: notifications.map(this.mapNotification),
      unreadCount,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async findUnread(userId: string) {
    const notifications = await this.prisma.notification.findMany({
      where: { userId, isRead: false },
      take: 20,
      orderBy: { createdAt: 'desc' },
    });

    return {
      data: notifications.map(this.mapNotification),
      unreadCount: notifications.length,
    };
  }

  async markAsRead(id: string, userId: string) {
    const notification = await this.prisma.notification.findFirst({
      where: { id, userId },
    });

    if (!notification) {
      throw new NotFoundException('Сповіщення не знайдено');
    }

    await this.prisma.notification.update({
      where: { id },
      data: { isRead: true },
    });

    await this.emitUnreadCount(userId);

    return { success: true };
  }

  async markAllAsRead(userId: string) {
    await this.prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true },
    });

    await this.emitUnreadCount(userId);

    return { success: true };
  }

  async create(dto: CreateNotificationDto) {
    const notification = await this.prisma.notification.create({
      data: {
        userId: dto.userId,
        type: dto.type,
        title: dto.title,
        message: dto.message,
        referenceType: dto.referenceType,
        referenceId: dto.referenceId,
      },
    });

    const mapped = this.mapNotification(notification);
    const unreadCount = await this.prisma.notification.count({
      where: { userId: dto.userId, isRead: false },
    });
    this.streamEmitter.emit(this.getChannel(dto.userId), {
      type: 'notification.created',
      notification: mapped,
      unreadCount,
      ts: new Date().toISOString(),
    });

    return mapped;
  }

  async delete(id: string, userId: string) {
    const notification = await this.prisma.notification.findFirst({
      where: { id, userId },
    });

    if (!notification) {
      throw new NotFoundException('Сповіщення не знайдено');
    }

    await this.prisma.notification.delete({ where: { id } });
    await this.emitUnreadCount(userId);

    return { success: true };
  }

  subscribe(userId: string, handler: (payload: any) => void) {
    const channel = this.getChannel(userId);
    this.streamEmitter.on(channel, handler);
    return () => {
      this.streamEmitter.off(channel, handler);
    };
  }

  async emitUnreadCount(userId: string) {
    const unreadCount = await this.prisma.notification.count({
      where: { userId, isRead: false },
    });
    this.streamEmitter.emit(this.getChannel(userId), {
      type: 'notification.unread_count',
      unreadCount,
      ts: new Date().toISOString(),
    });
  }

  private getChannel(userId: string) {
    return `notifications:${userId}`;
  }

  private mapNotification(n: any) {
    return {
      id: n.id,
      type: n.type,
      title: n.title,
      message: n.message,
      referenceType: n.referenceType,
      referenceId: n.referenceId,
      isRead: n.isRead,
      createdAt: n.createdAt,
    };
  }
}
