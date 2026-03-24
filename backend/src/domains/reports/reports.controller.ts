import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards, Req } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { ReportsService } from './reports.service';
import {
  CreateReportDto,
  UpdateReportDto,
  ReportQueryDto,
  SubmitReportDto,
  ApproveReportDto,
  RejectReportDto,
  AddReportCommentDto,
  ResolveReportCommentDto,
} from './dto/reports.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Permissions } from '../auth/decorators/roles.decorator';

@ApiTags('reports')
@Controller('reports')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class ReportsController {
  constructor(private reportsService: ReportsService) {}

  @Get()
  @Permissions('reports:read')
  @ApiOperation({ summary: 'Отримати список звітів' })
  @ApiResponse({ status: 200, description: 'Список звітів' })
  findAll(@Query() query: ReportQueryDto, @Req() req: any) {
    return this.reportsService.findAll(query, req.user);
  }

  @Get(':id')
  @Permissions('reports:read')
  @ApiOperation({ summary: 'Отримати звіт за ID' })
  @ApiResponse({ status: 200, description: 'Дані звіту' })
  @ApiResponse({ status: 404, description: 'Звіт не знайдено' })
  findById(@Param('id') id: string, @Req() req: any) {
    return this.reportsService.findById(id, req.user);
  }

  @Post()
  @Permissions('reports:write')
  @ApiOperation({ summary: 'Створити чернетку звіту' })
  @ApiResponse({ status: 201, description: 'Звіт створено' })
  create(@Body() dto: CreateReportDto, @Req() req: any) {
    return this.reportsService.create(dto, req.user.id);
  }

  @Put(':id')
  @Permissions('reports:write')
  @ApiOperation({ summary: 'Редагувати чернетку звіту' })
  @ApiResponse({ status: 200, description: 'Звіт оновлено' })
  update(@Param('id') id: string, @Body() dto: UpdateReportDto, @Req() req: any) {
    return this.reportsService.update(id, dto, req.user.id);
  }

  @Post(':id/submit')
  @Permissions('reports:write')
  @ApiOperation({ summary: 'Відправити звіт на погодження' })
  @ApiResponse({ status: 200, description: 'Звіт відправлено' })
  submit(@Param('id') id: string, @Body() dto: SubmitReportDto, @Req() req: any) {
    return this.reportsService.submit(id, dto, req.user.id);
  }

  @Post(':id/generate-manager-draft')
  @Permissions('reports:write')
  @ApiOperation({ summary: 'Згенерувати AI-чернетку тексту для погодження' })
  @ApiResponse({ status: 200, description: 'AI-чернетку сформовано' })
  generateManagerDraft(@Param('id') id: string, @Req() req: any) {
    return this.reportsService.generateManagerSubmissionDraft(id, req.user.id);
  }

  @Post(':id/approve')
  @Permissions('reports:approve')
  @ApiOperation({ summary: 'Погодити звіт' })
  @ApiResponse({ status: 200, description: 'Звіт погоджено' })
  approve(@Param('id') id: string, @Body() dto: ApproveReportDto, @Req() req: any) {
    return this.reportsService.approve(id, dto, req.user);
  }

  @Post(':id/reject')
  @Permissions('reports:approve')
  @ApiOperation({ summary: 'Відхилити звіт' })
  @ApiResponse({ status: 200, description: 'Звіт відхилено' })
  reject(@Param('id') id: string, @Body() dto: RejectReportDto, @Req() req: any) {
    return this.reportsService.reject(id, dto, req.user);
  }

  @Delete(':id')
  @Permissions('reports:write')
  @ApiOperation({ summary: 'Видалити звіт' })
  @ApiResponse({ status: 200, description: 'Звіт видалено' })
  delete(@Param('id') id: string, @Req() req: any) {
    return this.reportsService.delete(id, req.user);
  }

  @Get(':id/history')
  @Permissions('reports:read')
  @ApiOperation({ summary: 'Історія статусів звіту' })
  @ApiResponse({ status: 200, description: 'Історія звіту' })
  getHistory(@Param('id') id: string, @Req() req: any) {
    return this.reportsService.getHistory(id, req.user);
  }

  @Get(':id/comments')
  @Permissions('reports:read')
  @ApiOperation({ summary: 'Коментарі до секцій звіту' })
  comments(@Param('id') id: string, @Req() req: any) {
    return this.reportsService.getComments(id, req.user);
  }

  @Post(':id/comments')
  @Permissions('reports:approve')
  @ApiOperation({ summary: 'Додати коментар до секції звіту' })
  addComment(@Param('id') id: string, @Body() dto: AddReportCommentDto, @Req() req: any) {
    return this.reportsService.addComment(id, dto, req.user);
  }

  @Post(':id/comments/:commentId/resolve')
  @Permissions('reports:approve')
  @ApiOperation({ summary: 'Закрити коментар (зауваження) по звіту' })
  resolveComment(
    @Param('id') id: string,
    @Param('commentId') commentId: string,
    @Body() dto: ResolveReportCommentDto,
    @Req() req: any,
  ) {
    return this.reportsService.resolveComment(id, commentId, dto, req.user);
  }

  @Get(':id/version-diff')
  @Permissions('reports:read')
  @ApiOperation({ summary: 'Порівняння двох версій звіту' })
  versionDiff(
    @Param('id') id: string,
    @Query('fromVersion') fromVersion: number,
    @Query('toVersion') toVersion: number,
    @Req() req: any,
  ) {
    return this.reportsService.getVersionDiff(id, req.user, Number(fromVersion) || undefined, Number(toVersion) || undefined);
  }
}
