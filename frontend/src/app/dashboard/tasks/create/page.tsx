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
  parentId?: string | null
  subtasksCount?: number
  subtasksDone?: number
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
  secondaryDepartmentIds?: string[]
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
  const [overrideDepartmentId, setOverrideDepartmentId] = useState('')
  const [coAssigneeIds, setCoAssigneeIds] = useState<string[]>([])
  // Subtask form
  const [subtaskMode, setSubtaskMode] = useState(false)
  const [subtaskParentId, setSubtaskParentId] = useState('')
  const [subtaskTitle, setSubtaskTitle] = useState('')
  const [subtaskDescription, setSubtaskDescription] = useState('')
  const [subtaskAssigneeId, setSubtaskAssigneeId] = useState('')
  const [subtaskDueDate, setSubtaskDueDate] = useState('')
  const [creatingSubtask, setCreatingSubtask] = useState(false)
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
        secondaryDepartmentIds: Array.isArray(u.secondaryDepartmentIds) ? u.secondaryDepartmentIds : [],
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
    return availableSorted.filter((member) => {
      if (member.department?.id === selectedAssignDepartmentId) return true
      if (Array.isArray(member.secondaryDepartmentIds) && member.secondaryDepartmentIds.includes(selectedAssignDepartmentId)) return true
      return false
    })
  }, [canAssign, selectedAssignDepartmentId, availableSorted])

  const createTask = async () => {
    if (!accessToken || !title.trim()) return
    setCreating(true)

    const selectedAssignee = availableForAssignment.find((member) => member.id === assigneeId)
    const targetDepartmentId = overrideDepartmentId || selectedAssignDepartmentId || selectedAssignee?.department?.id || user?.department?.id

    const payload: any = {
      title: title.trim(),
      departmentId: targetDepartmentId,
    }
    if (description.trim()) payload.description = description.trim()
    if (canAssign && assigneeId) payload.assigneeId = assigneeId
    if (coAssigneeIds.length > 0) payload.coAssigneeIds = coAssigneeIds
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
      setCoAssigneeIds([])
      setOverrideDepartmentId('')
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

  const createSubtaskFromPage = async () => {
    if (!accessToken || !subtaskParentId || !subtaskTitle.trim()) return
    setCreatingSubtask(true)
    const resp = await fetch(`/api/v1/tasks/${subtaskParentId}/subtasks`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: subtaskTitle.trim(),
        description: subtaskDescription.trim() || undefined,
        assigneeId: subtaskAssigneeId || undefined,
        dueDate: subtaskDueDate || undefined,
      }),
    })
    setCreatingSubtask(false)
    if (resp.ok) {
      setSubtaskTitle('')
      setSubtaskDescription('')
      setSubtaskAssigneeId('')
      setSubtaskDueDate('')
      await loadAll()
      setActionToast({ type: 'success', message: 'Підзадачу створено' })
      return
    }
    const err = await resp.json().catch(() => null)
    setActionToast({ type: 'error', message: extractApiErrorMessage(resp.status, err, 'Не вдалося створити підзадачу') })
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

        {/* Mode toggle */}
        <div className="flex gap-1 rounded-xl border border-slate-200 bg-slate-100 p-1 w-fit dark:border-slate-700 dark:bg-slate-800">
          <button
            onClick={() => setSubtaskMode(false)}
            className={`rounded-lg px-4 py-1.5 text-sm font-medium transition ${!subtaskMode ? 'bg-white shadow-sm text-slate-900 dark:bg-slate-900 dark:text-slate-100' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700'}`}
          >
            Нова задача
          </button>
          <button
            onClick={() => setSubtaskMode(true)}
            className={`rounded-lg px-4 py-1.5 text-sm font-medium transition ${subtaskMode ? 'bg-white shadow-sm text-slate-900 dark:bg-slate-900 dark:text-slate-100' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700'}`}
          >
            Підзадача
          </button>
        </div>

        {/* Subtask form */}
        {subtaskMode && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 dark:border-amber-800/50 dark:bg-amber-950/10 p-4 space-y-3">
            <div>
              <p className="text-sm font-semibold text-amber-800 dark:text-amber-300 mb-1">Вибери глобальну задачу</p>
              <select
                value={subtaskParentId}
                onChange={(e) => setSubtaskParentId(e.target.value)}
                className="h-10 w-full rounded-lg border border-amber-300 px-3 text-sm bg-white text-slate-900 dark:border-amber-700 dark:bg-slate-800 dark:text-slate-100"
              >
                <option value="">Оберіть задачу...</option>
                {tasks.filter(t => !t.parentId).map((t) => {
                  const done = t.subtasksDone ?? 0
                  const total = t.subtasksCount ?? 0
                  const label = total > 0 ? ` [${done}/${total}]` : ''
                  return (
                    <option key={t.id} value={t.id}>
                      {t.title}{label}
                    </option>
                  )
                })}
              </select>
              {subtaskParentId && (() => {
                const parent = tasks.find(t => t.id === subtaskParentId)
                if (!parent || (parent.subtasksCount ?? 0) === 0) return null
                const pct = Math.round(((parent.subtasksDone ?? 0) / (parent.subtasksCount ?? 1)) * 100)
                return (
                  <div className="mt-2 space-y-1">
                    <div className="flex justify-between text-xs text-amber-700 dark:text-amber-400">
                      <span>Прогрес: {parent.subtasksDone}/{parent.subtasksCount} підзадач виконано</span>
                      <span>{pct}%</span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-amber-200 dark:bg-amber-900/50 overflow-hidden">
                      <div className="h-full rounded-full bg-amber-500" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                )
              })()}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <textarea
                value={subtaskTitle}
                onChange={(e) => setSubtaskTitle(e.target.value)}
                rows={2}
                placeholder="Назва підзадачі"
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 resize-none"
              />
              <textarea
                value={subtaskDescription}
                onChange={(e) => setSubtaskDescription(e.target.value)}
                rows={2}
                placeholder="Опис (необов'язково)"
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 resize-none"
              />
              <select
                value={subtaskAssigneeId}
                onChange={(e) => setSubtaskAssigneeId(e.target.value)}
                className="h-10 rounded-lg border border-slate-300 px-3 text-sm bg-white text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
              >
                <option value="">Без виконавця</option>
                {user && (
                  <option value={user.id}>
                    {user.firstName} {user.lastName} (я)
                  </option>
                )}
                {availableForAssignment.filter(m => m.id !== user?.id).map((m) => (
                  <option key={m.id} value={m.id}>{m.firstName} {m.lastName} ({loads[m.id] || 0})</option>
                ))}
              </select>
              <input
                type="datetime-local"
                value={subtaskDueDate}
                onChange={(e) => setSubtaskDueDate(e.target.value)}
                className="h-10 rounded-lg border border-slate-300 px-3 text-sm bg-white text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
              />
            </div>
            <button
              onClick={createSubtaskFromPage}
              disabled={creatingSubtask || !subtaskParentId || !subtaskTitle.trim()}
              className="h-10 w-full rounded-lg bg-amber-500 text-white text-sm font-medium disabled:opacity-60 hover:bg-amber-600 transition"
            >
              {creatingSubtask ? 'Створення...' : 'Створити підзадачу'}
            </button>
          </div>
        )}

        {/* Main task form */}
        {!subtaskMode && (
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
            <select
              value={assigneeId}
              onChange={(e) => { setAssigneeId(e.target.value); setOverrideDepartmentId(''); setCoAssigneeIds((prev) => prev.filter((id) => id !== e.target.value)) }}
              className="h-10 rounded-lg border border-slate-300 px-3 text-sm bg-white text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
            >
              <option value="">Без виконавця</option>
              {availableForAssignment.map((member) => {
                const isSecondary = member.department?.id !== selectedAssignDepartmentId && Array.isArray(member.secondaryDepartmentIds) && member.secondaryDepartmentIds.includes(selectedAssignDepartmentId)
                return (
                  <option key={member.id} value={member.id}>
                    {member.firstName} {member.lastName}{isSecondary ? ' (сумісник)' : ''} ({loads[member.id] || 0})
                  </option>
                )
              })}
            </select>
          ) : (
            <div className="h-10 rounded-lg border border-slate-200 px-3 text-sm text-slate-500 flex items-center dark:border-slate-700 dark:text-slate-400">Призначення: через керівника/директора</div>
          )}
          {(() => {
            if (!assigneeId) return null
            const selected = availableForAssignment.find((m) => m.id === assigneeId)
            if (!selected) return null
            const secondary = Array.isArray(selected.secondaryDepartmentIds) ? selected.secondaryDepartmentIds : []
            if (secondary.length === 0) return null
            const allDepts = [selected.department?.id, ...secondary].filter(Boolean) as string[]
            return (
              <div className="md:col-span-4 rounded-lg border border-indigo-200 bg-indigo-50 p-3 dark:border-indigo-800 dark:bg-indigo-950/30">
                <p className="text-xs font-medium text-indigo-700 dark:text-indigo-300 mb-1.5">
                  {selected.firstName} {selected.lastName} — сумісник у кількох відділах. Обери відділ для цієї задачі:
                </p>
                <div className="flex flex-wrap gap-2">
                  {allDepts.map((depId) => {
                    const dep = departments.find((d) => d.id === depId)
                    const isActive = (overrideDepartmentId || selectedAssignDepartmentId) === depId
                    return (
                      <button
                        key={depId}
                        type="button"
                        onClick={() => setOverrideDepartmentId(depId)}
                        className={`rounded-lg px-3 py-1.5 text-xs font-medium border transition ${isActive ? 'border-indigo-500 bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-200' : 'border-slate-300 bg-white text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200'}`}
                      >
                        {dep?.nameUk || dep?.name || depId}
                        {depId === selected.department?.id ? ' (основний)' : ' (суміщення)'}
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })()}
          {canAssign && availableForAssignment.length > 0 && (
            <div className="md:col-span-4">
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-1.5">Співвиконавці (необов'язково)</p>
              <div className="flex flex-wrap gap-2">
                {availableForAssignment
                  .filter((m) => m.id !== assigneeId)
                  .map((member) => {
                    const isSelected = coAssigneeIds.includes(member.id)
                    return (
                      <button
                        key={member.id}
                        type="button"
                        onClick={() => setCoAssigneeIds((prev) =>
                          isSelected ? prev.filter((id) => id !== member.id) : [...prev, member.id]
                        )}
                        className={`rounded-lg px-3 py-1.5 text-xs font-medium border transition ${
                          isSelected
                            ? 'border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
                            : 'border-slate-300 bg-white text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200'
                        }`}
                      >
                        {member.firstName} {member.lastName}
                        {isSelected ? ' ✓' : ''}
                      </button>
                    )
                  })}
              </div>
            </div>
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
        )}

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
