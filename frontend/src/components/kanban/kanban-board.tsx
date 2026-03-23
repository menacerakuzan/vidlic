'use client'

import { useMemo } from 'react'
import { DndContext, DragEndEvent, useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GlassCard } from '@/components/ui/glass-card'

export interface KanbanTask {
  id: string
  title: string
  status: 'todo' | 'in_progress' | 'done'
  priority?: string
  dueDate?: string
  executionHours?: number | null
  isPrivate?: boolean
  reporter?: { firstName: string; lastName: string }
  assignee?: { firstName: string; lastName: string }
}

interface KanbanBoardProps {
  tasks: KanbanTask[]
  onStatusChange: (id: string, status: KanbanTask['status']) => void
}

const columns: { id: KanbanTask['status']; label: string; className: string }[] = [
  { id: 'todo', label: 'Заплановано', className: 'bg-slate-50 border-slate-200 dark:bg-slate-900/50 dark:border-slate-700' },
  { id: 'in_progress', label: 'В роботі', className: 'bg-amber-50 border-amber-200 dark:bg-amber-950/30 dark:border-amber-800/60' },
  { id: 'done', label: 'Виконано', className: 'bg-emerald-50 border-emerald-200 dark:bg-emerald-950/30 dark:border-emerald-800/60' },
]

export function KanbanBoard({ tasks, onStatusChange }: KanbanBoardProps) {
  const grouped = useMemo(() => {
    return columns.reduce((acc, col) => {
      acc[col.id] = tasks.filter(task => task.status === col.id)
      return acc
    }, {} as Record<KanbanTask['status'], KanbanTask[]>)
  }, [tasks])

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over) return

    const taskId = String(active.id)
    const overTask = tasks.find(t => t.id === String(over.id))
    const newStatus = (over.data.current?.status || overTask?.status) as KanbanTask['status'] | undefined

    if (!newStatus) return
    const task = tasks.find(t => t.id === taskId)
    if (!task || task.status === newStatus) return

    onStatusChange(taskId, newStatus)
  }

  return (
    <DndContext onDragEnd={handleDragEnd}>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {columns.map((column) => (
          <KanbanColumn key={column.id} status={column.id} title={column.label} className={column.className} tasks={grouped[column.id]} />
        ))}
      </div>
    </DndContext>
  )
}

function KanbanColumn({ status, title, className, tasks }: { status: KanbanTask['status']; title: string; className: string; tasks: KanbanTask[] }) {
  const { setNodeRef } = useDroppable({
    id: status,
    data: { status },
  })

  return (
    <div ref={setNodeRef}>
      <GlassCard className={`p-4 min-h-[360px] border ${className}`}>
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-slate-900 dark:text-white">{title}</p>
          <span className="text-xs text-slate-500">{tasks.length}</span>
        </div>
        <SortableContext items={tasks.map(t => t.id)} strategy={verticalListSortingStrategy}>
          <div className="mt-4 space-y-3">
            {tasks.map(task => (
              <KanbanCard key={task.id} task={task} />
            ))}
          </div>
        </SortableContext>
      </GlassCard>
    </div>
  )
}

function KanbanCard({ task }: { task: KanbanTask }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={
        `rounded-xl bg-white/80 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-700 px-4 py-3 text-sm text-slate-900 dark:text-slate-100 shadow-sm cursor-grab active:cursor-grabbing ${
          isDragging ? 'opacity-60' : ''
        }`
      }
    >
      <p className="font-medium">{task.title}</p>
      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
        {task.assignee ? `${task.assignee.firstName} ${task.assignee.lastName}` : 'Без виконавця'}
      </p>
      <p className="text-xs text-slate-500 dark:text-slate-400">
        Автор: {task.reporter ? `${task.reporter.firstName} ${task.reporter.lastName}` : '—'}
      </p>
      <p className="text-xs text-slate-500 dark:text-slate-400">
        Пріоритет: {task.priority || 'medium'}
        {task.executionHours ? ` · ${task.executionHours} год` : ''}
      </p>
      <p className="text-xs text-slate-500 dark:text-slate-400">
        Термін: {task.dueDate ? new Date(task.dueDate).toLocaleDateString('uk-UA') : 'не вказано'}
        {task.isPrivate ? ' · Приватна' : ''}
      </p>
    </div>
  )
}
