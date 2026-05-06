'use client'

import { useEffect, useMemo, useState } from 'react'
import { DashboardLayout } from '@/components/dashboard-layout'
import { AnimatePresence, motion } from 'framer-motion'
import { extractApiErrorMessage } from '@/lib/error-message'

type Task = {
  id: string
  title: string
  description?: string
  status: 'todo' | 'in_progress' | 'done'
  dueDate?: string
  assignee?: { id: string; firstName: string; lastName: string } | null
  reporter?: { id: string; firstName: string; lastName: string } | null
  department?: { id: string; name?: string } | null
  createdAt?: string
  startedAt?: string | null
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

export default function TaskListPage() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [users, setUsers] = useState<TeamUser[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedTaskId, setSelectedTaskId] = useState('')
  const [deletingTaskId, setDeletingTaskId] = useState('')
  const [reassigningTaskId, setReassigningTaskId] = useState('')
  const [updatingStatusTaskId, setUpdatingStatusTaskId] = useState('')
  const [selectedAssignees, setSelectedAssignees] = useState<Record<string, string>>({})
  const [selectedStatuses, setSelectedStatuses] = useState<Record<string, Task['status']>>({})
  const [actionToast, setActionToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
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
    loadTasks()
    loadUsers()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken])

  useEffect(() => {
    if (selectedTaskId) return
    if (tasks.length > 0) setSelectedTaskId(tasks[0].id)
  }, [tasks, selectedTaskId])

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

  useEffect(() => {
    if (!actionToast) return
    const timer = window.setTimeout(() => setActionToast(null), 2200)
    return () => window.clearTimeout(timer)
  }, [actionToast])

  const orderedTasks = useMemo(() => {
    return [...tasks].sort((a, b) => {
      if (a.status !== b.status) {
        const order = { todo: 0, in_progress: 1, done: 2 }
        return order[a.status] - order[b.status]
      }
      const aDue = a.dueDate ? new Date(a.dueDate).getTime() : Number.POSITIVE_INFINITY
      const bDue = b.dueDate ? new Date(b.dueDate).getTime() : Number.POSITIVE_INFINITY
      return aDue - bDue
    })
  }, [tasks])
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

        {error && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-800 dark:bg-rose-950/30 dark:text-rose-300">
            {error}
          </div>
        )}

        <div className="rounded-2xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900 overflow-hidden">
          {loading ? (
            <div className="px-4 py-6 text-sm text-slate-500 dark:text-slate-400">Завантаження...</div>
          ) : orderedTasks.length === 0 ? (
            <div className="px-4 py-6 text-sm text-slate-500 dark:text-slate-400">Задач поки немає.</div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] min-h-[520px]">
              <div className="border-r border-slate-200 dark:border-slate-700 max-h-[70vh] overflow-y-auto">
                {orderedTasks.map((task) => (
                  <button
                    key={task.id}
                    onClick={() => setSelectedTaskId(task.id)}
                    className={`w-full text-left px-4 py-3 border-b border-slate-100 dark:border-slate-800 ${selectedTask?.id === task.id ? 'bg-slate-100 dark:bg-slate-800/70' : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'}`}
                  >
                    <p className="text-sm font-medium text-slate-900 dark:text-slate-100 line-clamp-2">{task.title}</p>
                  </button>
                ))}
              </div>

              <div className="p-4">
                {!selectedTask ? (
                  <p className="text-sm text-slate-500 dark:text-slate-400">Оберіть задачу зі списку.</p>
                ) : (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-lg font-semibold text-slate-900 dark:text-slate-100">{selectedTask.title}</p>
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${statusBadge(selectedTask.status)}`}>
                        {statusLabel(selectedTask.status)}
                      </span>
                    </div>
                    {selectedTask.description && <p className="text-sm whitespace-pre-wrap text-slate-600 dark:text-slate-300">{selectedTask.description}</p>}
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {selectedTask.assignee ? `Виконавець: ${selectedTask.assignee.firstName} ${selectedTask.assignee.lastName}` : 'Без виконавця'}
                      {' · '}
                      {selectedTask.department?.name || 'Без підрозділу'}
                      {' · '}
                      {selectedTask.dueDate ? `Термін: ${new Date(selectedTask.dueDate).toLocaleDateString('uk-UA')}` : 'Без терміну'}
                    </p>
                    {selectedTask.startedAt && (
                      <p className="text-xs text-emerald-700 dark:text-emerald-400">
                        Початок роботи: {new Date(selectedTask.startedAt).toLocaleString('uk-UA')}
                      </p>
                    )}

                    <div className="flex flex-wrap items-center gap-2 pt-2">
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
