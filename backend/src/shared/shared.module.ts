import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { RedisService } from './redis.service';
import { DepartmentScopeService } from './department-scope.service';

@Global()
@Module({
  providers: [PrismaService, RedisService, DepartmentScopeService],
  exports: [PrismaService, RedisService, DepartmentScopeService],
})
export class SharedModule {}
