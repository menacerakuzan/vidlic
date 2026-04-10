'use client'

import { useEffect, useMemo, useState } from 'react'
import { DashboardLayout } from '@/components/dashboard-layout'
import { KanbanBoard, KanbanTask } from '@/components/kanban/kanban-board'
import { useAuthStore } from '@/store/auth-store'
import { getPriorityLabel } from '@/lib/utils'

type Task = {
  id: string
  title: string
  description?: string
  status: 'todo' | 'in_progress' | 'done'
  priority: string
  dueDate?: string
  executionHours?: number | null
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

export default function TasksPage() {
  const { user } = useAuthStore()
  const [tasks, setTasks] = useState<Task[]>([])
  const [team, setTeam] = useState<TeamUser[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [filterAssigneeId, setFilterAssigneeId] = useState('')
  const [filterReporterId, setFilterReporterId] = useState('')
  const [filterDepartmentId, setFilterDepartmentId] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterPriority, setFilterPriority] = useState('')
  const [filterDueFrom, setFilterDueFrom] = useState('')
  const [filterDueTo, setFilterDueTo] = useState('')
  const [createDepartmentId, setCreateDepartmentId] = useState('')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
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
  const [departments, setDepartments] = useState<DepartmentOption[]>([])
  const [assignableUsers, setAssignableUsers] = useState<TeamUser[]>([])
  const [reassigningTaskId, setReassigningTaskId] = useState('')
  const [reassignToUserId, setReassignToUserId] = useState<Record<string, string>>({})
  const [taskActionError, setTaskActionError] = useState('')
  const [selectedAssignDepartmentId, setSelectedAssignDepartmentId] = useState('')
  const accessToken = typeof window !== 'undefined' ? localStorage.getItem('vidlik-accessToken') : null

  const loadAll = async () => {
    if (!accessToken || !user) return
    setLoading(true)
    setTaskActionError('')
    const needsAssignableDirectory = ['director', 'deputy_director', 'manager', 'deputy_head'].includes(user.role)

    const taskParams = new URLSearchParams()
    taskParams.set('limit', '100')
    if (filterDepartmentId) taskParams.set('departmentId', filterDepartmentId)
    if (filterAssigneeId) taskParams.set('assigneeId', filterAssigneeId)
    if (filterReporterId) taskParams.set('reporterId', filterReporterId)
    if (filterStatus) taskParams.set('status', filterStatus)
    if (filterPriority) taskParams.set('priority', filterPriority)
    if (filterDueFrom) taskParams.set('dueDateFrom', filterDueFrom)
    if (filterDueTo) taskParams.set('dueDateTo', filterDueTo)

    const tasksReq = fetch(`/api/v1/tasks?${taskParams.toString()}`, { headers: { Authorization: `Bearer ${accessToken}` } })
    const departmentsReq = fetch('/api/v1/departments', { headers: { Authorization: `Bearer ${accessToken}` } })
    const usersReq = fetch('/api/v1/users?limit=100', { headers: { Authorization: `Bearer ${accessToken}` } })
    const transparencyReq = fetch('/api/v1/tasks/transparency', { headers: { Authorization: `Bearer ${accessToken}` } })
    const [tasksResp, departmentsResp, usersResp, transparencyResp] = await Promise.all([
      tasksReq,
      departmentsReq,
      usersReq,
      transparencyReq,
    ])

    if (tasksResp.ok) {
      const tasksData = await tasksResp.json()
      setTasks(tasksData.data || [])
    } else {
      setTaskActionError('Не вдалося завантажити задачі. Оновіть сторінку або спробуйте пізніше.')
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
      setTeam(normalizedUsers)
    } else {
      let loadedFallback = false
      if (!needsAssignableDirectory) {
        setAssignableUsers([])
        setTeam([])
        loadedFallback = true
      }
      const departmentId = user?.department?.id
      if (needsAssignableDirectory && departmentId) {
        const teamResp = await fetch(`/api/v1/departments/${departmentId}/team`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        })
        if (teamResp.ok) {
          const teamData = await teamResp.json()
          const normalizedUsers: TeamUser[] = Array.isArray(teamData)
            ? teamData.map((u: any) => ({
                id: u.id,
                firstName: u.firstName,
                lastName: u.lastName,
                role: u.role,
                department: u.department || null,
              }))
            : []
          setAssignableUsers(normalizedUsers)
          setTeam(normalizedUsers)
          loadedFallback = true
        }
      }
      if (needsAssignableDirectory && !loadedFallback) {
        setTaskActionError('Не вдалося завантажити список співробітників для призначення задач.')
      }
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
  }, [
    accessToken,
    user?.id,
    filterAssigneeId,
    filterReporterId,
    filterDepartmentId,
    filterStatus,
    filterPriority,
    filterDueFrom,
    filterDueTo,
  ])

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
  const canFilterByEmployee = ['director', 'deputy_director', 'manager', 'deputy_head'].includes(user?.role || '')

  const visibleDepartmentOptions = useMemo(() => {
    const idsFromTasks = new Set(tasks.map((t) => t.department?.id).filter(Boolean) as string[])
    const fromServer = departments.filter((dep) => idsFromTasks.has(dep.id))
    if (fromServer.length) return fromServer
    return departments
  }, [departments, tasks])

  const reporterOptions = useMemo(() => {
    const map = new Map<string, TeamUser>()
    tasks.forEach((task) => {
      if (!task.reporter?.id) return
      const candidate = assignableUsers.find((u) => u.id === task.reporter?.id)
      map.set(task.reporter.id, candidate || {
        id: task.reporter.id,
        firstName: task.reporter.firstName,
        lastName: task.reporter.lastName,
        role: '',
      })
    })
    return Array.from(map.values()).sort((a, b) =>
      `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`, 'uk'),
    )
  }, [tasks, assignableUsers])

  const assignDepartmentOptions = useMemo(() => {
    if (!isDirectorMode) return visibleDepartmentOptions
    const sections = visibleDepartmentOptions.filter((dep) => dep.parentId)
    return sections.length > 0 ? sections : visibleDepartmentOptions
  }, [isDirectorMode, visibleDepartmentOptions])

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
    const targetDepartmentId = selectedAssignDepartmentId || createDepartmentId
    if (!targetDepartmentId) return availableSorted
    return availableSorted.filter((member) => member.department?.id === targetDepartmentId)
  }, [canAssign, selectedAssignDepartmentId, createDepartmentId, availableSorted])

  const createTask = async () => {
    if (!accessToken || !title.trim()) return
    setCreating(true)

    const selectedAssignee = availableForAssignment.find((member) => member.id === assigneeId)
    const targetDepartmentId =
      selectedAssignDepartmentId ||
      createDepartmentId ||
      selectedAssignee?.department?.id ||
      user?.department?.id

    const payload: any = {
      title: title.trim(),
      priority,
      departmentId: targetDepartmentId,
    }
    if (description.trim()) payload.description = description.trim()

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
      setDescription('')
      setAssigneeId('')
      setCreateDepartmentId('')
      if (isDirectorMode && assignDepartmentOptions.length > 0) {
        setSelectedAssignDepartmentId(assignDepartmentOptions[0].id)
      }
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

  const reassignTask = async (task: Task) => {
    if (!accessToken) return
    const targetUserId = reassignToUserId[task.id]
    if (!targetUserId) return
    setTaskActionError('')
    setReassigningTaskId(task.id)
    const resp = await fetch(`/api/v1/tasks/${task.id}`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        assigneeId: targetUserId,
      }),
    })
    setReassigningTaskId('')
    if (resp.ok) {
      await loadAll()
      return
    }
    const err = await resp.json().catch(() => null)
    setTaskActionError(err?.message || 'Не вдалося перенаправити задачу')
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

  const filteredTasks = tasks

  const priorityWeight: Record<string, number> = {
    critical: 4,
    high: 3,
    medium: 2,
    low: 1,
  }

  const sortedFilteredTasks = [...filteredTasks].sort((a, b) => {
    const aDue = a.dueDate ? new Date(a.dueDate).getTime() : Number.POSITIVE_INFINITY
    const bDue = b.dueDate ? new Date(b.dueDate).getTime() : Number.POSITIVE_INFINITY
    if (a.status !== 'done' && b.status !== 'done' && aDue !== bDue) return aDue - bDue
    if (a.status !== b.status) return a.status === 'done' ? 1 : -1
    const pDiff = (priorityWeight[b.priority] || 0) - (priorityWeight[a.priority] || 0)
    if (pDiff !== 0) return pDiff
    const aCreated = a.createdAt ? new Date(a.createdAt).getTime() : 0
    const bCreated = b.createdAt ? new Date(b.createdAt).getTime() : 0
    return bCreated - aCreated
  })

  const kanbanTasks: KanbanTask[] = sortedFilteredTasks.map((task) => ({
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
  const assignedToMeTasks = useMemo(() => {
    if (!user?.id) return []
    return tasks.filter((task) => task.assignee?.id === user.id)
  }, [tasks, user?.id])
  const canManageVisibleTasks = ['admin', 'director', 'deputy_director', 'manager', 'deputy_head'].includes(user?.role || '')

  const workloadByUser = useMemo(() => {
    const map = new Map<string, { userId: string; name: string; active: number; overdue: number; critical: number }>()
    tasks.forEach((task) => {
      if (!task.assignee?.id || task.status === 'done') return
      const current = map.get(task.assignee.id) || {
        userId: task.assignee.id,
        name: `${task.assignee.firstName} ${task.assignee.lastName}`.trim(),
        active: 0,
        overdue: 0,
        critical: 0,
      }
      current.active += 1
      if (task.priority === 'critical') current.critical += 1
      if (task.dueDate && new Date(task.dueDate).getTime() < Date.now()) current.overdue += 1
      map.set(task.assignee.id, current)
    })
    return Array.from(map.values()).sort((a, b) => b.active - a.active)
  }, [tasks])

  const filteredTransparency = useMemo(() => {
    if (!filterDepartmentId) return transparency

    const byId = new Map(departments.map((dep) => [dep.id, dep]))
    const includeIds = new Set<string>([filterDepartmentId])

    // If selected item is a parent department, include all nested child departments.
    const queue: string[] = [filterDepartmentId]
    while (queue.length > 0) {
      const currentId = queue.shift()!
      const children = departments.filter((dep) => dep.parentId === currentId)
      for (const child of children) {
        if (!includeIds.has(child.id)) {
          includeIds.add(child.id)
          queue.push(child.id)
        }
      }
    }

    // If selected item is a section, also include itself only.
    if (!byId.has(filterDepartmentId)) return transparency

    return transparency.filter((row) => includeIds.has(row.departmentId))
  }, [transparency, filterDepartmentId, departments])

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
            <p className="text-sm font-medium mb-3">Фільтри задач</p>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <select value={filterDepartmentId} onChange={(e) => setFilterDepartmentId(e.target.value)} className="h-10 rounded-lg border border-slate-300 px-3 text-sm bg-white text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100">
                <option value="">Усі управління/відділи</option>
                {visibleDepartmentOptions.map((dep) => (
                  <option key={dep.id} value={dep.id}>
                    {dep.nameUk || dep.name || dep.id}
                  </option>
                ))}
              </select>
              <select value={filterAssigneeId} onChange={(e) => setFilterAssigneeId(e.target.value)} className="h-10 rounded-lg border border-slate-300 px-3 text-sm bg-white text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100">
                <option value="">Усі виконавці</option>
                {availableSorted.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.firstName} {member.lastName}
                  </option>
                ))}
              </select>
              <select value={filterReporterId} onChange={(e) => setFilterReporterId(e.target.value)} className="h-10 rounded-lg border border-slate-300 px-3 text-sm bg-white text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100">
                <option value="">Усі автори</option>
                {reporterOptions.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.firstName} {member.lastName}
                  </option>
                ))}
              </select>
              <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="h-10 rounded-lg border border-slate-300 px-3 text-sm bg-white text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100">
                <option value="">Усі статуси</option>
                <option value="todo">Заплановано</option>
                <option value="in_progress">В роботі</option>
                <option value="done">Виконано</option>
              </select>
              <select value={filterPriority} onChange={(e) => setFilterPriority(e.target.value)} className="h-10 rounded-lg border border-slate-300 px-3 text-sm bg-white text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100">
                <option value="">Усі пріоритети</option>
                <option value="critical">Critical</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
              <input type="date" value={filterDueFrom} onChange={(e) => setFilterDueFrom(e.target.value)} className="h-10 rounded-lg border border-slate-300 px-3 text-sm bg-white text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100" />
              <input type="date" value={filterDueTo} onChange={(e) => setFilterDueTo(e.target.value)} className="h-10 rounded-lg border border-slate-300 px-3 text-sm bg-white text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100" />
              <button
                onClick={() => {
                  setFilterDepartmentId('')
                  setFilterAssigneeId('')
                  setFilterReporterId('')
                  setFilterStatus('')
                  setFilterPriority('')
                  setFilterDueFrom('')
                  setFilterDueTo('')
                }}
                className="h-10 rounded-lg border border-slate-300 text-sm font-medium dark:border-slate-600"
              >
                Скинути фільтри
              </button>
            </div>
          </div>
        )}

        {isDirectorMode && assignDepartmentOptions.length > 0 && (
          <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3 dark:border-slate-700 dark:bg-slate-900">
            <p className="text-sm font-semibold">Вибір відділу для роботи з задачами</p>
            <div className="flex flex-wrap gap-2">
              {assignDepartmentOptions.map((dep) => (
                <button
                  key={dep.id}
                  onClick={() => setSelectedAssignDepartmentId(dep.id)}
                  className={`rounded-lg border px-3 py-2 text-xs ${
                    selectedAssignDepartmentId === dep.id
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-slate-300 text-slate-700 dark:border-slate-600 dark:text-slate-200'
                  }`}
                >
                  {dep.nameUk || dep.name || dep.id}
                </button>
              ))}
            </div>
            {selectedAssignDepartmentId && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                {availableSorted
                  .filter((member) => member.department?.id === selectedAssignDepartmentId)
                  .map((member) => (
                    <div key={member.id} className="rounded-lg border border-slate-200 p-2 dark:border-slate-700 dark:bg-slate-800/70">
                      <p className="text-sm font-semibold">{member.firstName} {member.lastName}</p>
                      <p className="text-xs text-slate-600 dark:text-slate-300">
                        Активні: <b>{loads[member.id] || 0}</b>
                      </p>
                    </div>
                  ))}
              </div>
            )}
          </div>
        )}

        <div className="rounded-2xl border border-slate-200 bg-white p-4 grid grid-cols-1 md:grid-cols-4 gap-3 dark:border-slate-700 dark:bg-slate-900">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="md:col-span-2 h-10 rounded-lg border border-slate-300 px-3 text-sm bg-white text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
            placeholder="Назва задачі"
          />
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="md:col-span-2 h-10 rounded-lg border border-slate-300 px-3 text-sm bg-white text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
            placeholder="Опис задачі"
          />
          <select value={priority} onChange={(e) => setPriority(e.target.value)} className="h-10 rounded-lg border border-slate-300 px-3 text-sm bg-white text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100">
            <option value="low">{getPriorityLabel('low')}</option>
            <option value="medium">{getPriorityLabel('medium')}</option>
            <option value="high">{getPriorityLabel('high')}</option>
            <option value="critical">{getPriorityLabel('critical')}</option>
          </select>
          <select
            value={selectedAssignDepartmentId || createDepartmentId}
            onChange={(e) => {
              setSelectedAssignDepartmentId(e.target.value)
              setCreateDepartmentId(e.target.value)
            }}
            className="h-10 rounded-lg border border-slate-300 px-3 text-sm bg-white text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
          >
            <option value="">Підрозділ для задачі</option>
            {(isDirectorMode ? assignDepartmentOptions : visibleDepartmentOptions).map((dep) => (
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
          <h2 className="text-base font-semibold mb-3">Загруженість співробітників</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            {workloadByUser.map((row) => (
              <div key={row.userId} className="rounded-lg border border-slate-200 p-2 dark:border-slate-700 dark:bg-slate-800/70">
                <p className="text-sm font-semibold">{row.name}</p>
                <p className="text-xs text-slate-600 dark:text-slate-300">
                  Активні: <b>{row.active}</b> · Прострочені: {row.overdue} · Critical: {row.critical}
                </p>
              </div>
            ))}
            {workloadByUser.length === 0 && <p className="text-sm text-slate-500 dark:text-slate-400">Дані поки відсутні.</p>}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
          <h2 className="text-base font-semibold mb-3">Прозорість між підрозділами</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {filteredTransparency.map((row) => (
              <div key={row.departmentId || row.departmentCode} className="rounded-lg border border-slate-200 p-2 dark:border-slate-700 dark:bg-slate-800/70">
                <p className="text-sm font-semibold">{row.departmentName}</p>
                <p className="text-xs text-slate-600 dark:text-slate-300">Всього: <b>{row.total}</b> · Активні: {row.todo + row.inProgress} · Done: {row.done}</p>
                <p className="text-xs text-slate-600 dark:text-slate-300">Critical: {row.critical} · High: {row.high} · Medium: {row.medium} · Low: {row.low}</p>
              </div>
            ))}
            {filteredTransparency.length === 0 && <p className="text-sm text-slate-500 dark:text-slate-400">Дані поки відсутні.</p>}
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
                  {canAssign && (
                    <div className="mt-2 flex items-center gap-2">
                      <select
                        value={reassignToUserId[task.id] || ''}
                        onChange={(e) => setReassignToUserId((prev) => ({ ...prev, [task.id]: e.target.value }))}
                        className="h-8 rounded border border-slate-300 px-2 text-xs bg-white text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                      >
                        <option value="">Перенаправити на...</option>
                        {availableSorted
                          .filter((member) => member.role !== 'director')
                          .filter((member) => !task.department?.id || member.department?.id === task.department.id)
                          .map((member) => (
                            <option key={member.id} value={member.id}>
                              {member.firstName} {member.lastName}
                            </option>
                          ))}
                      </select>
                      <button
                        onClick={() => reassignTask(task)}
                        disabled={reassigningTaskId === task.id || !(reassignToUserId[task.id] || '')}
                        className="rounded border border-primary px-2 py-1 text-xs text-primary disabled:opacity-60"
                      >
                        {reassigningTaskId === task.id ? '...' : 'Перенаправити'}
                      </button>
                    </div>
                  )}
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
          <h2 className="text-lg font-semibold">Задачі, призначені мені</h2>
          {assignedToMeTasks.length === 0 && (
            <p className="text-sm text-slate-500 dark:text-slate-400">Наразі призначених задач немає.</p>
          )}
          {assignedToMeTasks.map((task) => (
            <div key={task.id} className="flex items-center justify-between rounded-lg border border-slate-200 p-3 dark:border-slate-700">
              <div>
                <p className="text-sm font-medium">{task.title}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Статус: {task.status} · Автор: {task.reporter ? `${task.reporter.firstName} ${task.reporter.lastName}` : '—'}
                </p>
                <div className="mt-2 flex items-center gap-2">
                  <select
                    value={reassignToUserId[task.id] || ''}
                    onChange={(e) => setReassignToUserId((prev) => ({ ...prev, [task.id]: e.target.value }))}
                    className="h-8 rounded border border-slate-300 px-2 text-xs bg-white text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                  >
                    <option value="">Перенаправити на...</option>
                    {availableSorted
                      .filter((member) => member.role !== 'director')
                      .filter((member) => !task.department?.id || member.department?.id === task.department.id)
                      .map((member) => (
                        <option key={member.id} value={member.id}>
                          {member.firstName} {member.lastName}
                        </option>
                      ))}
                  </select>
                  <button
                    onClick={() => reassignTask(task)}
                    disabled={reassigningTaskId === task.id || !(reassignToUserId[task.id] || '')}
                    className="rounded border border-primary px-2 py-1 text-xs text-primary disabled:opacity-60"
                  >
                    {reassigningTaskId === task.id ? '...' : 'Перенаправити'}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        {canManageVisibleTasks && (
          <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3 dark:border-slate-700 dark:bg-slate-900">
            <h2 className="text-lg font-semibold">Керування видимими задачами</h2>
            {tasks.length === 0 && (
              <p className="text-sm text-slate-500 dark:text-slate-400">Задач для керування немає.</p>
            )}
            {tasks.map((task) => (
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
