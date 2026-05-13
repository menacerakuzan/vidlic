import { Controller, Get, Post, Put, Patch, Delete, Body, Param, Query, UseGuards, Req } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { TasksService } from './tasks.service';
import { CreateTaskDto, CreateSubtaskDto, UpdateTaskDto, TaskQueryDto, UpdateTaskStatusDto, CreateTaskCommentDto, GroupTasksDto } from './dto/tasks.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Permissions } from '../auth/decorators/roles.decorator';

@ApiTags('tasks')
@Controller('tasks')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class TasksController {
  constructor(private tasksService: TasksService) {}

  @Get()
  @Permissions('tasks:read')
  @ApiOperation({ summary: 'Отримати список задач' })
  @ApiResponse({ status: 200, description: 'Список задач' })
  findAll(@Query() query: TaskQueryDto, @Req() req: any) {
    return this.tasksService.findAll(query, req.user);
  }

  @Get('archive')
  @Permissions('tasks:read')
  @ApiOperation({ summary: 'Архів видалених задач' })
  getArchive(@Req() req: any) {
    return this.tasksService.getArchive(req.user);
  }

  @Get('kanban')
  @Permissions('tasks:read')
  @ApiOperation({ summary: 'Отримати Kanban дошку' })
  @ApiResponse({ status: 200, description: 'Kanban дошка' })
  getKanban(@Query('departmentId') departmentId: string, @Req() req: any) {
    return this.tasksService.getKanban(departmentId, req.user);
  }

  @Get('transparency')
  @Permissions('tasks:read')
  @ApiOperation({ summary: 'Порівняльна прозорість задач між підрозділами' })
  @ApiResponse({ status: 200, description: 'Агреговані показники по підрозділах' })
  getTransparency(@Req() req: any) {
    return this.tasksService.getDepartmentTransparency(req.user);
  }

  @Get(':id')
  @Permissions('tasks:read')
  @ApiOperation({ summary: 'Отримати задачу за ID' })
  @ApiResponse({ status: 200, description: 'Дані задачі' })
  @ApiResponse({ status: 404, description: 'Задачу не знайдено' })
  findById(@Param('id') id: string, @Req() req: any) {
    return this.tasksService.findById(id, req.user);
  }

  @Post()
  @Permissions('tasks:write')
  @ApiOperation({ summary: 'Створити задачу' })
  @ApiResponse({ status: 201, description: 'Задачу створено' })
  create(@Body() dto: CreateTaskDto, @Req() req: any) {
    return this.tasksService.create(dto, req.user);
  }

  @Post('group')
  @Permissions('tasks:write')
  @ApiOperation({ summary: 'Згрупувати задачі в одну глобальну' })
  groupTasks(@Body() dto: GroupTasksDto, @Req() req: any) {
    return this.tasksService.groupTasks(dto.title, dto.taskIds, req.user);
  }

  @Put(':id')
  @Permissions('tasks:write')
  @ApiOperation({ summary: 'Редагувати задачу' })
  @ApiResponse({ status: 200, description: 'Задачу оновлено' })
  update(@Param('id') id: string, @Body() dto: UpdateTaskDto, @Req() req: any) {
    return this.tasksService.update(id, dto, req.user);
  }

  @Patch(':id/status')
  @Permissions('tasks:write')
  @ApiOperation({ summary: 'Змінити статус задачі' })
  @ApiResponse({ status: 200, description: 'Статус оновлено' })
  updateStatus(@Param('id') id: string, @Body() dto: UpdateTaskStatusDto, @Req() req: any) {
    return this.tasksService.updateStatus(id, dto, req.user);
  }

  @Get(':id/subtasks')
  @Permissions('tasks:read')
  @ApiOperation({ summary: 'Підзадачі задачі' })
  @ApiResponse({ status: 200, description: 'Список підзадач' })
  getSubtasks(@Param('id') id: string, @Req() req: any) {
    return this.tasksService.getSubtasks(id, req.user);
  }

  @Post(':id/subtasks')
  @Permissions('tasks:write')
  @ApiOperation({ summary: 'Створити підзадачу' })
  @ApiResponse({ status: 201, description: 'Підзадачу створено' })
  createSubtask(@Param('id') id: string, @Body() dto: CreateSubtaskDto, @Req() req: any) {
    return this.tasksService.createSubtask(id, dto as any, req.user);
  }

  @Get(':id/comments')
  @Permissions('tasks:read')
  @ApiOperation({ summary: 'Отримати коментарі до задачі' })
  getComments(@Param('id') id: string, @Req() req: any) {
    return this.tasksService.getComments(id, req.user);
  }

  @Post(':id/comments')
  @Permissions('tasks:write')
  @ApiOperation({ summary: 'Додати коментар до задачі' })
  @ApiResponse({ status: 201, description: 'Коментар додано' })
  addComment(@Param('id') id: string, @Body() dto: CreateTaskCommentDto, @Req() req: any) {
    return this.tasksService.addComment(id, dto, req.user.id);
  }

  @Delete(':id')
  @Permissions('tasks:write')
  @ApiOperation({ summary: 'Видалити задачу (до архіву)' })
  @ApiResponse({ status: 200, description: 'Задачу видалено' })
  delete(@Param('id') id: string, @Req() req: any) {
    return this.tasksService.delete(id, req.user);
  }

  @Post(':id/restore')
  @Permissions('tasks:write')
  @ApiOperation({ summary: 'Відновити задачу з архіву' })
  restore(@Param('id') id: string, @Req() req: any) {
    return this.tasksService.restoreTask(id, req.user);
  }

  @Delete(':id/permanent')
  @Permissions('tasks:write')
  @ApiOperation({ summary: 'Остаточно видалити задачу (лише admin)' })
  hardDelete(@Param('id') id: string, @Req() req: any) {
    return this.tasksService.hardDelete(id, req.user);
  }
}
