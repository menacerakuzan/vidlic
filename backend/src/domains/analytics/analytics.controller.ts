import { Body, Controller, Get, Post, Query, UseGuards, Req } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { AnalyticsService } from './analytics.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Permissions } from '../auth/decorators/roles.decorator';

@ApiTags('analytics')
@Controller('analytics')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class AnalyticsController {
  constructor(private analyticsService: AnalyticsService) {}

  @Get('dashboard')
  @Permissions('analytics:view')
  @ApiOperation({ summary: 'Отримати дашборд' })
  @ApiResponse({ status: 200, description: 'Дашборд з KPI' })
  getDashboard(@Req() req: any) {
    return this.analyticsService.getDashboard(req.user);
  }

  @Get('reports-stats')
  @Permissions('analytics:view')
  @ApiOperation({ summary: 'Статистика звітів' })
  @ApiResponse({ status: 200, description: 'Статистика звітів' })
  getReportsStats(
    @Query('departmentId') departmentId: string,
    @Query('dateFrom') dateFrom: string,
    @Req() req: any,
  ) {
    const dept = departmentId || req.user.departmentId;
    return this.analyticsService.getReportsStats(dept, new Date(dateFrom || Date.now() - 30 * 24 * 60 * 60 * 1000));
  }

  @Get('tasks-stats')
  @Permissions('analytics:view')
  @ApiOperation({ summary: 'Статистика задач' })
  @ApiResponse({ status: 200, description: 'Статистика задач' })
  getTasksStats(@Query('departmentId') departmentId: string, @Req() req: any) {
    const dept = departmentId || req.user.departmentId;
    return this.analyticsService.getTasksStats(dept);
  }

  @Get('department-performance')
  @Permissions('analytics:view')
  @ApiOperation({ summary: 'Ефективність підрозділу' })
  @ApiResponse({ status: 200, description: 'Ефективність підрозділу' })
  getDepartmentPerformance(
    @Query('departmentId') departmentId: string,
    @Query('dateFrom') dateFrom: string,
    @Query('dateTo') dateTo: string,
  ) {
    return this.analyticsService.getDepartmentPerformance(
      departmentId,
      new Date(dateFrom || Date.now() - 30 * 24 * 60 * 60 * 1000),
      new Date(dateTo || Date.now()),
    );
  }

  @Get('workload')
  @Permissions('analytics:view')
  @ApiOperation({ summary: 'Навантаження співробітників' })
  getWorkload(@Req() req: any, @Query('departmentId') departmentId?: string) {
    return this.analyticsService.getWorkload(req.user, departmentId);
  }

  @Get('digest-settings')
  @Permissions('analytics:view')
  @ApiOperation({ summary: 'Мої налаштування дайджесту' })
  getDigestSettings(@Req() req: any) {
    return this.analyticsService.getMyDigestSettings(req.user.id);
  }

  @Post('digest-settings')
  @Permissions('analytics:view')
  @ApiOperation({ summary: 'Оновити налаштування дайджесту' })
  upsertDigestSettings(
    @Req() req: any,
    @Body() body: { frequency: 'daily' | 'weekly'; hour: number; minute: number; weekdays: string; isActive: boolean },
  ) {
    return this.analyticsService.upsertDigestSetting(req.user.id, body);
  }
}
