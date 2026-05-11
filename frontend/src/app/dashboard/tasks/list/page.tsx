'use client'

import { useEffect, useMemo, useState } from 'react'
import { DashboardLayout } from '@/components/dashboard-layout'
import { AnimatePresence, motion } from 'framer-motion'
import { extractApiErrorMessage } from '@/lib/error-message'
import { useAuthStore } from '@/store/auth-store'

type Task = {
  id: string
  title: string
  description?: string
  status: 'todo' | 'in_progress' | 'done'
  dueDate?: string
  assignee?: { id: string; firstName: string; lastName: string } | null
  reporter?: { id: string; firstName: string; lastName: string } | null
  department?: { id: string; name?: string; nameUk?: string } | null
  createdAt?: string
  startedAt?: string | null
  coAssigneeIds?: string[]
}

type TeamUser = {
  id: string
  firstName: string
  lastName: string
  role: string
  department?: {
    id: string
    name?: string
    nameUk?: string
  } | null
}

type DepartmentOption = {
  id: string
  name?: string
  nameUk?: string
}

function urgencyLevel(task: Task): 'overdue' | 'critical' | 'soon' | 'normal' {
  if (task.status === 'done') return 'normal'
  if (!task.dueDate) return 'normal'
  const now = Date.now()
  const due = new Date(task.dueDate).getTime()
  const hoursLeft = (due - now) / 3_600_000
  if (hoursLeft < 0) return 'overdue'
  if (hoursLeft < 24) return 'critical'
  if (hoursLeft < 72) return 'soon'
  return 'normal'
}

function UrgencyBadge({ level }: { level: ReturnType<typeof urgencyLevel> }) {
  if (level === 'overdue') return (
    <span className="inline-flex shrink-0 items-center rounded-full bg-rose-500 px-1.5 py-0.5 text-[10px] font-bold text-white whitespace-nowrap">
      Прострочено
    </span>
  )
  if (level === 'critical') return (
    <span className="inline-flex shrink-0 items-center rounded-full bg-orange-500 px-1.5 py-0.5 text-[10px] font-bold text-white whitespace-nowrap">
      &lt;24 год
    </span>
  )
  if (level === 'soon') return (
    <span className="inline-flex shrink-0 items-center rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 whitespace-nowrap">
      &lt;3 дні
    </span>
  )
  return null
}

export default function TaskListPage() {
  const { user } = useAuthStore()
  const [tasks, setTasks] = useState<Task[]>([])
  const [users, setUsers] = useState<TeamUser[]>([])
  const [departments, setDepartments] = useState<DepartmentOption[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedTaskId, setSelectedTaskId] = useState('')
  const [deletingTaskId, setDeletingTaskId] = useState('')
  const [reassigningTaskId, setReassigningTaskId] = useState('')
  const [updatingStatusTaskId, setUpdatingStatusTaskId] = useState('')
  const [selectedAssignees, setSelectedAssignees] = useState<Record<string, string>>({})
  const [selectedStatuses, setSelectedStatuses] = useState<Record<string, Task['status']>>({})
  const [actionToast, setActionToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [filterDepartmentId, setFilterDepartmentId] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterUrgency, setFilterUrgency] = useState('')
  const [editMode, setEditMode] = useState(false)
  const [editTitle, setEditTitle] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [editDueDate, setEditDueDate] = useState('')
  const [savingEdit, setSavingEdit] = useState(false)
  const accessToken = typeof window !== 'undefined' ? localStorage.getItem('vidlik-accessToken') : null

  const loadTasks = async () => {
    if (!accessToken) return
    setLoading(true)
    setError('')

    const all: Task[] = []
    const pageSize = 100
    let page = 1

    while (page <= 10) {
      const params = new URLSearchParams()
      params.set('limit', String(pageSize))
      params.set('page', String(page))

      const resp = await fetch(`/api/v1/tasks?${params.toString()}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      })

      if (!resp.ok) {
        const err = await resp.json().catch(() => null)
        setError(extractApiErrorMessage(resp.status, err, 'Не вдалося завантажити задачі.'))
        setLoading(false)
        return
      }

      const data = await resp.json()
      const chunk = Array.isArray(data?.data) ? data.data : []
      all.push(...chunk)
      if (chunk.length < pageSize) break
      page += 1
    }

    setTasks(all)
    setLoading(false)
  }

  const loadUsers = async () => {
    if (!accessToken) return
    const resp = await fetch('/api/v1/users?limit=100', {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (!resp.ok) return
    const data = await resp.json()
    const list = Array.isArray(data?.data) ? data.data : []
    setUsers(list)
  }

  useEffect(() => {
    if (!accessToken) return
    fetch('/api/v1/departments', { headers: { Authorization: `Bearer ${accessToken}` } })
      .then((r) => r.json())
      .then((data) => setDepartments(Array.isArray(data) ? data : []))
      .catch(() => {})
  }, [accessToken])

  useEffect(() => {
    loadTasks()
    loadUsers()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken])

  useEffect(() => {
    if (selectedTaskId) return
    if (tasks.length > 0) setSelectedTaskId(tasks[0].id)
  }, [tasks, selectedTaskId])

  useEffect(() => {
    setEditMode(false)
  }, [selectedTaskId])

  const deleteTask = async (id: string) => {
    if (!accessToken) return
    const ok = window.confirm('Видалити задачу?')
    if (!ok) return

    setDeletingTaskId(id)
    const resp = await fetch(`/api/v1/tasks/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    setDeletingTaskId('')

    if (resp.ok) {
      await loadTasks()
      setActionToast({ type: 'success', message: 'Задачу видалено' })
      return
    }

    const err = await resp.json().catch(() => null)
    const message = extractApiErrorMessage(resp.status, err, 'Не вдалося видалити задачу')
    setError(message)
    setActionToast({ type: 'error', message })
  }

  const reassignTask = async (taskId: string) => {
    const assigneeId = selectedAssignees[taskId]
    if (!accessToken || !assigneeId) return
    setReassigningTaskId(taskId)
    const resp = await fetch(`/api/v1/tasks/${taskId}`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ assigneeId }),
    })
    setReassigningTaskId('')
    if (resp.ok) {
      await loadTasks()
      setSelectedAssignees((prev) => ({ ...prev, [taskId]: '' }))
      setActionToast({ type: 'success', message: 'Задачу перенаправлено' })
      return
    }
    const err = await resp.json().catch(() => null)
    const message = extractApiErrorMessage(resp.status, err, 'Не вдалося перенаправити задачу')
    setError(message)
    setActionToast({ type: 'error', message })
  }

  const updateTaskStatus = async (taskId: string) => {
    const status = selectedStatuses[taskId]
    if (!accessToken || !status) return
    setUpdatingStatusTaskId(taskId)
    const resp = await fetch(`/api/v1/tasks/${taskId}/status`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ status }),
    })
    setUpdatingStatusTaskId('')
    if (resp.ok) {
      await loadTasks()
      setActionToast({ type: 'success', message: status === 'in_progress' ? 'Задачу взято в роботу' : 'Статус задачі оновлено' })
      return
    }
    const err = await resp.json().catch(() => null)
    const message = extractApiErrorMessage(resp.status, err, 'Не вдалося змінити статус задачі')
    setError(message)
    setActionToast({ type: 'error', message })
  }

  const openEdit = (task: Task) => {
    setEditTitle(task.title)
    setEditDescription(task.description || '')
    setEditDueDate(task.dueDate ? new Date(task.dueDate).toISOString().slice(0, 16) : '')
    setEditMode(true)
  }

  const saveEdit = async (taskId: string) => {
    if (!accessToken || !editTitle.trim()) return
    setSavingEdit(true)
    const payload: any = {
      title: editTitle.trim(),
      description: editDescription.trim() || undefined,
    }
    if (editDueDate) {
      payload.dueDate = editDueDate
    } else {
      payload.dueDate = null
    }
    const resp = await fetch(`/api/v1/tasks/${taskId}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    setSavingEdit(false)
    if (resp.ok) {
      setEditMode(false)
      await loadTasks()
      setActionToast({ type: 'success', message: 'Задачу оновлено' })
      return
    }
    const err = await resp.json().catch(() => null)
    setActionToast({ type: 'error', message: extractApiErrorMessage(resp.status, err, 'Не вдалося оновити задачу') })
  }

  useEffect(() => {
    if (!actionToast) return
    const timer = window.setTimeout(() => setActionToast(null), 2200)
    return () => window.clearTimeout(timer)
  }, [actionToast])

  const urgencyOrder = { overdue: 0, critical: 1, soon: 2, normal: 3 }

  const orderedTasks = useMemo(() => {
    return [...tasks]
      .filter((t) => {
        if (filterDepartmentId && t.department?.id !== filterDepartmentId) return false
        if (filterStatus && t.status !== filterStatus) return false
        if (filterUrgency && urgencyLevel(t) !== filterUrgency) return false
        return true
      })
      .sort((a, b) => {
        const ua = urgencyOrder[urgencyLevel(a)]
        const ub = urgencyOrder[urgencyLevel(b)]
        if (ua !== ub) return ua - ub
        if (a.status !== b.status) {
          const order = { todo: 0, in_progress: 1, done: 2 }
          return order[a.status] - order[b.status]
        }
        const aDue = a.dueDate ? new Date(a.dueDate).getTime() : Number.POSITIVE_INFINITY
        const bDue = b.dueDate ? new Date(b.dueDate).getTime() : Number.POSITIVE_INFINITY
        return aDue - bDue
      })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks, filterDepartmentId, filterStatus, filterUrgency])

  const selectedTask = useMemo(
    () => orderedTasks.find((task) => task.id === selectedTaskId) || orderedTasks[0] || null,
    [orderedTasks, selectedTaskId],
  )

  const statusBadge = (status: Task['status']) => {
    if (status === 'todo') return 'bg-sky-100 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300'
    if (status === 'in_progress') return 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300'
    return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
  }

  const statusLabel = (status: Task['status']) => {
    if (status === 'todo') return 'Нове'
    if (status === 'in_progress') return 'В роботі'
    return 'Виконано'
  }

  const sidebarBorderClass = (task: Task, isSelected: boolean) => {
    const u = urgencyLevel(task)
    if (u === 'overdue') return isSelected ? 'bg-rose-50 dark:bg-rose-950/30 border-l-4 border-l-rose-500' : 'border-l-4 border-l-rose-400 hover:bg-rose-50/50 dark:hover:bg-rose-950/20'
    if (u === 'critical') return isSelected ? 'bg-orange-50 dark:bg-orange-950/20 border-l-4 border-l-orange-500' : 'border-l-4 border-l-orange-400 hover:bg-orange-50/50 dark:hover:bg-orange-950/20'
    if (u === 'soon') return isSelected ? 'bg-amber-50 dark:bg-amber-950/20 border-l-4 border-l-amber-400' : 'border-l-4 border-l-amber-300 hover:bg-amber-50/40 dark:hover:bg-amber-950/10'
    return isSelected ? 'bg-slate-100 dark:bg-slate-800/70' : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
  }

  const hasActiveFilters = filterDepartmentId || filterStatus || filterUrgency

  return (
    <DashboardLayout>
      <div className="max-w-7xl mx-auto space-y-6">
        <AnimatePresence>
          {actionToast && (
            <motion.div
              initial={{ opacity: 0, y: -12, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -12, scale: 0.98 }}
              transition={{ duration: 0.22 }}
              className={`fixed right-5 top-5 z-[100] rounded-xl px-4 py-2 text-sm font-medium shadow-lg ${
                actionToast.type === 'success'
                  ? 'border border-emerald-200 bg-emerald-50 text-emerald-700'
                  : 'border border-rose-200 bg-rose-50 text-rose-700'
              }`}
            >
              {actionToast.message}
            </motion.div>
          )}
        </AnimatePresence>

        <div>
          <h1 className="text-2xl font-semibold font-display">Список задач</h1>
          <p className="text-slate-500 mt-1">Усі задачі у вигляді списку</p>
        </div>

        {/* Filters */}
        <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <select
              value={filterDepartmentId}
              onChange={(e) => setFilterDepartmentId(e.target.value)}
              className="h-10 rounded-lg border border-slate-300 px-3 text-sm bg-white text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
            >
              <option value="">Усі відділи</option>
              {departments.map((dep) => (
                <option key={dep.id} value={dep.id}>{dep.nameUk || dep.name || dep.id}</option>
              ))}
            </select>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="h-10 rounded-lg border border-slate-300 px-3 text-sm bg-white text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
            >
              <option value="">Усі статуси</option>
              <option value="todo">Нове</option>
              <option value="in_progress">В роботі</option>
              <option value="done">Виконано</option>
            </select>
            <select
              value={filterUrgency}
              onChange={(e) => setFilterUrgency(e.target.value)}
              className="h-10 rounded-lg border border-slate-300 px-3 text-sm bg-white text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
            >
              <option value="">Усі терміновості</option>
              <option value="overdue">🔴 Прострочено</option>
              <option value="critical">🟠 Менш ніж 24 год</option>
              <option value="soon">🟡 Менш ніж 3 дні</option>
              <option value="normal">Без загрози</option>
            </select>
            {hasActiveFilters && (
              <button
                onClick={() => { setFilterDepartmentId(''); setFilterStatus(''); setFilterUrgency('') }}
                className="h-10 rounded-lg border border-slate-300 text-sm dark:border-slate-600"
              >
                Скинути фільтри
              </button>
            )}
          </div>
        </div>

        {error && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-800 dark:bg-rose-950/30 dark:text-rose-300">
            {error}
          </div>
        )}

        <div className="rounded-2xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900 overflow-hidden">
          {loading ? (
            <div className="px-4 py-6 text-sm text-slate-500 dark:text-slate-400">Завантаження...</div>
          ) : orderedTasks.length === 0 ? (
            <div className="px-4 py-6 text-sm text-slate-500 dark:text-slate-400">
              {hasActiveFilters ? 'Немає задач з обраними фільтрами.' : 'Задач поки немає.'}
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] min-h-[520px]">
              {/* Sidebar list */}
              <div className="border-r border-slate-200 dark:border-slate-700 max-h-[70vh] overflow-y-auto">
                {orderedTasks.map((task, idx) => {
                  const isSelected = selectedTask?.id === task.id
                  const u = urgencyLevel(task)
                  return (
                    <button
                      key={task.id}
                      onClick={() => setSelectedTaskId(task.id)}
                      className={`w-full text-left px-4 py-3 border-b border-slate-100 dark:border-slate-800 transition-colors ${sidebarBorderClass(task, isSelected)}`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-start gap-2 flex-1 min-w-0">
                          <span className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 mt-0.5 shrink-0 w-5 text-right">{idx + 1}</span>
                          <p className="text-sm font-medium text-slate-900 dark:text-slate-100 line-clamp-2 flex-1">{task.title}</p>
                        </div>
                        {u !== 'normal' && <UrgencyBadge level={u} />}
                      </div>
                      {task.dueDate && u !== 'normal' && (
                        <p className={`text-xs mt-0.5 ${u === 'overdue' ? 'text-rose-600' : u === 'critical' ? 'text-orange-600' : 'text-amber-600'}`}>
                          {u === 'overdue' ? 'Прострочено: ' : 'Термін: '}
                          {new Date(task.dueDate).toLocaleDateString('uk-UA')}
                        </p>
                      )}
                    </button>
                  )
                })}
              </div>

              {/* Detail panel */}
              <div className="p-4">
                {!selectedTask ? (
                  <p className="text-sm text-slate-500 dark:text-slate-400">Оберіть задачу зі списку.</p>
                ) : (
                  <div className="space-y-3">
                    {editMode ? (
                      <div className="space-y-3">
                        <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">Редагування задачі</p>
                        <textarea
                          value={editTitle}
                          onChange={(e) => setEditTitle(e.target.value)}
                          rows={2}
                          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 resize-none"
                          placeholder="Назва задачі"
                        />
                        <textarea
                          value={editDescription}
                          onChange={(e) => setEditDescription(e.target.value)}
                          rows={4}
                          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 resize-none"
                          placeholder="Опис (необов'язково)"
                        />
                        <div>
                          <label className="block text-xs text-slate-500 mb-1">Дедлайн</label>
                          <input
                            type="datetime-local"
                            value={editDueDate}
                            onChange={(e) => setEditDueDate(e.target.value)}
                            className="h-9 rounded-lg border border-slate-300 px-3 text-sm bg-white text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                          />
                          {editDueDate && (
                            <button
                              onClick={() => setEditDueDate('')}
                              className="ml-2 text-xs text-slate-500 underline"
                            >
                              Прибрати дедлайн
                            </button>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => saveEdit(selectedTask.id)}
                            disabled={savingEdit || !editTitle.trim()}
                            className="rounded-lg bg-primary px-4 py-1.5 text-xs font-medium text-white disabled:opacity-60"
                          >
                            {savingEdit ? 'Збереження...' : 'Зберегти'}
                          </button>
                          <button
                            onClick={() => setEditMode(false)}
                            className="rounded-lg border border-slate-300 px-4 py-1.5 text-xs dark:border-slate-600"
                          >
                            Скасувати
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-start justify-between gap-3">
                          <p className="text-lg font-semibold text-slate-900 dark:text-slate-100">{selectedTask.title}</p>
                          <div className="flex items-center gap-2 shrink-0">
                            <UrgencyBadge level={urgencyLevel(selectedTask)} />
                            <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${statusBadge(selectedTask.status)}`}>
                              {statusLabel(selectedTask.status)}
                            </span>
                          </div>
                        </div>

                        {selectedTask.description && (
                          <p className="text-sm whitespace-pre-wrap text-slate-600 dark:text-slate-300">{selectedTask.description}</p>
                        )}

                        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs space-y-1 dark:border-slate-700 dark:bg-slate-800/50">
                          <p className="text-slate-600 dark:text-slate-300">
                            <span className="font-medium">Виконавець:</span>{' '}
                            {selectedTask.assignee ? `${selectedTask.assignee.firstName} ${selectedTask.assignee.lastName}` : 'Без виконавця'}
                          </p>
                          {Array.isArray(selectedTask.coAssigneeIds) && selectedTask.coAssigneeIds.length > 0 && (
                            <p className="text-slate-600 dark:text-slate-300">
                              <span className="font-medium">Співвиконавці:</span>{' '}
                              {selectedTask.coAssigneeIds.map((coId) => {
                                const u = users.find((u) => u.id === coId)
                                return u ? `${u.firstName} ${u.lastName}` : coId
                              }).join(', ')}
                            </p>
                          )}
                          <p className="text-slate-600 dark:text-slate-300">
                            <span className="font-medium">Підрозділ:</span>{' '}
                            {selectedTask.department?.nameUk || selectedTask.department?.name || 'Без підрозділу'}
                          </p>
                          {selectedTask.dueDate && (
                            <p className={urgencyLevel(selectedTask) === 'overdue' ? 'text-rose-600 font-medium' : urgencyLevel(selectedTask) === 'critical' ? 'text-orange-600 font-medium' : 'text-slate-600 dark:text-slate-300'}>
                              <span className="font-medium">Дедлайн:</span>{' '}
                              {new Date(selectedTask.dueDate).toLocaleString('uk-UA')}
                            </p>
                          )}
                          {selectedTask.startedAt && (
                            <p className="text-emerald-700 dark:text-emerald-400">
                              <span className="font-medium">Початок роботи:</span>{' '}
                              {new Date(selectedTask.startedAt).toLocaleString('uk-UA')}
                            </p>
                          )}
                        </div>

                        <div className="flex flex-wrap items-center gap-2 pt-2">
                          {(user?.role === 'admin' || user?.role === 'director' || user?.role === 'deputy_director' ||
                            user?.id === selectedTask.reporter?.id) && (
                            <button
                              onClick={() => openEdit(selectedTask)}
                              className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-700 dark:border-slate-600 dark:text-slate-200"
                            >
                              Редагувати
                            </button>
                          )}
                          <select
                            value={selectedStatuses[selectedTask.id] || selectedTask.status}
                            onChange={(e) => setSelectedStatuses((prev) => ({ ...prev, [selectedTask.id]: e.target.value as Task['status'] }))}
                            className="h-8 rounded border border-slate-300 px-2 text-xs bg-white text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                          >
                            <option value="todo">Нове</option>
                            <option value="in_progress">В роботі</option>
                            <option value="done">Виконано</option>
                          </select>
                          <button
                            onClick={() => updateTaskStatus(selectedTask.id)}
                            disabled={updatingStatusTaskId === selectedTask.id}
                            className="rounded border border-emerald-300 px-2 py-1 text-xs text-emerald-700 disabled:opacity-60"
                          >
                            {updatingStatusTaskId === selectedTask.id ? 'Оновлення...' : 'Оновити статус'}
                          </button>

                          <select
                            value={selectedAssignees[selectedTask.id] || ''}
                            onChange={(e) => setSelectedAssignees((prev) => ({ ...prev, [selectedTask.id]: e.target.value }))}
                            className="h-8 min-w-[260px] rounded border border-slate-300 px-2 text-xs bg-white text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                          >
                            <option value="">Перенаправити...</option>
                            {users.map((u) => (
                              <option key={u.id} value={u.id}>
                                {u.firstName} {u.lastName} · {u.department?.nameUk || u.department?.name || 'Без підрозділу'}
                              </option>
                            ))}
                          </select>
                          <button
                            onClick={() => reassignTask(selectedTask.id)}
                            disabled={!selectedAssignees[selectedTask.id] || reassigningTaskId === selectedTask.id}
                            className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-700 disabled:opacity-60 dark:border-slate-600 dark:text-slate-200"
                          >
                            {reassigningTaskId === selectedTask.id ? 'Передача...' : 'Перенаправити'}
                          </button>
                          <button
                            onClick={() => deleteTask(selectedTask.id)}
                            disabled={deletingTaskId === selectedTask.id}
                            className="rounded border border-rose-300 px-2 py-1 text-xs text-rose-700 disabled:opacity-60"
                          >
                            {deletingTaskId === selectedTask.id ? 'Видалення...' : 'Видалити'}
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  )
}
