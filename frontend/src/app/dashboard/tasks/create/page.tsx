'use client'

import { useEffect, useMemo, useState } from 'react'
import { DashboardLayout } from '@/components/dashboard-layout'
import { useAuthStore } from '@/store/auth-store'
import { AnimatePresence, motion } from 'framer-motion'
import { extractApiErrorMessage } from '@/lib/error-message'

type Task = {
  id: string
  title: string
  description?: string
  status: 'todo' | 'in_progress' | 'done'
  dueDate?: string
  isPrivate?: boolean
  assignee?: { id: string; firstName: string; lastName: string }
  reporter?: { id: string; firstName: string; lastName: string }
  department?: { id: string; name?: string }
  createdAt?: string
}

type TeamUser = {
  id: string
  firstName: string
  lastName: string
  role: string
  department?: {
    id: string
    nameUk?: string
    name?: string
  } | null
}

type DepartmentOption = {
  id: string
  nameUk?: string
  name?: string
  parentId?: string | null
}

export default function CreateTaskPage() {
  const { user } = useAuthStore()
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [assigneeId, setAssigneeId] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [selectedTaskId, setSelectedTaskId] = useState('')
  const [taskAttachments, setTaskAttachments] = useState<any[]>([])
  const [attachmentsLoading, setAttachmentsLoading] = useState(false)
  const [uploadingAttachment, setUploadingAttachment] = useState(false)
  const [departments, setDepartments] = useState<DepartmentOption[]>([])
  const [assignableUsers, setAssignableUsers] = useState<TeamUser[]>([])
  const [taskActionError, setTaskActionError] = useState('')
  const [actionToast, setActionToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [selectedAssignDepartmentId, setSelectedAssignDepartmentId] = useState('')
  const accessToken = typeof window !== 'undefined' ? localStorage.getItem('vidlik-accessToken') : null

  const loadAll = async () => {
    if (!accessToken || !user) return
    setLoading(true)
    setTaskActionError('')

    const taskParams = new URLSearchParams()
    taskParams.set('limit', '100')

    const [tasksResp, departmentsResp, usersResp] = await Promise.all([
      fetch(`/api/v1/tasks?${taskParams.toString()}`, { headers: { Authorization: `Bearer ${accessToken}` } }),
      fetch('/api/v1/departments', { headers: { Authorization: `Bearer ${accessToken}` } }),
      fetch('/api/v1/users?limit=100', { headers: { Authorization: `Bearer ${accessToken}` } }),
    ])

    if (tasksResp.ok) {
      const tasksData = await tasksResp.json()
      setTasks(tasksData.data || [])
    } else {
      const err = await tasksResp.json().catch(() => null)
      setTaskActionError(extractApiErrorMessage(tasksResp.status, err, 'Не вдалося завантажити задачі.'))
    }

    if (departmentsResp.ok) {
      const departmentsData = await departmentsResp.json()
      setDepartments(Array.isArray(departmentsData) ? departmentsData : [])
    }

    if (usersResp.ok) {
      const usersData = await usersResp.json()
      const usersList = Array.isArray(usersData?.data) ? usersData.data : []
      const normalizedUsers: TeamUser[] = usersList.map((u: any) => ({
        id: u.id,
        firstName: u.firstName,
        lastName: u.lastName,
        role: u.role,
        department: u.department || null,
      }))
      setAssignableUsers(normalizedUsers)
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
    return [...assignableUsers].sort((a, b) => (loads[a.id] || 0) - (loads[b.id] || 0))
  }, [assignableUsers, loads])

  const canAssign = user?.role === 'director' || user?.role === 'deputy_director' || user?.role === 'manager'
  const isDirectorMode = user?.role === 'director' || user?.role === 'deputy_director'

  const assignDepartmentOptions = useMemo(() => {
    return [...departments].sort((a, b) => {
      if (!a.parentId && b.parentId) return -1
      if (a.parentId && !b.parentId) return 1
      return (a.nameUk || a.name || '').localeCompare(b.nameUk || b.name || '', 'uk')
    })
  }, [departments])

  useEffect(() => {
    if (!canAssign) return
    if (selectedAssignDepartmentId) return
    if (user?.role === 'manager' && user?.department?.id) {
      setSelectedAssignDepartmentId(user.department.id)
      return
    }
    if (assignDepartmentOptions.length > 0) {
      setSelectedAssignDepartmentId(assignDepartmentOptions[0].id)
    }
  }, [canAssign, selectedAssignDepartmentId, user?.role, user?.department?.id, assignDepartmentOptions])

  const availableForAssignment = useMemo(() => {
    if (!canAssign) return []
    if (!selectedAssignDepartmentId) return availableSorted
    return availableSorted.filter((member) => member.department?.id === selectedAssignDepartmentId)
  }, [canAssign, selectedAssignDepartmentId, availableSorted])

  const createTask = async () => {
    if (!accessToken || !title.trim()) return
    setCreating(true)

    const selectedAssignee = availableForAssignment.find((member) => member.id === assigneeId)
    const targetDepartmentId = selectedAssignDepartmentId || selectedAssignee?.department?.id || user?.department?.id

    const payload: any = {
      title: title.trim(),
      departmentId: targetDepartmentId,
    }
    if (description.trim()) payload.description = description.trim()
    if (canAssign && assigneeId) payload.assigneeId = assigneeId
    if (dueDate) payload.dueDate = dueDate

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
      setDescription('')
      setAssigneeId('')
      if (isDirectorMode && assignDepartmentOptions.length > 0) {
        setSelectedAssignDepartmentId(assignDepartmentOptions[0].id)
      }
      setDueDate('')
      await loadAll()
      setActionToast({ type: 'success', message: 'Задачу створено та надіслано' })
      return
    }

    const err = await resp.json().catch(() => null)
    const message = extractApiErrorMessage(resp.status, err, 'Не вдалося створити задачу')
    setTaskActionError(message)
    setActionToast({ type: 'error', message })
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
      setActionToast({ type: 'success', message: 'Файл додано до задачі' })
      return
    }
    const err = await resp.json().catch(() => null)
    setActionToast({ type: 'error', message: extractApiErrorMessage(resp.status, err, 'Не вдалося додати файл') })
  }

  const deleteAttachment = async (id: string) => {
    if (!accessToken) return
    const resp = await fetch(`/api/v1/attachments/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (resp.ok && selectedTaskId) {
      await loadTaskAttachments(selectedTaskId)
      setActionToast({ type: 'success', message: 'Файл видалено' })
      return
    }
    const err = await resp.json().catch(() => null)
    setActionToast({ type: 'error', message: extractApiErrorMessage(resp.status, err, 'Не вдалося видалити файл') })
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

  useEffect(() => {
    if (!actionToast) return
    const timer = window.setTimeout(() => setActionToast(null), 2200)
    return () => window.clearTimeout(timer)
  }, [actionToast])

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

        {taskActionError && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-800 dark:bg-rose-950/30 dark:text-rose-300">
            {taskActionError}
          </div>
        )}

        <div>
          <h1 className="text-2xl font-semibold font-display">Створити задачу</h1>
          <p className="text-slate-500 mt-1">Створення і призначення задач</p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 grid grid-cols-1 md:grid-cols-4 gap-3 dark:border-slate-700 dark:bg-slate-900">
          <textarea
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            rows={3}
            className="md:col-span-2 min-h-[92px] rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium bg-white text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 resize-none"
            placeholder="Назва задачі"
          />
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={8}
            className="md:col-span-2 min-h-[180px] rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 resize-none"
            placeholder="Опис задачі"
          />
          <select
            value={selectedAssignDepartmentId}
            onChange={(e) => setSelectedAssignDepartmentId(e.target.value)}
            className="h-10 rounded-lg border border-slate-300 px-3 text-sm bg-white text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
          >
            <option value="">Підрозділ для задачі</option>
            {assignDepartmentOptions.map((dep) => (
              <option key={dep.id} value={dep.id}>
                {dep.nameUk || dep.name || dep.id}
              </option>
            ))}
          </select>
          {canAssign ? (
            <select value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)} className="h-10 rounded-lg border border-slate-300 px-3 text-sm bg-white text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100">
              <option value="">Без виконавця</option>
              {availableForAssignment.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.firstName} {member.lastName} ({loads[member.id] || 0})
                </option>
              ))}
            </select>
          ) : (
            <div className="h-10 rounded-lg border border-slate-200 px-3 text-sm text-slate-500 flex items-center dark:border-slate-700 dark:text-slate-400">Призначення: через керівника/директора</div>
          )}
          <input
            type="datetime-local"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className="h-10 rounded-lg border border-slate-300 px-3 text-sm bg-white text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
          />
          <button disabled={creating} onClick={createTask} className="md:col-span-4 h-10 rounded-lg bg-primary text-white text-sm font-medium disabled:opacity-60">
            {creating ? 'Створення...' : 'Створити задачу'}
          </button>
        </div>

        {loading && (
          <div className="rounded-xl border border-slate-200 bg-white px-4 py-6 text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">Завантаження...</div>
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
