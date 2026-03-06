import { Body, Controller, Get, Param, Post, Query, UseGuards, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AiService } from './ai.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Permissions } from '../auth/decorators/roles.decorator';
import { UiLayoutDto } from './dto/ui-config.dto';

@ApiTags('ai')
@Controller('ai')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class AiController {
  constructor(private aiService: AiService) {}

  @Get('reports/:id/summary')
  @Permissions('ai:read')
  @ApiOperation({ summary: 'AI-резюме звіту' })
  @ApiResponse({ status: 200, description: 'Резюме сформовано' })
  getReportSummary(@Param('id') id: string) {
    return this.aiService.summarizeReport(id);
  }

  @Get('ui-config')
  @Permissions('ui:read')
  @ApiOperation({ summary: 'UI конфігурація (UI-on-demand)' })
  @ApiResponse({ status: 200, description: 'UI конфігурація' })
  getUiConfig(@Req() req: any, @Query('page') page: string, @Query('query') query?: string) {
    return this.aiService.getUiConfig(req.user, page || 'dashboard', query);
  }

  @Post('ui-config')
  @Permissions('ui:read')
  @ApiOperation({ summary: 'Зберегти UI конфігурацію (override)' })
  @ApiResponse({ status: 200, description: 'UI конфігурація збережена' })
  saveUiConfig(@Req() req: any, @Query('page') page: string, @Body() layout: UiLayoutDto) {
    return this.aiService.saveUiConfig(req.user, page || 'dashboard', layout);
  }

  @Get('kpi-anomalies')
  @Permissions('ai:read')
  @ApiOperation({ summary: 'AI-аналітика: аномалії KPI' })
  @ApiResponse({ status: 200, description: 'Список аномалій' })
  getKpiAnomalies(@Req() req: any) {
    return this.aiService.detectKpiAnomalies(req.user);
  }
}
