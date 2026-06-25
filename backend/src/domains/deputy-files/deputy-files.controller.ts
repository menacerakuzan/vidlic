import {
  Body, Controller, Delete, Get, Param, Post, Put, Query,
  Req, Res, UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { DeputyFilesService } from './deputy-files.service';

@ApiTags('deputy-files')
@Controller('deputy-files')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('deputy_head')
@ApiBearerAuth()
export class DeputyFilesController {
  constructor(private service: DeputyFilesService) {}

  @Get()
  @ApiOperation({ summary: 'Список файлів (за entity)' })
  list(
    @Req() req: any,
    @Query('entityType') entityType?: string,
    @Query('entityId') entityId?: string,
  ) {
    return this.service.list(req.user, entityType, entityId);
  }

  @Get('reminders')
  @ApiOperation({ summary: 'Нагадування на наступні 7 днів' })
  reminders(@Req() req: any) {
    return this.service.getReminders(req.user);
  }

  @Post()
  @ApiOperation({ summary: 'Завантажити файл' })
  upload(@Req() req: any, @Body() dto: any) {
    return this.service.upload(req.user, dto);
  }

  @Get(':id/content')
  @ApiOperation({ summary: 'Отримати вміст файлу (бінарний)' })
  async content(@Req() req: any, @Param('id') id: string, @Res() res: Response) {
    const { meta, buffer } = await this.service.read(req.user, id);
    res.setHeader('Content-Type', meta.mimeType);
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(meta.fileName)}"`);
    res.setHeader('Content-Length', String(buffer?.length ?? 0));
    res.end(buffer);
  }

  @Put(':id/notes')
  @ApiOperation({ summary: 'Оновити нотатку та нагадування' })
  updateNotes(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: { notes?: string | null; reminderAt?: string | null },
  ) {
    return this.service.updateNotes(req.user, id, body.notes ?? null, body.reminderAt);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Видалити файл' })
  remove(@Req() req: any, @Param('id') id: string) {
    return this.service.delete(req.user, id);
  }
}
