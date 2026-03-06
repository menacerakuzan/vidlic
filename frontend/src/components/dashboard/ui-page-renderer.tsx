'use client'

import { motion } from 'framer-motion'
import type { UiLayoutConfig, UiPresetConfig, UiWidgetConfig } from '@/types/ui-config'
import { GlassCard } from '@/components/ui/glass-card'
import { ReportStatusBadge } from '@/components/reports/report-status-badge'

interface UiPageRendererProps {
  config: UiPresetConfig
  data: {
    reports?: any[]
    tasks?: any[]
  }
}

const cardVariants = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
}

export function UiPageRenderer({ config, data }: UiPageRendererProps) {
  const layout = config.layout

  return (
    <div className="bento-grid" style={{ gap: layout.grid.gap, gridAutoRows: `${layout.grid.rowHeight}px` }}>
      {layout.widgets.map((widget) => (
        <motion.div
          key={widget.id}
          variants={cardVariants}
          initial="initial"
          animate="animate"
          transition={{ duration: 0.25, ease: 'easeOut' }}
          className={`bento-item ${spanClass(widget.span.col, widget.span.row)}`}
        >
          <GlassCard className="h-full">
            {renderWidget(widget, data)}
          </GlassCard>
        </motion.div>
      ))}
    </div>
  )
}

function renderWidget(widget: UiWidgetConfig, data: UiPageRendererProps['data']) {
  if (widget.type === 'list') {
    return renderList(widget, data)
  }

  if (widget.type === 'stat') {
    return renderStat(widget, data)
  }

  if (widget.type === 'chart') {
    return renderChart(widget, data)
  }

  return (
    <div className="text-sm text-slate-500">Віджет у розробці</div>
  )
}

function renderStat(widget: UiWidgetConfig, data: UiPageRendererProps['data']) {
  const value = getStatValue(widget.dataSource, data)
  const subtitle = getStatSubtitle(widget.dataSource, data)

  return (
    <div className="flex h-full flex-col justify-between">
      <div>
        <p className="text-xs uppercase tracking-wide text-slate-500">{widget.title}</p>
        <p className="mt-3 text-3xl font-semibold text-slate-900 dark:text-white">{value}</p>
        {subtitle && <p className="mt-2 text-sm text-slate-500">{subtitle}</p>}
      </div>
      <p className="text-xs text-slate-400">Оновлено щойно</p>
    </div>
  )
}

function renderList(widget: UiWidgetConfig, data: UiPageRendererProps['data']) {
  const items = getListItems(widget.dataSource, data)

  return (
    <div className="flex h-full flex-col">
      <div>
        <p className="text-sm font-semibold text-slate-900 dark:text-white">{widget.title}</p>
        <p className="text-xs text-slate-500 mt-1">Актуальні позиції</p>
      </div>
      <div className="mt-4 space-y-3">
        {items.length === 0 && (
          <div className="rounded-xl border border-dashed border-slate-200 p-4 text-sm text-slate-500">
            Немає даних
          </div>
        )}
        {items.map((item) => (
          <div key={item.id} className="flex items-center justify-between rounded-xl bg-white/40 p-3">
            <div>
              <p className="text-sm font-medium text-slate-900 dark:text-white">{item.title}</p>
              <p className="text-xs text-slate-500 mt-1">{item.subtitle}</p>
            </div>
            {item.status && <ReportStatusBadge status={item.status} />}
          </div>
        ))}
      </div>
    </div>
  )
}

function renderChart(widget: UiWidgetConfig, data: UiPageRendererProps['data']) {
  const summary = getChartSummary(widget.dataSource, data)

  return (
    <div className="flex h-full flex-col">
      <div>
        <p className="text-sm font-semibold text-slate-900 dark:text-white">{widget.title}</p>
        <p className="text-xs text-slate-500 mt-1">Огляд у реальному часі</p>
      </div>
      <div className="mt-6 flex-1 rounded-2xl bg-gradient-to-br from-white/60 to-white/20 p-4">
        <p className="text-sm text-slate-500">Todo</p>
        <p className="text-2xl font-semibold text-slate-900 dark:text-white">{summary.todo}</p>
        <p className="text-sm text-slate-500 mt-4">In Progress</p>
        <p className="text-2xl font-semibold text-slate-900 dark:text-white">{summary.inProgress}</p>
        <p className="text-sm text-slate-500 mt-4">Done</p>
        <p className="text-2xl font-semibold text-slate-900 dark:text-white">{summary.done}</p>
      </div>
    </div>
  )
}

function getStatValue(source?: string, data?: UiPageRendererProps['data']) {
  if (!source) return '—'
  if (source.startsWith('reports')) return data?.reports?.length ?? 0
  if (source.startsWith('tasks')) return data?.tasks?.length ?? 0
  return '—'
}

function getStatSubtitle(source?: string, data?: UiPageRendererProps['data']) {
  if (!source) return ''
  if (source.startsWith('reports')) {
    const pending = data?.reports?.filter(r => r.status?.includes('pending')).length ?? 0
    return `${pending} на погодженні`
  }
  if (source.startsWith('tasks')) {
    const inProgress = data?.tasks?.filter(t => t.status === 'in_progress').length ?? 0
    return `${inProgress} в роботі`
  }
  return ''
}

function getListItems(source?: string, data?: UiPageRendererProps['data']) {
  if (!source) return []

  if (source === 'reports.list') {
    return (data?.reports || []).slice(0, 6).map((item) => ({
      id: item.id,
      title: item.title || (item.reportType === 'weekly' ? 'Тижневий звіт' : 'Місячний звіт'),
      subtitle: item.author ? `${item.author.firstName} ${item.author.lastName}` : 'Автор',
      status: item.status,
    }))
  }

  if (source === 'reports.pending') {
    return (data?.reports || []).filter(r => r.status?.includes('pending')).slice(0, 4).map((item) => ({
      id: item.id,
      title: item.title || 'Звіт',
      subtitle: 'Очікує погодження',
      status: item.status,
    }))
  }

  if (source === 'tasks.list') {
    return (data?.tasks || []).slice(0, 6).map((item) => ({
      id: item.id,
      title: item.title,
      subtitle: item.assignee ? `${item.assignee.firstName} ${item.assignee.lastName}` : 'Без виконавця',
    }))
  }

  if (source === 'tasks.overdue') {
    return (data?.tasks || []).filter(t => t.dueDate && t.status !== 'done').slice(0, 4).map((item) => ({
      id: item.id,
      title: item.title,
      subtitle: item.dueDate ? new Date(item.dueDate).toLocaleDateString('uk-UA') : 'Без дедлайну',
    }))
  }

  return []
}

function getChartSummary(source?: string, data?: UiPageRendererProps['data']) {
  if (source !== 'tasks.kanban') {
    return { todo: 0, inProgress: 0, done: 0 }
  }

  const tasks = data?.tasks || []
  return {
    todo: tasks.filter(t => t.status === 'todo').length,
    inProgress: tasks.filter(t => t.status === 'in_progress').length,
    done: tasks.filter(t => t.status === 'done').length,
  }
}

function spanClass(colSpan: number, rowSpan: number) {
  const colMap: Record<number, string> = {
    1: 'md:col-span-1',
    2: 'md:col-span-2',
    3: 'md:col-span-3',
    4: 'md:col-span-4',
    5: 'md:col-span-5',
    6: 'md:col-span-6',
    7: 'md:col-span-7',
    8: 'md:col-span-8',
    9: 'md:col-span-9',
    10: 'md:col-span-10',
    11: 'md:col-span-11',
    12: 'md:col-span-12',
  }
  const rowMap: Record<number, string> = {
    1: 'md:row-span-1',
    2: 'md:row-span-2',
    3: 'md:row-span-3',
    4: 'md:row-span-4',
    5: 'md:row-span-5',
    6: 'md:row-span-6',
  }

  return `${colMap[colSpan] || 'md:col-span-12'} ${rowMap[rowSpan] || 'md:row-span-1'}`
}
