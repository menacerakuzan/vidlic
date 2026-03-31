import { Controller, Post, Body, Get, Param, UseGuards, Req, Res, ForbiddenException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import { ExportService } from './export.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Permissions } from '../auth/decorators/roles.decorator';
import { ExportDto } from './dto/export.dto';

@ApiTags('exports')
@Controller('exports')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class ExportController {
  constructor(private exportService: ExportService) {}

  @Post()
  @Permissions('reports:read')
  @ApiOperation({ summary: 'Експортувати звіт у PDF/DOCX' })
  @ApiResponse({ status: 200, description: 'Експорт розпочато' })
  export(@Body() dto: ExportDto, @Req() req: any) {
    return this.exportService.export(dto, req.user.id);
  }

  @Get(':fileName')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Завантажити експортований файл' })
  @ApiResponse({ status: 200, description: 'Файл' })
  async download(@Param('fileName') fileName: string, @Req() req: any, @Res() res: Response) {
    const exportJob = await this.exportService.findByFileName(fileName);
    if (!exportJob) {
      return res.status(404).json({ error: 'Файл не знайдено' });
    }
    if (req.user?.role !== 'admin' && exportJob.userId !== req.user?.id) {
      throw new ForbiddenException('Немає доступу до цього файлу');
    }

    const filePath = path.join(process.cwd(), 'exports', fileName);
    
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Файл не знайдено' });
    }

    res.setHeader('Content-Type', fileName.endsWith('.pdf') ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    
    fs.createReadStream(filePath).pipe(res);
  }
}
