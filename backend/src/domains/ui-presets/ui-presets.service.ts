import { Injectable } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

export interface UiWidgetConfig {
  id: string;
  type: 'stat' | 'list' | 'chart' | 'action' | 'timeline';
  title: string;
  span: { col: number; row: number };
  dataSource?: string;
  variant?: string;
}

export interface UiLayoutConfig {
  id: string;
  grid: { columns: number; gap: number; rowHeight: number };
  widgets: UiWidgetConfig[];
}

export interface UiPresetConfig {
  query: string;
  category: string;
  pattern: string;
  style: {
    name: string;
    keywords: string;
    effects: string;
    bestFor: string;
  };
  colors: {
    primary: string;
    secondary: string;
    accent: string;
    background: string;
    text: string;
  };
  typography: {
    heading: string;
    body: string;
    mood: string;
  };
  effects: string[];
  antiPatterns: string[];
  layout: UiLayoutConfig;
}

@Injectable()
export class UiPresetsService {
  private readonly dataDir = this.resolveDataDir();
  private cache: Record<string, Record<string, string>[]> = {};

  getDesignSystem(query: string, role: string, page: string = 'dashboard'): UiPresetConfig {
    const category = this.findCategory(query);
    const reasoning = this.findReasoning(category);
    const style = this.selectBest('styles.csv', query, reasoning.stylePriority);
    const colors = this.selectBest('colors.csv', query, []);
    const typography = this.selectBest('typography.csv', query, []);
    const layout = this.buildLayout(role, page);

    return {
      query,
      category,
      pattern: reasoning.pattern || 'Hero + KPI + Insights',
      style: {
        name: style['Style Category'] || reasoning.stylePriority?.[0] || 'Bento Grid',
        keywords: style['Keywords'] || '',
        effects: style['Effects & Animation'] || reasoning.keyEffects || 'Soft glass and hover lift',
        bestFor: style['Best For'] || '',
      },
      colors: {
        primary: colors['Primary'] || '#4F46E5',
        secondary: colors['Secondary'] || '#22C55E',
        accent: colors['Accent'] || '#F97316',
        background: colors['Background'] || '#0B1220',
        text: colors['Text'] || '#E2E8F0',
      },
      typography: {
        heading: typography['Heading'] || typography['Heading Font'] || 'Space Grotesk',
        body: typography['Body'] || typography['Body Font'] || 'Manrope',
        mood: typography['Mood'] || 'Confident, premium',
      },
      effects: this.splitList(reasoning.keyEffects || style['Effects & Animation'] || ''),
      antiPatterns: this.splitList(reasoning.antiPatterns || ''),
      layout,
    };
  }

  private buildLayout(role: string, page: string): UiLayoutConfig {
    if (page === 'reports') {
      return {
        id: page,
        grid: { columns: 12, gap: 16, rowHeight: 120 },
        widgets: [
          { id: 'reports-stats', type: 'stat', title: 'Статус звітів', span: { col: 4, row: 1 }, dataSource: 'reports.stats' },
          { id: 'reports-list', type: 'list', title: 'Останні звіти', span: { col: 8, row: 2 }, dataSource: 'reports.list' },
          { id: 'reports-approvals', type: 'list', title: 'Погодження', span: { col: 6, row: 2 }, dataSource: 'reports.pending', variant: 'priority' },
          { id: 'reports-timeline', type: 'timeline', title: 'Хронологія', span: { col: 6, row: 2 }, dataSource: 'reports.timeline' },
        ],
      };
    }

    if (page === 'tasks') {
      return {
        id: page,
        grid: { columns: 12, gap: 16, rowHeight: 120 },
        widgets: [
          { id: 'tasks-stats', type: 'stat', title: 'Задачі', span: { col: 4, row: 1 }, dataSource: 'tasks.stats' },
          { id: 'tasks-list', type: 'list', title: 'Пріоритетні задачі', span: { col: 8, row: 2 }, dataSource: 'tasks.list' },
          { id: 'tasks-overdue', type: 'list', title: 'Ризики по дедлайнам', span: { col: 6, row: 2 }, dataSource: 'tasks.overdue' },
          { id: 'tasks-kanban', type: 'chart', title: 'Kanban Snapshot', span: { col: 6, row: 2 }, dataSource: 'tasks.kanban' },
        ],
      };
    }

    if (page !== 'dashboard') {
      return {
        id: page,
        grid: { columns: 12, gap: 16, rowHeight: 140 },
        widgets: [],
      };
    }

    const baseWidgets: UiWidgetConfig[] = [
      {
        id: 'stats-reports',
        type: 'stat',
        title: 'Звіти',
        span: { col: 4, row: 1 },
        dataSource: 'analytics.reports',
        variant: 'accent',
      },
      {
        id: 'stats-tasks',
        type: 'stat',
        title: 'Задачі',
        span: { col: 4, row: 1 },
        dataSource: 'analytics.tasks',
        variant: 'success',
      },
      {
        id: 'stats-overdue',
        type: 'stat',
        title: 'Просрочені',
        span: { col: 4, row: 1 },
        dataSource: 'analytics.overdue',
        variant: 'danger',
      },
      {
        id: 'recent-reports',
        type: 'list',
        title: 'Останні звіти',
        span: { col: 7, row: 2 },
        dataSource: 'analytics.recentReports',
      },
      {
        id: 'focus-tasks',
        type: 'list',
        title: 'Фокус на задачах',
        span: { col: 5, row: 2 },
        dataSource: 'analytics.overdueTasks',
        variant: 'compact',
      },
    ];

    if (role === 'manager' || role === 'director') {
      baseWidgets.unshift({
        id: 'pending-approvals',
        type: 'list',
        title: 'На погодженні',
        span: { col: 6, row: 2 },
        dataSource: 'analytics.pendingApprovals',
        variant: 'priority',
      });
    }

    return {
      id: 'dashboard',
      grid: { columns: 12, gap: 16, rowHeight: 140 },
      widgets: baseWidgets,
    };
  }

  private findCategory(query: string): string {
    const products = this.loadCsv('products.csv');
    const best = this.rankByQuery(products, query)[0];
    return best?.['Product Type'] || 'Enterprise Dashboard';
  }

  private findReasoning(category: string) {
    const rules = this.loadCsv('ui-reasoning.csv');
    const matched = rules.find(r => (r['UI_Category'] || '').toLowerCase() === category.toLowerCase());
    const fallback = matched || rules.find(r => category.toLowerCase().includes((r['UI_Category'] || '').toLowerCase()));

    return {
      pattern: fallback?.['Recommended_Pattern'] || 'Hero + KPIs + Insights',
      stylePriority: this.splitList(fallback?.['Style_Priority'] || '').map(v => v.replace('+', '').trim()),
      colorMood: fallback?.['Color_Mood'] || '',
      typographyMood: fallback?.['Typography_Mood'] || '',
      keyEffects: fallback?.['Key_Effects'] || '',
      antiPatterns: fallback?.['Anti_Patterns'] || '',
    };
  }

  private selectBest(file: string, query: string, priority: string[]) {
    const records = this.loadCsv(file);
    const ranked = this.rankByQuery(records, query, priority);
    return ranked[0] || {};
  }

  private rankByQuery(records: Record<string, string>[], query: string, priority: string[] = []) {
    const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
    const priorities = priority.map(p => p.toLowerCase());

    return [...records]
      .map(record => {
        const recordStr = Object.values(record).join(' ').toLowerCase();
        let score = 0;

        for (const token of tokens) {
          if (recordStr.includes(token)) score += 2;
        }

        for (const pr of priorities) {
          if (recordStr.includes(pr)) score += 6;
        }

        return { record, score };
      })
      .sort((a, b) => b.score - a.score)
      .map(item => item.record);
  }

  private loadCsv(fileName: string) {
    if (this.cache[fileName]) return this.cache[fileName];
    const filePath = path.join(this.dataDir, fileName);
    const content = fs.readFileSync(filePath, 'utf-8');
    const rows = this.parseCsv(content);
    this.cache[fileName] = rows;
    return rows;
  }

  private parseCsv(content: string): Record<string, string>[] {
    const lines = content.split(/\r?\n/).filter(line => line.trim().length > 0);
    if (!lines.length) return [];

    const headers = this.parseCsvLine(lines[0]);
    return lines.slice(1).map(line => {
      const values = this.parseCsvLine(line);
      return headers.reduce((acc, header, index) => {
        acc[header] = values[index] ?? '';
        return acc;
      }, {} as Record<string, string>);
    });
  }

  private parseCsvLine(line: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      const next = line[i + 1];

      if (char === '"') {
        if (inQuotes && next === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
        continue;
      }

      if (char === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
        continue;
      }

      current += char;
    }

    result.push(current.trim());
    return result;
  }

  private splitList(value: string): string[] {
    if (!value) return [];
    return value
      .split(/,|\+|\|/)
      .map(item => item.trim())
      .filter(Boolean);
  }

  private resolveDataDir() {
    const candidates = [
      path.join(process.cwd(), 'src', 'domains', 'ui-presets', 'data'),
      path.join(process.cwd(), 'dist', 'domains', 'ui-presets', 'data'),
      path.join(__dirname, 'data'),
    ];

    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) return candidate;
    }

    return path.join(__dirname, 'data');
  }
}
