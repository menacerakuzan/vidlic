'use client'

import { AnimatePresence, motion } from 'framer-motion'
import { cn } from '@/lib/utils'

const statusMap: Record<string, { label: string; className: string }> = {
  draft: { label: 'Чернетка', className: 'bg-slate-200 text-slate-700' },
  pending_manager: { label: 'На погодженні', className: 'bg-amber-200 text-amber-800' },
  pending_director: { label: 'Фінальне погодження', className: 'bg-indigo-200 text-indigo-800' },
  approved: { label: 'Затверджено', className: 'bg-emerald-200 text-emerald-800' },
  rejected: { label: 'Відхилено', className: 'bg-rose-200 text-rose-800' },
}

export function ReportStatusBadge({ status }: { status: string }) {
  const meta = statusMap[status] || { label: status, className: 'bg-slate-200 text-slate-700' }

  return (
    <AnimatePresence mode="wait">
      <motion.span
        key={status}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -6 }}
        transition={{ duration: 0.2 }}
        className={cn('inline-flex items-center rounded-full px-3 py-1 text-xs font-medium', meta.className)}
      >
        {meta.label}
      </motion.span>
    </AnimatePresence>
  )
}
