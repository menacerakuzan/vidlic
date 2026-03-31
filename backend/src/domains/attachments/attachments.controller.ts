import { Controller, Delete, Get, Param, Post, Query, Req, Res, UseGuards, Body } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { AttachmentEntityType } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CreateAttachmentDto } from './dto/attachments.dto';
import { AttachmentsService } from './attachments.service';

@ApiTags('attachments')
@Controller('attachments')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class AttachmentsController {
  constructor(private readonly attachmentsService: AttachmentsService) {}

  @Post()
  @ApiOperation({ summary: 'Завантажити вкладення до звіту або задачі' })
  @ApiResponse({ status: 201, description: 'Вкладення створено' })
  create(@Body() dto: CreateAttachmentDto, @Req() req: any) {
    return this.attachmentsService.create(dto, req.user);
  }

  @Get()
  @ApiOperation({ summary: 'Список вкладень по сутності' })
  list(@Query('entityType') entityType: AttachmentEntityType, @Query('entityId') entityId: string, @Req() req: any) {
    return this.attachmentsService.list(entityType, entityId, req.user);
  }

  @Get(':id/download')
  @ApiOperation({ summary: 'Завантажити файл вкладення' })
  async download(@Param('id') id: string, @Req() req: any, @Res() res: Response) {
    const data = await this.attachmentsService.readFile(id, req.user);
    res.setHeader('Content-Type', data.meta.mimeType || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(data.meta.fileName)}"`);
    res.send(data.buffer);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Видалити вкладення' })
  remove(@Param('id') id: string, @Req() req: any) {
    return this.attachmentsService.delete(id, req.user);
  }
}
