import { Controller, Get, Query, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { AuditService } from './audit.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Permissions } from '../auth/decorators/roles.decorator';
import { AuditAction } from '@prisma/client';

@ApiTags('audit')
@Controller('audit')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class AuditController {
  constructor(private auditService: AuditService) {}

  @Get()
  @Permissions('audit:read')
  @ApiOperation({ summary: 'Отримати журнал аудиту' })
  @ApiResponse({ status: 200, description: 'Журнал аудиту' })
  findAll(
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 50,
    @Query('userId') userId?: string,
    @Query('action') action?: AuditAction,
    @Query('entityType') entityType?: string,
    @Query('entityId') entityId?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ) {
    return this.auditService.findAll({
      page,
      limit,
      userId,
      action,
      entityType,
      entityId,
      dateFrom: dateFrom ? new Date(dateFrom) : undefined,
      dateTo: dateTo ? new Date(dateTo) : undefined,
    });
  }

  @Get('entity/:entityType/:entityId')
  @Permissions('audit:read')
  @ApiOperation({ summary: 'Історія змін об\'єкта' })
  @ApiResponse({ status: 200, description: 'Історія об\'єкта' })
  findByEntity(@Param('entityType') entityType: string, @Param('entityId') entityId: string) {
    return this.auditService.findByEntity(entityType, entityId);
  }

  @Get('user/:userId')
  @Permissions('audit:read')
  @ApiOperation({ summary: 'Дії користувача' })
  @ApiResponse({ status: 200, description: 'Дії користувача' })
  findByUser(@Param('userId') userId: string, @Query('page') page: number = 1, @Query('limit') limit: number = 50) {
    return this.auditService.findByUser(userId, page, limit);
  }
}
