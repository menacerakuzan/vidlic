'use client'

import { useEffect, useMemo, useState } from 'react'
import { DashboardLayout } from '@/components/dashboard-layout'
import { KanbanBoard, KanbanTask } from '@/components/kanban/kanban-board'
import { useAuthStore } from '@/store/auth-store'
import { getPriorityLabel } from '@/lib/utils'

type Task = {
  id: string
  title: string
  status: 'todo' | 'in_progress' | 'done'
  priority: string
  dueDate?: string
  executionHours?: number | null
  isPrivate?: boolean
  assignee?: { id: string; firstName: string; lastName: string }
  reporter?: { id: string; firstName: string; lastName: string }
}

type TeamUser = {
  id: string
  firstName: string
  lastName: string
  role: string
}

export default function TasksPage() {
  const { user } = useAuthStore()
  const [tasks, setTasks] = useState<Task[]>([])
  const [team, setTeam] = useState<TeamUser[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [filterAssigneeId, setFilterAssigneeId] = useState('')
  const [title, setTitle] = useState('')
  const [priority, setPriority] = useState('medium')
  const [assigneeId, setAssigneeId] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [executionHours, setExecutionHours] = useState('')
  const [selectedTaskId, setSelectedTaskId] = useState('')
  const [taskAttachments, setTaskAttachments] = useState<any[]>([])
  const [attachmentsLoading, setAttachmentsLoading] = useState(false)
  const [uploadingAttachment, setUploadingAttachment] = useState(false)
  const [deletingTaskId, setDeletingTaskId] = useState('')
  const [transparency, setTransparency] = useState<any[]>([])
  const [taskActionError, setTaskActionError] = useState('')
  const accessToken = typeof window !== 'undefined' ? localStorage.getItem('vidlik-accessToken') : null

  const loadAll = async () => {
    if (!accessToken || !user) return
    setLoading(true)

    const tasksQuery = user?.department?.id && (user.role === 'manager' || user.role === 'director')
      ? `/api/v1/tasks?limit=200&departmentId=${user.department.id}`
      : '/api/v1/tasks?limit=200'
    const tasksReq = fetch(tasksQuery, { headers: { Authorization: `Bearer ${accessToken}` } })
    const teamReq = user.department?.id
      ? fetch(`/api/v1/departments/${user.department.id}/team`, { headers: { Authorization: `Bearer ${accessToken}` } })
      : Promise.resolve(null as any)

    const transparencyReq = fetch('/api/v1/tasks/transparency', { headers: { Authorization: `Bearer ${accessToken}` } })
    const [tasksResp, teamResp, transparencyResp] = await Promise.all([tasksReq, teamReq, transparencyReq])

    if (tasksResp.ok) {
      const tasksData = await tasksResp.json()
      setTasks(tasksData.data || [])
    }

    if (teamResp && teamResp.ok) {
      const teamData = await teamResp.json()
      setTeam(teamData || [])
    }

    if (transparencyResp.ok) {
      const data = await transparencyResp.json()
      setTransparency(Array.isArray(data) ? data : [])
    }

    setLoading(false)
  }

  useEffect(() => {
    loadAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, user?.id])

  useEffect(() => {
    if (!selectedTaskId && tasks.length > 0) {
      setSelectedTaskId(tasks[0].id)
    }
  }, [selectedTaskId, tasks])

  const loads = useMemo(() => {
    const map: Record<string, number> = {}
    tasks.forEach((task) => {
      if (task.status !== 'done' && task.assignee?.id) {
        map[task.assignee.id] = (map[task.assignee.id] || 0) + 1
      }
    })
    return map
  }, [tasks])

  const availableSorted = useMemo(() => {
    return [...team].sort((a, b) => (loads[a.id] || 0) - (loads[b.id] || 0))
  }, [team, loads])

  const canAssign = user?.role === 'director' || user?.role === 'manager'
  const canFilterByEmployee = user?.role === 'director' || user?.role === 'manager'

  const createTask = async () => {
    if (!accessToken || !title.trim()) return
    setCreating(true)

    const payload: any = {
      title: title.trim(),
      priority,
      departmentId: user?.department?.id,
    }

    if (canAssign && assigneeId) {
      payload.assigneeId = assigneeId
    }
    if (dueDate) payload.dueDate = dueDate
    if (executionHours) payload.executionHours = Number(executionHours)

    const resp = await fetch('/api/v1/tasks', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })

    setCreating(false)

    if (resp.ok) {
      setTitle('')
      setAssigneeId('')
      setDueDate('')
      setExecutionHours('')
      await loadAll()
    }
  }

  const updateStatus = async (id: string, status: KanbanTask['status']) => {
    setTasks((prev) => prev.map((task) => task.id === id ? { ...task, status } : task))
    if (!accessToken) return
    await fetch(`/api/v1/tasks/${id}/status`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ status }),
    })
  }

  const deleteTask = async (id: string) => {
    if (!accessToken) return
    const ok = window.confirm('Видалити задачу?')
    if (!ok) return
    setTaskActionError('')
    setDeletingTaskId(id)
    const resp = await fetch(`/api/v1/tasks/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    setDeletingTaskId('')
    if (resp.ok) {
      await loadAll()
      if (selectedTaskId === id) {
        setSelectedTaskId('')
      }
      return
    }
    const err = await resp.json().catch(() => null)
    setTaskActionError(err?.message || 'Не вдалося видалити задачу')
  }

  const loadTaskAttachments = async (taskId: string) => {
    if (!accessToken || !taskId) return
    setAttachmentsLoading(true)
    const resp = await fetch(`/api/v1/attachments?entityType=task&entityId=${taskId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (resp.ok) {
      const data = await resp.json()
      setTaskAttachments(Array.isArray(data) ? data : [])
    }
    setAttachmentsLoading(false)
  }

  useEffect(() => {
    if (selectedTaskId) {
      loadTaskAttachments(selectedTaskId)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTaskId, accessToken])

  const uploadTaskAttachment = async (file: File) => {
    if (!accessToken || !selectedTaskId) return
    setUploadingAttachment(true)
    const contentBase64 = await fileToBase64(file)
    const resp = await fetch('/api/v1/attachments', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        entityType: 'task',
        taskId: selectedTaskId,
        fileName: file.name,
        mimeType: file.type || 'application/octet-stream',
        contentBase64,
      }),
    })
    setUploadingAttachment(false)
    if (resp.ok) {
      await loadTaskAttachments(selectedTaskId)
    }
  }

  const deleteAttachment = async (id: string) => {
    if (!accessToken) return
    const resp = await fetch(`/api/v1/attachments/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (resp.ok && selectedTaskId) {
      await loadTaskAttachments(selectedTaskId)
    }
  }

  const downloadAttachment = async (id: string, fileName: string) => {
    if (!accessToken) return
    const resp = await fetch(`/api/v1/attachments/${id}/download`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (!resp.ok) return
    const blob = await resp.blob()
    const url = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = fileName
    link.click()
    window.URL.revokeObjectURL(url)
  }

  const filteredTasks = filterAssigneeId
    ? tasks.filter((task) => task.assignee?.id === filterAssigneeId)
    : tasks

  const kanbanTasks: KanbanTask[] = filteredTasks.map((task) => ({
    id: task.id,
    title: task.title,
    status: task.status,
    priority: task.priority,
    dueDate: task.dueDate,
    executionHours: task.executionHours ?? null,
    isPrivate: Boolean(task.isPrivate),
    reporter: task.reporter,
    assignee: task.assignee,
  }))

  const specialistOwnTasks = useMemo(() => {
    if (user?.role !== 'specialist') return []
    return tasks.filter((task) => task.reporter?.id === user.id)
  }, [tasks, user?.id, user?.role])
  const ownCreatedTasks = useMemo(() => {
    if (!user?.id) return []
    return tasks.filter((task) => task.reporter?.id === user.id)
  }, [tasks, user?.id])

  return (
    <DashboardLayout>
      <div className="max-w-7xl mx-auto space-y-6">
        {taskActionError && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-800 dark:bg-rose-950/30 dark:text-rose-300">
            {taskActionError}
          </div>
        )}
        <div>
          <h1 className="text-2xl font-semibold font-display">Задачі</h1>
          <p className="text-slate-500 mt-1">Створення, призначення та Kanban</p>
        </div>

        {canFilterByEmployee && (
          <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
            <p className="text-sm font-medium mb-2">Перегляд задач співробітника</p>
            <select value={filterAssigneeId} onChange={(e) => setFilterAssigneeId(e.target.value)} className="h-10 rounded-lg border border-slate-300 px-3 text-sm min-w-[300px] bg-white text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100">
              <option value="">Усі співробітники підрозділу</option>
              {availableSorted.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.firstName} {member.lastName}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="rounded-2xl border border-slate-200 bg-white p-4 grid grid-cols-1 md:grid-cols-4 gap-3 dark:border-slate-700 dark:bg-slate-900">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="md:col-span-2 h-10 rounded-lg border border-slate-300 px-3 text-sm bg-white text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
            placeholder="Назва задачі"
          />
          <select value={priority} onChange={(e) => setPriority(e.target.value)} className="h-10 rounded-lg border border-slate-300 px-3 text-sm bg-white text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100">
            <option value="low">{getPriorityLabel('low')}</option>
            <option value="medium">{getPriorityLabel('medium')}</option>
            <option value="high">{getPriorityLabel('high')}</option>
            <option value="critical">{getPriorityLabel('critical')}</option>
          </select>
          {canAssign ? (
            <select value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)} className="h-10 rounded-lg border border-slate-300 px-3 text-sm bg-white text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100">
              <option value="">Без виконавця</option>
              {availableSorted.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.firstName} {member.lastName} ({loads[member.id] || 0})
                </option>
              ))}
            </select>
          ) : (
            <div className="h-10 rounded-lg border border-slate-200 px-3 text-sm text-slate-500 flex items-center dark:border-slate-700 dark:text-slate-400">Призначення: через керівника/директора</div>
          )}
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className="h-10 rounded-lg border border-slate-300 px-3 text-sm bg-white text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
          />
          <input
            type="number"
            min={1}
            max={999}
            value={executionHours}
            onChange={(e) => setExecutionHours(e.target.value)}
            className="h-10 rounded-lg border border-slate-300 px-3 text-sm bg-white text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
            placeholder="Час (год)"
          />
          <button disabled={creating} onClick={createTask} className="md:col-span-4 h-10 rounded-lg bg-primary text-white text-sm font-medium disabled:opacity-60">
            {creating ? 'Створення...' : 'Створити задачу'}
          </button>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
          <h2 className="text-lg font-semibold mb-3">Прозорість між підрозділами</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {transparency.map((row) => (
              <div key={row.departmentId || row.departmentCode} className="rounded-lg border border-slate-200 p-3 dark:border-slate-700 dark:bg-slate-800/70">
                <p className="text-sm font-semibold">{row.departmentName}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{row.departmentCode}</p>
                <p className="text-sm mt-2">Всього: <b>{row.total}</b></p>
                <p className="text-xs text-slate-600 dark:text-slate-300">Todo: {row.todo} · In Progress: {row.inProgress} · Done: {row.done}</p>
                <p className="text-xs text-slate-600 dark:text-slate-300">Critical: {row.critical} · High: {row.high} · Medium: {row.medium} · Low: {row.low}</p>
              </div>
            ))}
            {transparency.length === 0 && <p className="text-sm text-slate-500 dark:text-slate-400">Дані поки відсутні.</p>}
          </div>
        </div>

        {loading ? (
          <div className="rounded-xl border border-slate-200 bg-white px-4 py-6 text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">Завантаження...</div>
        ) : (
          <KanbanBoard tasks={kanbanTasks} onStatusChange={updateStatus} />
        )}

        {user?.role === 'specialist' && (
          <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3 dark:border-slate-700 dark:bg-slate-900">
            <h2 className="text-lg font-semibold">Мої створені задачі</h2>
            {specialistOwnTasks.length === 0 && (
              <p className="text-sm text-slate-500 dark:text-slate-400">У вас немає власних задач для видалення.</p>
            )}
            {specialistOwnTasks.map((task) => (
              <div key={task.id} className="flex items-center justify-between rounded-lg border border-slate-200 p-3 dark:border-slate-700">
                <div>
                  <p className="text-sm font-medium">{task.title}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Статус: {task.status} {task.assignee ? `· Виконавець: ${task.assignee.firstName} ${task.assignee.lastName}` : ''}
                  </p>
                </div>
                <button
                  onClick={() => deleteTask(task.id)}
                  disabled={deletingTaskId === task.id}
                  className="rounded border border-rose-300 px-3 py-1.5 text-xs text-rose-700 disabled:opacity-60"
                >
                  {deletingTaskId === task.id ? 'Видалення...' : 'Видалити'}
                </button>
              </div>
            ))}
          </div>
        )}

        {user?.role !== 'specialist' && (
          <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3 dark:border-slate-700 dark:bg-slate-900">
            <h2 className="text-lg font-semibold">Мої створені задачі</h2>
            {ownCreatedTasks.length === 0 && (
              <p className="text-sm text-slate-500 dark:text-slate-400">У вас немає власних задач для видалення.</p>
            )}
            {ownCreatedTasks.map((task) => (
              <div key={task.id} className="flex items-center justify-between rounded-lg border border-slate-200 p-3 dark:border-slate-700">
                <div>
                  <p className="text-sm font-medium">{task.title}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Статус: {task.status} {task.assignee ? `· Виконавець: ${task.assignee.firstName} ${task.assignee.lastName}` : ''}
                  </p>
                </div>
                <button
                  onClick={() => deleteTask(task.id)}
                  disabled={deletingTaskId === task.id}
                  className="rounded border border-rose-300 px-3 py-1.5 text-xs text-rose-700 disabled:opacity-60"
                >
                  {deletingTaskId === task.id ? 'Видалення...' : 'Видалити'}
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3 dark:border-slate-700 dark:bg-slate-900">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">Вкладення до задач</h2>
            <label className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 cursor-pointer dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800">
              {uploadingAttachment ? 'Завантаження...' : 'Додати файл'}
              <input
                type="file"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) uploadTaskAttachment(file)
                  e.currentTarget.value = ''
                }}
              />
            </label>
          </div>

          <select
            value={selectedTaskId}
            onChange={(e) => setSelectedTaskId(e.target.value)}
            className="h-10 rounded-lg border border-slate-300 px-3 text-sm min-w-[320px] bg-white text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
          >
            {tasks.map((task) => (
              <option key={task.id} value={task.id}>
                {task.title}
              </option>
            ))}
          </select>

          {attachmentsLoading && <p className="text-sm text-slate-500 dark:text-slate-400">Завантаження...</p>}
          {!attachmentsLoading && taskAttachments.length === 0 && <p className="text-sm text-slate-500 dark:text-slate-400">Файлів поки немає.</p>}
          {taskAttachments.map((item) => (
            <div key={item.id} className="rounded-lg border border-slate-200 p-3 flex items-center justify-between dark:border-slate-700 dark:bg-slate-800/70">
              <div>
                <p className="text-sm font-medium">{item.fileName}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">{Math.round((item.fileSize || 0) / 1024)} KB</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => downloadAttachment(item.id, item.fileName)}
                  className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-700 dark:border-slate-600 dark:text-slate-200"
                >
                  Завантажити
                </button>
                <button onClick={() => deleteAttachment(item.id)} className="rounded border border-rose-300 px-2 py-1 text-xs text-rose-700">
                  Видалити
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </DashboardLayout>
  )
}

async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = String(reader.result || '')
      resolve(result.replace(/^data:.*;base64,/, ''))
    }
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}
