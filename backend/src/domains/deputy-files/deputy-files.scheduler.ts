import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../shared/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class DeputyFilesScheduler {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
  ) {}

  @Cron('0 8 * * *')
  async notifyReminders() {
    const now = new Date();
    const start = new Date(now); start.setHours(0, 0, 0, 0);
    const end = new Date(now); end.setHours(23, 59, 59, 999);

    const files = await (this.prisma as any).deputyFile.findMany({
      where: {
        reminderAt: { gte: start, lte: end },
        archivedAt: null,
      },
      select: { id: true, uploaderId: true, fileName: true, notes: true },
    });

    for (const file of files) {
      await this.notifications.create({
        userId: file.uploaderId,
        type: 'reminder',
        title: 'Нагадування по файлу',
        message: `${file.fileName}${file.notes ? `\n${file.notes}` : ''}`,
        referenceType: 'deputy_file',
        referenceId: file.id,
      });
    }
  }
}
