import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../shared/prisma.service';

@Injectable()
export class TasksScheduler {
  private readonly logger = new Logger(TasksScheduler.name);

  constructor(private prisma: PrismaService) {}

  @Cron(CronExpression.EVERY_HOUR)
  async autoArchiveCompletedTasks() {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const result = await this.prisma.task.updateMany({
      where: {
        status: 'done',
        completedAt: { lte: oneDayAgo },
        deletedAt: null,
        archivedAt: null,
      },
      data: { archivedAt: new Date() },
    });

    if (result.count > 0) {
      this.logger.log(`Auto-archived ${result.count} completed tasks`);
    }
  }
}
