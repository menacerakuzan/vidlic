import {
  Body, Controller, Delete, Get, Param, Patch, Post, Put, Query,
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

  // ── Files ─────────────────────────────────────────────────────────────────

  @Get()
  @ApiOperation({ summary: 'Список файлів' })
  list(
    @Req() req: any,
    @Query('entityType') entityType?: string,
    @Query('entityId') entityId?: string,
    @Query('archived') archived?: string,
    @Query('folderId') folderId?: string,
  ) {
    const folderFilter = folderId === 'null' ? null : folderId;
    return this.service.list(req.user, entityType, entityId, archived === 'true', folderFilter);
  }

  @Get('reminders')
  @ApiOperation({ summary: 'Всі майбутні нагадування' })
  reminders(@Req() req: any) {
    return this.service.getReminders(req.user);
  }

  // ── Folders (must come before :id routes) ─────────────────────────────────

  @Get('folders')
  @ApiOperation({ summary: 'Список папок' })
  listFolders(
    @Req() req: any,
    @Query('entityType') entityType?: string,
    @Query('entityId') entityId?: string,
  ) {
    return this.service.listFolders(req.user, entityType, entityId);
  }

  @Post('folders')
  @ApiOperation({ summary: 'Створити папку' })
  createFolder(@Req() req: any, @Body() body: { entityType: string; entityId: string; name: string }) {
    return this.service.createFolder(req.user, body);
  }

  @Patch('folders/:id')
  @ApiOperation({ summary: 'Перейменувати папку' })
  renameFolder(@Req() req: any, @Param('id') id: string, @Body() body: { name: string }) {
    return this.service.renameFolder(req.user, id, body.name);
  }

  @Delete('folders/:id')
  @ApiOperation({ summary: 'Видалити папку' })
  deleteFolder(@Req() req: any, @Param('id') id: string) {
    return this.service.deleteFolder(req.user, id);
  }

  // ── File CRUD ─────────────────────────────────────────────────────────────

  @Post()
  @ApiOperation({ summary: 'Завантажити файл' })
  upload(@Req() req: any, @Body() dto: any) {
    return this.service.upload(req.user, dto);
  }

  @Get(':id/content')
  @ApiOperation({ summary: 'Вміст файлу' })
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
    if (!buffer?.length) { res.status(204).end(); return; }
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

  @Patch(':id/rename')
  @ApiOperation({ summary: 'Перейменувати файл' })
  rename(@Req() req: any, @Param('id') id: string, @Body() body: { fileName: string }) {
    return this.service.rename(req.user, id, body.fileName);
  }

  @Patch(':id/move')
  @ApiOperation({ summary: 'Перемістити файл у папку' })
  move(@Req() req: any, @Param('id') id: string, @Body() body: { folderId: string | null }) {
    return this.service.moveToFolder(req.user, id, body.folderId);
  }

  @Post(':id/pin')
  @ApiOperation({ summary: 'Закріпити / відкріпити' })
  pin(@Req() req: any, @Param('id') id: string) {
    return this.service.togglePin(req.user, id);
  }

  @Post(':id/archive')
  @ApiOperation({ summary: 'Архівувати / розархівувати' })
  archive(@Req() req: any, @Param('id') id: string) {
    return this.service.toggleArchive(req.user, id);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Видалити файл' })
  remove(@Req() req: any, @Param('id') id: string) {
    return this.service.delete(req.user, id);
  }
}
