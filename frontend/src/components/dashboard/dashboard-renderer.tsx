'use client'

import { motion } from 'framer-motion'
import { GlassCard } from '@/components/ui/glass-card'
import type { UiLayoutConfig, UiPresetConfig, UiWidgetConfig } from '@/types/ui-config'
import { ArrowUpRight, CheckCircle2, Clock, FileText, TrendingUp } from 'lucide-react'
import Link from 'next/link'

interface DashboardRendererProps {
  config: UiPresetConfig
  analytics?: any
}

const iconMap = {
  reports: FileText,
  tasks: CheckCircle2,
  overdue: Clock,
  trend: TrendingUp,
}

const cardVariants = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
}

export function DashboardRenderer({ config, analytics }: DashboardRendererProps) {
  const layout = config.layout

  return (
    <div
      className="bento-grid"
      style={{ gap: layout.grid.gap, gridAutoRows: `${layout.grid.rowHeight}px` }}
    >
      {layout.widgets.map((widget) => (
        <WidgetCard key={widget.id} widget={widget} analytics={analytics} />
      ))}
    </div>
  )
}

function WidgetCard({ widget, analytics }: { widget: UiWidgetConfig; analytics?: any }) {
  const colSpan = Math.min(12, Math.max(1, widget.span.col))
  const rowSpan = Math.max(1, widget.span.row)

  return (
    <motion.div
      variants={cardVariants}
      initial="initial"
      animate="animate"
      transition={{ duration: 0.25, ease: 'easeOut' }}
      className={`bento-item ${spanClass(colSpan, rowSpan)}`}
    >
      <GlassCard className="h-full">
        {renderWidget(widget, analytics)}
      </GlassCard>
    </motion.div>
  )
}

function renderWidget(widget: UiWidgetConfig, analytics?: any) {
  switch (widget.type) {
    case 'stat':
      return <StatWidget widget={widget} analytics={analytics} />
    case 'list':
      return <ListWidget widget={widget} analytics={analytics} />
    default:
      return <EmptyWidget widget={widget} />
  }
}

function StatWidget({ widget, analytics }: { widget: UiWidgetConfig; analytics?: any }) {
  const value = resolveStatValue(widget.dataSource, analytics)
  const Icon = resolveIcon(widget.dataSource)
  const subtitle = resolveStatSubtitle(widget.dataSource, analytics)

  return (
    <div className="flex h-full flex-col justify-between">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-500">{widget.title}</p>
          <p className="mt-2 text-3xl font-semibold text-slate-900 dark:text-white">{value}</p>
          {subtitle && <p className="text-sm text-slate-500 mt-2">{subtitle}</p>}
        </div>
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/50 text-primary shadow-inner">
          <Icon className="h-6 w-6" />
        </div>
      </div>
      <div className="mt-4 flex items-center text-xs text-slate-500">
        <span className="mr-2 inline-flex h-2 w-2 rounded-full bg-emerald-400" />
        Дані оновлюються автоматично
      </div>
    </div>
  )
}

function ListWidget({ widget, analytics }: { widget: UiWidgetConfig; analytics?: any }) {
  const items = resolveListItems(widget.dataSource, analytics)

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-slate-900 dark:text-white">{widget.title}</p>
          <p className="text-xs text-slate-500 mt-1">Останні оновлення</p>
        </div>
        <Link href="/dashboard/reports" className="text-xs text-primary inline-flex items-center">
          Перейти
          <ArrowUpRight className="h-3 w-3 ml-1" />
        </Link>
      </div>
      <div className="mt-4 space-y-3">
        {items.length === 0 && (
          <div className="rounded-xl border border-dashed border-slate-200 p-4 text-sm text-slate-500">
            Немає даних для відображення
          </div>
        )}
        {items.map((item: any) => (
          <div key={item.id} className="flex items-center justify-between rounded-xl bg-white/40 p-3">
            <div>
              <p className="text-sm font-medium text-slate-900 dark:text-white">{item.title}</p>
              <p className="text-xs text-slate-500 mt-1">{item.subtitle}</p>
            </div>
            <span className="text-xs text-slate-400">{item.meta}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function EmptyWidget({ widget }: { widget: UiWidgetConfig }) {
  return (
    <div className="flex h-full flex-col items-start justify-between">
      <p className="text-sm font-semibold text-slate-900 dark:text-white">{widget.title}</p>
      <p className="text-xs text-slate-500">Віджет у розробці</p>
    </div>
  )
}

function resolveStatValue(source?: string, analytics?: any) {
  if (!source || !analytics) return '—'
  if (source.includes('reports')) return analytics?.reports?.total ?? '—'
  if (source.includes('tasks')) return analytics?.tasks?.total ?? '—'
  if (source.includes('overdue')) return analytics?.tasks?.overdue ?? '—'
  return '—'
}

function resolveStatSubtitle(source?: string, analytics?: any) {
  if (!source || !analytics) return ''
  if (source.includes('reports')) return `${analytics?.reports?.byStatus?.pending_manager ?? 0} на погодженні`
  if (source.includes('tasks')) return `${analytics?.tasks?.byStatus?.in_progress ?? 0} в роботі`
  if (source.includes('overdue')) return 'Потребують уваги'
  return ''
}

function resolveListItems(source?: string, analytics?: any) {
  if (!source || !analytics) return []

  if (source.includes('pendingApprovals')) {
    return (analytics.pendingApprovals?.items || []).map((item: any) => ({
      id: item.id,
      title: item.title || 'Звіт без назви',
      subtitle: `${item.author} • ${item.department || 'Підрозділ'}`,
      meta: new Date(item.submittedAt || item.createdAt || Date.now()).toLocaleDateString('uk-UA'),
    }))
  }

  if (source.includes('recentReports')) {
    return (analytics.recentReports || []).map((item: any) => ({
      id: item.id,
      title: item.title || item.type,
      subtitle: `${item.author} • ${item.status}`,
      meta: new Date(item.createdAt).toLocaleDateString('uk-UA'),
    }))
  }

  if (source.includes('overdueTasks')) {
    return (analytics.overdueTasks || []).map((item: any) => ({
      id: item.id,
      title: item.title,
      subtitle: item.assignee || 'Без виконавця',
      meta: new Date(item.dueDate).toLocaleDateString('uk-UA'),
    }))
  }

  return []
}

function resolveIcon(source?: string) {
  if (!source) return FileText
  if (source.includes('tasks')) return iconMap.tasks
  if (source.includes('overdue')) return iconMap.overdue
  return iconMap.reports
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
