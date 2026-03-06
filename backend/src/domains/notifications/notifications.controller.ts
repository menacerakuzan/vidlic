import { Controller, Get, Post, Delete, Body, Param, Query, UseGuards, Req } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { NotificationsService } from './notifications.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Permissions } from '../auth/decorators/roles.decorator';

@ApiTags('notifications')
@Controller('notifications')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class NotificationsController {
  constructor(private notificationsService: NotificationsService) {}

  @Get()
  @Permissions('notifications:read')
  @ApiOperation({ summary: 'Отримати список сповіщень' })
  @ApiResponse({ status: 200, description: 'Список сповіщень' })
  async findAll(@Query('page') page: number = 1, @Query('limit') limit: number = 20, @Req() req: any) {
    try {
      return await this.notificationsService.findAll(req.user.id, Number(page) || 1, Number(limit) || 20);
    } catch (error) {
      console.error('Notifications findAll error:', error);
      throw error;
    }
  }

  @Get('unread')
  @Permissions('notifications:read')
  @ApiOperation({ summary: 'Отримати непрочитані сповіщення' })
  @ApiResponse({ status: 200, description: 'Непрочитані сповіщення' })
  findUnread(@Req() req: any) {
    return this.notificationsService.findUnread(req.user.id);
  }

  @Post(':id/read')
  @Permissions('notifications:write')
  @ApiOperation({ summary: 'Позначити як прочитане' })
  @ApiResponse({ status: 200, description: 'Успішно' })
  markAsRead(@Param('id') id: string, @Req() req: any) {
    return this.notificationsService.markAsRead(id, req.user.id);
  }

  @Post('read-all')
  @Permissions('notifications:write')
  @ApiOperation({ summary: 'Позначити всі як прочитані' })
  @ApiResponse({ status: 200, description: 'Успішно' })
  markAllAsRead(@Req() req: any) {
    return this.notificationsService.markAllAsRead(req.user.id);
  }

  @Delete(':id')
  @Permissions('notifications:write')
  @ApiOperation({ summary: 'Видалити сповіщення' })
  @ApiResponse({ status: 200, description: 'Успішно' })
  delete(@Param('id') id: string, @Req() req: any) {
    return this.notificationsService.delete(id, req.user.id);
  }
}
