import { cn } from '@/lib/utils'
import type { ReactNode } from 'react'

export function GlassCard({
  className,
  children,
}: {
  className?: string
  children: ReactNode
}) {
  return (
    <div className={cn('glass-card apple-shadow-lg p-6', className)}>
      {children}
    </div>
  )
}
