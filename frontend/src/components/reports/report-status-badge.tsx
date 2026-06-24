'use client'

import { cn } from '@/lib/utils'

// Diia status tags — pill shape, subtle tinted background, functional color coding
const statusMap: Record<string, { label: string; className: string }> = {
  draft: { label: 'Чернетка', className: 'bg-muted text-muted-foreground' },
  pending_manager: { label: 'Погодження керівника', className: 'bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300' },
  pending_clerk: { label: 'Погодження діловода', className: 'bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300' },
  pending_director: { label: 'Погодження директора', className: 'bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300' },
  approved: { label: 'Затверджено', className: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300' },
  rejected: { label: 'Повернено', className: 'bg-destructive/10 text-destructive' },
}

export function ReportStatusBadge({ status }: { status: string }) {
  const meta = statusMap[status] || { label: status, className: 'bg-muted text-muted-foreground' }

  return (
    <span className={cn('inline-flex items-center rounded-full px-3 py-1 text-xs font-medium leading-none', meta.className)}>
      {meta.label}
    </span>
  )
}
