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
  @ApiOperation({ summary: 'Список файлів (за entity або всі)' })
  list(
    @Req() req: any,
    @Query('entityType') entityType?: string,
    @Query('entityId') entityId?: string,
    @Query('archived') archived?: string,
  ) {
    return this.service.list(req.user, entityType, entityId, archived === 'true');
  }

  @Get('reminders')
  @ApiOperation({ summary: 'Всі майбутні нагадування' })
  reminders(@Req() req: any) {
    return this.service.getReminders(req.user);
  }

  @Post()
  @ApiOperation({ summary: 'Завантажити файл' })
  upload(@Req() req: any, @Body() dto: any) {
    return this.service.upload(req.user, dto);
  }

  @Get(':id/content')
  @ApiOperation({ summary: 'Отримати вміст файлу' })
  async content(@Req() req: any, @Param('id') id: string, @Res() res: Response) {
    const { meta, buffer } = await this.service.read(req.user, id);
    res.setHeader('Content-Type', meta.mimeType);
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(meta.fileName)}"`);
    res.setHeader('Content-Length', String(buffer?.length ?? 0));
    res.end(buffer);
  }

  @Get(':id/thumbnail')
  @ApiOperation({ summary: 'Мініатюра зображення' })
  async thumbnail(@Req() req: any, @Param('id') id: string, @Res() res: Response) {
    const { buffer, mimeType } = await this.service.thumbnail(req.user, id);
    if (!buffer?.length) {
      res.status(204).end();
      return;
    }
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Cache-Control', 'private, max-age=86400');
    res.end(buffer);
  }

  @Get(':id/versions')
  @ApiOperation({ summary: 'Версії файлу' })
  versions(@Req() req: any, @Param('id') id: string) {
    return this.service.getVersions(req.user, id);
  }

  @Put(':id/notes')
  @ApiOperation({ summary: 'Оновити нотатку, нагадування, теги' })
  updateNotes(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: { notes?: string | null; reminderAt?: string | null; tags?: string[] },
  ) {
    return this.service.updateNotes(req.user, id, body.notes ?? null, body.reminderAt, body.tags);
  }

  @Post(':id/pin')
  @ApiOperation({ summary: 'Закріпити / відкріпити файл' })
  pin(@Req() req: any, @Param('id') id: string) {
    return this.service.togglePin(req.user, id);
  }

  @Post(':id/archive')
  @ApiOperation({ summary: 'Архівувати / розархівувати файл' })
  archive(@Req() req: any, @Param('id') id: string) {
    return this.service.toggleArchive(req.user, id);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Видалити файл' })
  remove(@Req() req: any, @Param('id') id: string) {
    return this.service.delete(req.user, id);
  }
}
