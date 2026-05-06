'use client'

import { useEffect, useMemo, useState } from 'react'
import { DashboardLayout } from '@/components/dashboard-layout'
import { extractApiErrorMessage } from '@/lib/error-message'

type Task = {
  id: string
  title: string
  status: 'todo' | 'in_progress' | 'done'
  dueDate?: string
  startedAt?: string | null
  assignee?: { id: string; firstName: string; lastName: string }
  department?: { id: string; name?: string; nameUk?: string }
}

type DepartmentColumn = {
  departmentId: string
  departmentName: string
  tasks: Task[]
  divisionTag?: string | null
}

type DepartmentOption = {
  id: string
  name?: string
  nameUk?: string
  divisionTag?: string | null
}

const statusFilters: Array<{ id: 'todo' | 'in_progress' | 'done'; label: string; dot: string }> = [
  { id: 'todo', label: 'Нове', dot: 'bg-sky-500' },
  { id: 'in_progress', label: 'В роботі', dot: 'bg-amber-500' },
  { id: 'done', label: 'Виконано', dot: 'bg-emerald-500' },
]

export default function WorkloadPage() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [departments, setDepartments] = useState<DepartmentOption[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedStatuses, setSelectedStatuses] = useState<Array<'todo' | 'in_progress' | 'done'>>(['todo', 'in_progress', 'done'])
  const [selectedManagement, setSelectedManagement] = useState('')
  const [selectedDepartmentId, setSelectedDepartmentId] = useState('')
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

  useEffect(() => {
    loadTasks()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken])

  useEffect(() => {
    if (!accessToken) return
    const loadDepartments = async () => {
      const resp = await fetch('/api/v1/departments', {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      if (!resp.ok) return
      const data = await resp.json()
      setDepartments(Array.isArray(data) ? data : [])
    }
    loadDepartments()
  }, [accessToken])

  const toggleStatus = (status: 'todo' | 'in_progress' | 'done') => {
    setSelectedStatuses((prev) => {
      if (prev.includes(status)) return prev.filter((s) => s !== status)
      return [...prev, status]
    })
  }

  const columns = useMemo(() => {
    const filtered = tasks.filter((task) => selectedStatuses.includes(task.status))
    const map = new Map<string, DepartmentColumn>()

    filtered.forEach((task) => {
      const departmentId = task.department?.id || 'without-department'
      const departmentName = task.department?.nameUk || task.department?.name || 'Без підрозділу'
      const item = map.get(departmentId) || { departmentId, departmentName, tasks: [] }
      item.tasks.push(task)
      map.set(departmentId, item)
    })

    const prepared = Array.from(map.values())
      .map((col) => ({
        ...col,
        divisionTag: departments.find((dep) => dep.id === col.departmentId)?.divisionTag || null,
        tasks: [...col.tasks].sort((a, b) => {
          if (a.status !== b.status) {
            const order = { todo: 0, in_progress: 1, done: 2 }
            return order[a.status] - order[b.status]
          }
          return a.title.localeCompare(b.title, 'uk')
        }),
      }))
      .sort((a, b) => a.departmentName.localeCompare(b.departmentName, 'uk'))
    return prepared.filter((col) => {
      if (selectedDepartmentId && col.departmentId !== selectedDepartmentId) return false
      if (selectedManagement && (col.divisionTag || '') !== selectedManagement) return false
      return true
    })
  }, [tasks, selectedStatuses, departments, selectedDepartmentId, selectedManagement])

  const managementOptions = useMemo(() => {
    return Array.from(new Set(departments.map((d) => (d.divisionTag || '').trim()).filter(Boolean))).sort((a, b) =>
      a.localeCompare(b, 'uk'),
    )
  }, [departments])

  const departmentOptions = useMemo(() => {
    return departments
      .filter((d) => {
        if (!selectedManagement) return true
        return (d.divisionTag || '').trim() === selectedManagement
      })
      .sort((a, b) => (a.nameUk || a.name || '').localeCompare(b.nameUk || b.name || '', 'uk'))
  }, [departments, selectedManagement])

  const statusMeta = (status: Task['status']) => {
    if (status === 'todo') return { label: 'Нове', cls: 'bg-sky-100 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300' }
    if (status === 'in_progress') return { label: 'В роботі', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300' }
    return { label: 'Виконано', cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300' }
  }

  return (
    <DashboardLayout>
      <div className="max-w-[1500px] mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-semibold font-display">Навантаження співробітників</h1>
          <p className="text-slate-500 mt-1">Всі відділи, їх поточні задачі та статуси</p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
          <p className="text-sm font-semibold mb-3">Фільтр статусів</p>
          <div className="flex flex-wrap gap-2">
            {statusFilters.map((item) => {
              const active = selectedStatuses.includes(item.id)
              return (
                <button
                  key={item.id}
                  onClick={() => toggleStatus(item.id)}
                  className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition ${active ? 'border-primary bg-primary/10 text-primary' : 'border-slate-300 text-slate-700 dark:border-slate-600 dark:text-slate-200'}`}
                >
                  <span className={`h-2.5 w-2.5 rounded-full ${item.dot}`} />
                  {item.label}
                </button>
              )
            })}
          </div>
          <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-2">
            <select
              value={selectedManagement}
              onChange={(e) => {
                setSelectedManagement(e.target.value)
                setSelectedDepartmentId('')
              }}
              className="h-10 rounded-lg border border-slate-300 px-3 text-sm bg-white text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
            >
              <option value="">Усі управління</option>
              {managementOptions.map((tag) => (
                <option key={tag} value={tag}>{tag}</option>
              ))}
            </select>
            <select
              value={selectedDepartmentId}
              onChange={(e) => setSelectedDepartmentId(e.target.value)}
              className="h-10 rounded-lg border border-slate-300 px-3 text-sm bg-white text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
            >
              <option value="">Усі відділи</option>
              {departmentOptions.map((dep) => (
                <option key={dep.id} value={dep.id}>{dep.nameUk || dep.name || dep.id}</option>
              ))}
            </select>
            <button
              onClick={() => {
                setSelectedManagement('')
                setSelectedDepartmentId('')
              }}
              className="h-10 rounded-lg border border-slate-300 px-3 text-sm dark:border-slate-600"
            >
              Скинути фільтри
            </button>
          </div>
        </div>

        {error && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-800 dark:bg-rose-950/30 dark:text-rose-300">
            {error}
          </div>
        )}

        {loading ? (
          <div className="rounded-xl border border-slate-200 bg-white px-4 py-6 text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">Завантаження...</div>
        ) : (
          <div className="overflow-x-auto">
            <div className="min-w-max flex items-start gap-3 pb-2">
              {columns.map((column) => (
                <div
                  key={column.departmentId}
                  className="w-[320px] rounded-2xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900"
                >
                  <div className="mb-3 border-b border-slate-200 pb-2 dark:border-slate-700">
                    <p className="text-sm font-semibold">{column.departmentName}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">Задач: {column.tasks.length}</p>
                  </div>

                  <div className="space-y-2 max-h-[68vh] overflow-y-auto pr-1">
                    {column.tasks.map((task) => {
                      const meta = statusMeta(task.status)
                      return (
                        <div key={task.id} className="rounded-xl border border-slate-200 p-2 dark:border-slate-700 dark:bg-slate-800/50">
                          <p className="text-sm font-medium leading-snug">{task.title}</p>
                          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                            {task.assignee ? `${task.assignee.firstName} ${task.assignee.lastName}` : 'Без виконавця'}
                          </p>
                          <div className="mt-2 flex items-center justify-between">
                            <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${meta.cls}`}>
                              {meta.label}
                            </span>
                            <span className="text-[11px] text-slate-400 dark:text-slate-500">
                              {task.dueDate ? new Date(task.dueDate).toLocaleDateString('uk-UA') : 'Без терміну'}
                            </span>
                          </div>
                          {task.startedAt && (
                            <p className="mt-1 text-[11px] text-emerald-700 dark:text-emerald-400">
                              Почато: {new Date(task.startedAt).toLocaleString('uk-UA')}
                            </p>
                          )}
                        </div>
                      )
                    })}
                    {column.tasks.length === 0 && (
                      <p className="text-sm text-slate-500 dark:text-slate-400">Немає задач для обраних статусів.</p>
                    )}
                  </div>
                </div>
              ))}
              {columns.length === 0 && (
                <div className="rounded-xl border border-slate-200 bg-white px-4 py-6 text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
                  Дані відсутні для обраних статусів.
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  )
}
