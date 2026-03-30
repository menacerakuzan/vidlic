import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards, Req } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { DepartmentsService } from './departments.service';
import { CreateDepartmentDto, UpdateDepartmentDto, DepartmentTeamQueryDto, UpdateDepartmentTemplateDto } from './dto/departments.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles, Permissions } from '../../auth/decorators/roles.decorator';

@ApiTags('departments')
@Controller('departments')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class DepartmentsController {
  constructor(private departmentsService: DepartmentsService) {}

  @Get()
  @Permissions('departments:read')
  @ApiOperation({ summary: 'Отримати список підрозділів' })
  @ApiResponse({ status: 200, description: 'Список підрозділів' })
  findAll(@Req() req: any) {
    return this.departmentsService.findAll(req.user);
  }

  @Get(':id')
  @Permissions('departments:read')
  @ApiOperation({ summary: 'Отримати підрозділ за ID' })
  @ApiResponse({ status: 200, description: 'Дані підрозділу' })
  @ApiResponse({ status: 404, description: 'Підрозділ не знайдено' })
  findById(@Param('id') id: string, @Req() req: any) {
    return this.departmentsService.findById(id, req.user);
  }

  @Get(':id/team')
  @Permissions('departments:read')
  @ApiOperation({ summary: 'Отримати команду підрозділу' })
  @ApiResponse({ status: 200, description: 'Команда підрозділу' })
  getTeam(@Param('id') id: string, @Req() req: any) {
    return this.departmentsService.getTeam(id, req.user);
  }

  @Get(':id/report-template')
  @Permissions('departments:read')
  @ApiOperation({ summary: 'Отримати шаблон звіту підрозділу' })
  getReportTemplate(@Param('id') id: string, @Req() req: any) {
    return this.departmentsService.getReportTemplate(id, req.user);
  }

  @Put(':id/report-template')
  @Permissions('reports:write')
  @ApiOperation({ summary: 'Оновити шаблон звіту підрозділу' })
  updateReportTemplate(@Param('id') id: string, @Body() dto: UpdateDepartmentTemplateDto, @Req() req: any) {
    return this.departmentsService.upsertReportTemplate(id, dto, req.user);
  }

  @Post()
  @Roles('admin', 'director')
  @Permissions('departments:write')
  @ApiOperation({ summary: 'Створити підрозділ (Admin)' })
  @ApiResponse({ status: 201, description: 'Підрозділ створений' })
  create(@Body() dto: CreateDepartmentDto, @Req() req: any) {
    return this.departmentsService.create(dto, req.user, req.ip);
  }

  @Put(':id')
  @Roles('admin', 'director')
  @Permissions('departments:write')
  @ApiOperation({ summary: 'Оновити підрозділ (Admin/Director)' })
  @ApiResponse({ status: 200, description: 'Підрозділ оновлений' })
  update(@Param('id') id: string, @Body() dto: UpdateDepartmentDto, @Req() req: any) {
    return this.departmentsService.update(id, dto, req.user, req.ip);
  }

  @Delete(':id')
  @Roles('admin')
  @Permissions('departments:write')
  @ApiOperation({ summary: 'Видалити підрозділ (Admin)' })
  @ApiResponse({ status: 200, description: 'Підрозділ видалений' })
  delete(@Param('id') id: string, @Req() req: any) {
    return this.departmentsService.delete(id, req.user.id, req.ip);
  }
}
