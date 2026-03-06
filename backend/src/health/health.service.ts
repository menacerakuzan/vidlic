import { Injectable } from '@nestjs/common';
import { PrismaService } from '../shared/prisma.service';
// Redis is optional here; we can ping if needed

@Injectable()
export class HealthService {
  constructor(private prisma: PrismaService) {}

  async ping(): Promise<boolean> {
    try {
      // Basic DB ping
      await this.prisma.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }
}
