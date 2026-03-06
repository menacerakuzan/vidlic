import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../shared/prisma.service';
import { ExportFormat } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } from 'docx';
import PDFDocument from 'pdfkit';

export interface ExportDto {
  entityType: 'report' | 'task';
  entityId: string;
  format: 'pdf' | 'docx';
}

@Injectable()
export class ExportService {
  constructor(private prisma: PrismaService) {}

  async export(dto: ExportDto, userId: string) {
    const { entityType, entityId, format } = dto;

    if (entityType === 'report') {
      return this.exportReport(entityId, format, userId);
    }

    throw new BadRequestException('Непідтримуваний тип сутності');
  }

  private async exportReport(reportId: string, format: ExportFormat, userId: string) {
    const report = await this.prisma.report.findUnique({
      where: { id: reportId },
      include: {
        author: { include: { department: true } },
        department: true,
      },
    });

    if (!report) {
      throw new NotFoundException('Звіт не знайдено');
    }

    const content = report.content as any;
    
    const fileName = `report_${report.reportType}_${report.periodStart.toISOString().split('T')[0]}_${Date.now()}`;
    const filePath = path.join(process.cwd(), 'exports', `${fileName}.${format}`);

    if (!fs.existsSync(path.dirname(filePath))) {
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
    }

    if (format === 'docx') {
      await this.generateDocx(report, content, filePath);
    } else {
      await this.generatePdf(report, content, filePath);
    }

    await this.prisma.exportJob.create({
      data: {
        userId,
        entityType: 'report',
        entityId: reportId,
        format,
        status: 'completed',
        filePath,
        completedAt: new Date(),
      },
    });

    return {
      fileName: `${fileName}.${format}`,
      filePath: `/exports/${fileName}.${format}`,
      downloadUrl: `/api/v1/exports/${fileName}.${format}`,
    };
  }

  private async generateDocx(report: any, content: any, filePath: string) {
    const submission = this.extractManagerSubmission(content, report);
    if (submission) {
      const children = [
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new TextRun({ text: submission.documentTitle, bold: true, size: 28, font: 'Times New Roman' })],
        }),
        ...submission.headerLines.map(
          (line) =>
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [new TextRun({ text: line, size: 28, font: 'Times New Roman' })],
            }),
        ),
        new Paragraph({ text: '' }),
        ...submission.bodyText.split('\n').map(
          (line) =>
            new Paragraph({
              children: [new TextRun({ text: line, size: 28, font: 'Times New Roman' })],
            }),
        ),
      ];

      const doc = new Document({
        sections: [{ properties: {}, children }],
      });

      const buffer = await Packer.toBuffer(doc);
      fs.writeFileSync(filePath, buffer);
      return;
    }

    const children = [
      new Paragraph({
        text: report.reportType === 'weekly' ? 'Тижневий звіт' : 'Місячний звіт',
        heading: HeadingLevel.TITLE,
        alignment: AlignmentType.CENTER,
      }),
      new Paragraph({
        text: `${this.formatDate(report.periodStart)} - ${this.formatDate(report.periodEnd)}`,
        alignment: AlignmentType.CENTER,
      }),
      new Paragraph({ text: '' }),
      new Paragraph({
        text: `Автор: ${report.author.firstName} ${report.author.lastName}`,
      }),
      new Paragraph({
        text: `Підрозділ: ${report.department?.nameUk || 'Не вказано'}`,
      }),
      new Paragraph({
        text: `Статус: ${this.getStatusLabel(report.status)}`,
      }),
      new Paragraph({ text: '' }),
    ];

    if (content) {
      if (content.workDone) {
        children.push(new Paragraph({
          text: 'Виконана робота:',
          heading: HeadingLevel.HEADING_1,
        }));
        children.push(new Paragraph({
          text: content.workDone,
        }));
        children.push(new Paragraph({ text: '' }));
      }

      if (content.achievements) {
        children.push(new Paragraph({
          text: 'Досягнення:',
          heading: HeadingLevel.HEADING_1,
        }));
        children.push(new Paragraph({
          text: content.achievements,
        }));
        children.push(new Paragraph({ text: '' }));
      }

      if (content.problems) {
        children.push(new Paragraph({
          text: 'Проблеми:',
          heading: HeadingLevel.HEADING_1,
        }));
        children.push(new Paragraph({
          text: content.problems,
        }));
        children.push(new Paragraph({ text: '' }));
      }

      if (content.nextWeekPlan) {
        children.push(new Paragraph({
          text: 'План на наступний період:',
          heading: HeadingLevel.HEADING_1,
        }));
        children.push(new Paragraph({
          text: content.nextWeekPlan,
        }));
      }
    }

    const doc = new Document({
      sections: [{
        properties: {},
        children,
      }],
    });

    const buffer = await Packer.toBuffer(doc);
    fs.writeFileSync(filePath, buffer);
  }

  private async generatePdf(report: any, content: any, filePath: string) {
    return new Promise<void>((resolve, reject) => {
      const doc = new PDFDocument({ margin: 50 });
      const stream = fs.createWriteStream(filePath);

      doc.pipe(stream);

      const submission = this.extractManagerSubmission(content, report);
      if (submission) {
        doc.fontSize(14).text(submission.documentTitle, { align: 'center' });
        submission.headerLines.forEach((line) => {
          doc.fontSize(14).text(line, { align: 'center' });
        });
        doc.moveDown();
        doc.fontSize(14).text(submission.bodyText, { align: 'left' });
        doc.end();
        stream.on('finish', () => resolve());
        stream.on('error', reject);
        return;
      }

      doc.fontSize(20).text(
        report.reportType === 'weekly' ? 'Тижневий звіт' : 'Місячний звіт',
        { align: 'center' }
      );
      
      doc.fontSize(12).text(
        `${this.formatDate(report.periodStart)} - ${this.formatDate(report.periodEnd)}`,
        { align: 'center' }
      );

      doc.moveDown();
      doc.fontSize(12);
      doc.text(`Автор: ${report.author.firstName} ${report.author.lastName}`);
      doc.text(`Підрозділ: ${report.department?.nameUk || 'Не вказано'}`);
      doc.text(`Статус: ${this.getStatusLabel(report.status)}`);

      doc.moveDown();

      if (content) {
        if (content.workDone) {
          doc.fontSize(14).text('Виконана робота:');
          doc.fontSize(12).text(content.workDone);
          doc.moveDown();
        }

        if (content.achievements) {
          doc.fontSize(14).text('Досягнення:');
          doc.fontSize(12).text(content.achievements);
          doc.moveDown();
        }

        if (content.problems) {
          doc.fontSize(14).text('Проблеми:');
          doc.fontSize(12).text(content.problems);
          doc.moveDown();
        }

        if (content.nextWeekPlan) {
          doc.fontSize(14).text('План на наступний період:');
          doc.fontSize(12).text(content.nextWeekPlan);
        }
      }

      doc.end();

      stream.on('finish', () => resolve());
      stream.on('error', reject);
    });
  }

  private extractManagerSubmission(content: any, report: any) {
    const submission = content?.managerSubmission;
    if (!submission?.bodyText) return null;
    return {
      documentTitle: submission.documentTitle || 'ЗВІТ',
      headerLines: Array.isArray(submission.headerLines) ? submission.headerLines : [
        `Про виконання роботи ${report.department?.nameUk || report.department?.name || 'підрозділу'}`,
        `${new Date(report.periodEnd).getFullYear()} (станом на ${this.formatDate(report.periodEnd)})`,
      ],
      bodyText: String(submission.bodyText),
    };
  }

  private formatDate(date: Date): string {
    return new Date(date).toLocaleDateString('uk-UA', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    });
  }

  private getStatusLabel(status: string): string {
    const labels: Record<string, string> = {
      draft: 'Чернетка',
      pending_manager: 'Очікує погодження керівника',
      pending_director: 'Очікує затвердження',
      approved: 'Затверджено',
      rejected: 'Відхилено',
    };
    return labels[status] || status;
  }
}
