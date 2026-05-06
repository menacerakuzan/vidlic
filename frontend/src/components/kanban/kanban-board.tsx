'use client'

import { useMemo, useState, useRef, useEffect } from 'react'
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
  departmentId?: string
  reporter?: { id: string; firstName: string; lastName: string }
  assignee?: { id: string; firstName: string; lastName: string }
}

export interface KanbanAssignee {
  id: string
  firstName: string
  lastName: string
  role: string
  department?: { id: string } | null
}

interface KanbanBoardProps {
  tasks: KanbanTask[]
  onStatusChange: (id: string, status: KanbanTask['status']) => void
  assignableUsers?: KanbanAssignee[]
  loads?: Record<string, number>
  currentUserId?: string
  currentUserRole?: string
  onReassign?: (taskId: string, assigneeId: string) => Promise<void>
}

const ROLE_ORDER: Record<string, number> = {
  deputy_director: 1,
  manager: 2,
  specialist: 3,
  clerk: 4,
  lawyer: 5,
  accountant: 6,
  hr: 7,
}

const ROLE_LABEL: Record<string, string> = {
  deputy_director: 'Зам. директора',
  manager: 'Керівник',
  specialist: 'Спеціаліст',
  clerk: 'Діловод',
  lawyer: 'Юрист',
  accountant: 'Бухгалтер',
  hr: 'HR',
  director: 'Директор',
}

const PRIORITY_COLOR: Record<string, string> = {
  critical: 'bg-rose-500',
  high: 'bg-orange-400',
  medium: 'bg-amber-400',
  low: 'bg-slate-300 dark:bg-slate-600',
}

const columns: { id: KanbanTask['status']; label: string; className: string }[] = [
  { id: 'todo', label: 'Активні', className: 'bg-slate-50 border-slate-200 dark:bg-slate-900/50 dark:border-slate-700' },
  { id: 'done', label: 'Виконано', className: 'bg-emerald-50 border-emerald-200 dark:bg-emerald-950/30 dark:border-emerald-800/60' },
]

export function KanbanBoard({ tasks, onStatusChange, assignableUsers = [], loads = {}, currentUserId, currentUserRole, onReassign }: KanbanBoardProps) {
  const grouped = useMemo(() => {
    return columns.reduce((acc, col) => {
      acc[col.id] = col.id === 'todo'
        ? tasks.filter(task => task.status === 'todo' || task.status === 'in_progress')
        : tasks.filter(task => task.status === col.id)
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
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {columns.map((column) => (
          <KanbanColumn
            key={column.id}
            status={column.id}
            title={column.label}
            className={column.className}
            tasks={grouped[column.id]}
            assignableUsers={assignableUsers}
            loads={loads}
            currentUserId={currentUserId}
            currentUserRole={currentUserRole}
            onReassign={onReassign}
          />
        ))}
      </div>
    </DndContext>
  )
}

function KanbanColumn({
  status, title, className, tasks, assignableUsers, loads, currentUserId, currentUserRole, onReassign,
}: {
  status: KanbanTask['status']
  title: string
  className: string
  tasks: KanbanTask[]
  assignableUsers: KanbanAssignee[]
  loads: Record<string, number>
  currentUserId?: string
  currentUserRole?: string
  onReassign?: (taskId: string, assigneeId: string) => Promise<void>
}) {
  const { setNodeRef } = useDroppable({ id: status, data: { status } })

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
              <KanbanCard
                key={task.id}
                task={task}
                assignableUsers={assignableUsers}
                loads={loads}
                currentUserId={currentUserId}
                currentUserRole={currentUserRole}
                onReassign={onReassign}
              />
            ))}
          </div>
        </SortableContext>
      </GlassCard>
    </div>
  )
}

function KanbanCard({
  task, assignableUsers, loads, currentUserId, currentUserRole, onReassign,
}: {
  task: KanbanTask
  assignableUsers: KanbanAssignee[]
  loads: Record<string, number>
  currentUserId?: string
  currentUserRole?: string
  onReassign?: (taskId: string, assigneeId: string) => Promise<void>
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id })
  const [showReassign, setShowReassign] = useState(false)
  const [selectedUserId, setSelectedUserId] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const popupRef = useRef<HTMLDivElement>(null)

  const style = { transform: CSS.Transform.toString(transform), transition }

  const canReassign = onReassign && currentUserRole && ['director', 'deputy_director', 'manager'].includes(currentUserRole)

  // Виконавці відфільтровані по департаменту задачі, відсортовані по ролях → навантаженню
  const candidates = useMemo(() => {
    return assignableUsers
      .filter(u => {
        if (u.id === task.assignee?.id) return false
        if (task.departmentId && u.department?.id !== task.departmentId) return false
        if (currentUserRole === 'manager' && u.role === 'director') return false
        // director не може передати вище директора
        if (['director', 'deputy_director'].includes(currentUserRole || '') && u.role === 'director') return false
        return true
      })
      .sort((a, b) => {
        const roleA = ROLE_ORDER[a.role] ?? 99
        const roleB = ROLE_ORDER[b.role] ?? 99
        if (roleA !== roleB) return roleA - roleB
        return (loads[a.id] || 0) - (loads[b.id] || 0)
      })
  }, [assignableUsers, task.assignee?.id, task.departmentId, currentUserRole, loads])

  // Групування по ролях для відображення
  const candidatesByRole = useMemo(() => {
    const groups = new Map<string, KanbanAssignee[]>()
    for (const u of candidates) {
      const existing = groups.get(u.role) || []
      existing.push(u)
      groups.set(u.role, existing)
    }
    return groups
  }, [candidates])

  useEffect(() => {
    if (!showReassign) return
    const handler = (e: MouseEvent) => {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) {
        setShowReassign(false)
        setSelectedUserId('')
        setError('')
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showReassign])

  const handleReassign = async () => {
    if (!selectedUserId || !onReassign) return
    setSaving(true)
    setError('')
    try {
      await onReassign(task.id, selectedUserId)
      setShowReassign(false)
      setSelectedUserId('')
    } catch {
      setError('Не вдалося передати задачу')
    } finally {
      setSaving(false)
    }
  }

  const isOverdue = task.dueDate && task.status !== 'done' && new Date(task.dueDate) < new Date()

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`relative rounded-xl bg-white/80 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-700 text-sm text-slate-900 dark:text-slate-100 shadow-sm ${isDragging ? 'opacity-60' : ''}`}
    >
      {/* Drag area — вся картка окрім кнопки */}
      <div
        {...attributes}
        {...listeners}
        className="px-4 pt-3 pb-2 cursor-grab active:cursor-grabbing"
      >
        {/* Priority dot + title */}
        <div className="flex items-start gap-2">
          <span className={`mt-1.5 shrink-0 w-2 h-2 rounded-full ${PRIORITY_COLOR[task.priority || 'medium']}`} />
          <p className="font-medium leading-snug">{task.title}</p>
        </div>

        <div className="mt-2 space-y-0.5 pl-4">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {task.assignee
              ? `${task.assignee.firstName} ${task.assignee.lastName}${loads[task.assignee.id] !== undefined ? ` · ${loads[task.assignee.id]} задач` : ''}`
              : 'Без виконавця'}
          </p>
          {task.reporter && (
            <p className="text-xs text-slate-400 dark:text-slate-500">
              Автор: {task.reporter.firstName} {task.reporter.lastName}
            </p>
          )}
          <p className={`text-xs ${isOverdue ? 'text-rose-500 font-medium' : 'text-slate-400 dark:text-slate-500'}`}>
            {task.dueDate
              ? `${isOverdue ? 'Прострочено: ' : 'Термін: '}${new Date(task.dueDate).toLocaleDateString('uk-UA')}`
              : 'Термін не вказано'}
            {task.executionHours ? ` · ${task.executionHours} год` : ''}
            {task.isPrivate ? ' · Приватна' : ''}
          </p>
        </div>
      </div>

      {/* Кнопка "Передати" — не є частиною drag area */}
      {canReassign && task.status !== 'done' && (
        <div className="px-4 pb-3 pl-8">
          <button
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation()
              setShowReassign((v) => !v)
              setSelectedUserId('')
              setError('')
            }}
            className="text-xs text-primary hover:underline"
          >
            Передати задачу
          </button>
        </div>
      )}

      {/* Попап вибору виконавця */}
      {showReassign && (
        <div
          ref={popupRef}
          onPointerDown={(e) => e.stopPropagation()}
          className="absolute left-0 right-0 top-full mt-1 z-50 rounded-xl border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-900 overflow-hidden"
        >
          <div className="px-3 py-2 border-b border-slate-100 dark:border-slate-800">
            <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">Передати задачу</p>
          </div>

          {candidates.length === 0 ? (
            <p className="px-3 py-3 text-xs text-slate-500">Немає доступних виконавців</p>
          ) : (
            <div className="max-h-56 overflow-y-auto">
              {Array.from(candidatesByRole.entries()).map(([role, users]) => (
                <div key={role}>
                  <div className="px-3 py-1 text-xs font-semibold text-slate-400 uppercase tracking-wide bg-slate-50 dark:bg-slate-800/60">
                    {ROLE_LABEL[role] || role}
                  </div>
                  {users.map(u => {
                    const active = loads[u.id] || 0
                    const isSelected = selectedUserId === u.id
                    return (
                      <button
                        key={u.id}
                        onClick={() => setSelectedUserId(isSelected ? '' : u.id)}
                        className={`w-full text-left px-3 py-2 text-xs flex items-center justify-between gap-2 hover:bg-slate-50 dark:hover:bg-slate-800 border-t border-slate-100 dark:border-slate-800 ${isSelected ? 'bg-primary/5 dark:bg-primary/10' : ''}`}
                      >
                        <span className={isSelected ? 'font-semibold text-primary' : ''}>
                          {u.firstName} {u.lastName}
                        </span>
                        <span className={`shrink-0 text-xs rounded-full px-1.5 py-0.5 ${active >= 5 ? 'bg-rose-100 text-rose-600 dark:bg-rose-950/40 dark:text-rose-400' : active >= 3 ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400' : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400'}`}>
                          {active} задач
                        </span>
                      </button>
                    )
                  })}
                </div>
              ))}
            </div>
          )}

          {error && (
            <p className="px-3 py-1.5 text-xs text-rose-600 border-t border-slate-100 dark:border-slate-800">{error}</p>
          )}

          <div className="px-3 py-2 border-t border-slate-100 dark:border-slate-800 flex gap-2">
            <button
              onClick={handleReassign}
              disabled={!selectedUserId || saving}
              className="flex-1 h-8 rounded-lg bg-primary text-white text-xs font-medium disabled:opacity-50"
            >
              {saving ? 'Передаємо...' : 'Підтвердити'}
            </button>
            <button
              onClick={() => { setShowReassign(false); setSelectedUserId(''); setError('') }}
              className="h-8 px-3 rounded-lg border border-slate-300 text-xs dark:border-slate-700"
            >
              Скасувати
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
