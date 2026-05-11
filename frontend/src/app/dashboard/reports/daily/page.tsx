'use client'

import { useEffect, useMemo, useState } from 'react'
import { DashboardLayout } from '@/components/dashboard-layout'
import { useAuthStore } from '@/store/auth-store'
import { extractApiErrorMessage } from '@/lib/error-message'

type LinkedTask = {
  id: string
  title: string
  status: string
  statusLabel: string
  dueDate?: string | null
  assignee: { id: string; firstName: string; lastName: string } | null
}

type DailyReport = {
  id: string
  date: string
  text: string
  author: { id: string; firstName: string; lastName: string } | null
  department: { id: string; nameUk: string } | null
  tasks: LinkedTask[]
  updatedAt: string
}

type MyTask = {
  id: string
  title: string
  status: string
  department?: { id: string; nameUk?: string } | null
}

type DepartmentOption = { id: string; name?: string; nameUk?: string; parentId?: string | null }

function todayStr() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

function offsetDate(days: number) {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function startOfWeek() {
  const d = new Date()
  const day = d.getDay() || 7
  d.setDate(d.getDate() - day + 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function startOfMonth() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

const STATUS_BADGE: Record<string, string> = {
  todo: 'bg-sky-100 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300',
  in_progress: 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300',
  done: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300',
}

export default function DailyReportsPage() {
  const { user } = useAuthStore()
  const accessToken = typeof window !== 'undefined' ? localStorage.getItem('vidlik-accessToken') : null

  const isLeadership = ['manager', 'director', 'deputy_director', 'admin'].includes(user?.role || '')

  // My report
  const [selectedDate, setSelectedDate] = useState(todayStr())
  const [myReport, setMyReport] = useState<DailyReport | null>(null)
  const [text, setText] = useState('')
  const [saving, setSaving] = useState(false)
  const [loadingMy, setLoadingMy] = useState(false)

  // My tasks for linking
  const [myTasks, setMyTasks] = useState<MyTask[]>([])
  const [attachingTaskId, setAttachingTaskId] = useState('')
  const [taskPickerOpen, setTaskPickerOpen] = useState(false)

  // Team view
  const [teamReports, setTeamReports] = useState<DailyReport[]>([])
  const [loadingTeam, setLoadingTeam] = useState(false)
  const [filterDepartmentId, setFilterDepartmentId] = useState('')
  const [filterDateFrom, setFilterDateFrom] = useState(todayStr())
  const [filterDateTo, setFilterDateTo] = useState(todayStr())
  const [activePeriodBtn, setActivePeriodBtn] = useState<'today' | 'week' | 'month' | 'custom'>('today')
  const [allDepartments, setAllDepartments] = useState<DepartmentOption[]>([])

  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 2500)
    return () => clearTimeout(t)
  }, [toast])

  useEffect(() => {
    if (!accessToken) return
    fetch('/api/v1/departments', { headers: { Authorization: `Bearer ${accessToken}` } })
      .then((r) => r.json())
      .then((d) => setAllDepartments(Array.isArray(d) ? d : []))
      .catch(() => {})
  }, [accessToken])

  // Load my tasks
  useEffect(() => {
    if (!accessToken) return
    fetch('/api/v1/tasks?limit=100', { headers: { Authorization: `Bearer ${accessToken}` } })
      .then((r) => r.json())
      .then((d) => setMyTasks(Array.isArray(d?.data) ? d.data : []))
      .catch(() => {})
  }, [accessToken])

  const scopedDepartments = useMemo(() => {
    if (!isLeadership) return []
    return allDepartments
  }, [allDepartments, isLeadership])

  const loadMyReport = async () => {
    if (!accessToken || !selectedDate) return
    setLoadingMy(true)
    const resp = await fetch(`/api/v1/reports/daily/${selectedDate}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (resp.ok) {
      const data: DailyReport = await resp.json()
      setMyReport(data)
      setText(data.text || '')
    }
    setLoadingMy(false)
  }

  const saveReport = async () => {
    if (!accessToken || !myReport) return
    setSaving(true)
    const resp = await fetch(`/api/v1/reports/daily/${myReport.id}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    })
    setSaving(false)
    if (resp.ok) {
      const data: DailyReport = await resp.json()
      setMyReport(data)
      setToast({ type: 'success', message: 'Збережено' })
      return
    }
    const err = await resp.json().catch(() => null)
    setToast({ type: 'error', message: extractApiErrorMessage(resp.status, err, 'Не вдалося зберегти') })
  }

  const attachTask = async (taskId: string) => {
    if (!accessToken || !myReport || attachingTaskId) return
    setAttachingTaskId(taskId)
    const resp = await fetch(`/api/v1/reports/daily/${myReport.id}/tasks/${taskId}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    setAttachingTaskId('')
    if (resp.ok) {
      const data: DailyReport = await resp.json()
      setMyReport(data)
      setTaskPickerOpen(false)
      setToast({ type: 'success', message: 'Задачу прикріплено' })
      return
    }
    const err = await resp.json().catch(() => null)
    setToast({ type: 'error', message: extractApiErrorMessage(resp.status, err, 'Не вдалося прикріпити задачу') })
  }

  const detachTask = async (taskId: string) => {
    if (!accessToken || !myReport) return
    const resp = await fetch(`/api/v1/reports/daily/${myReport.id}/tasks/${taskId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (resp.ok) {
      const data: DailyReport = await resp.json()
      setMyReport(data)
      setToast({ type: 'success', message: 'Задачу відкріплено' })
      return
    }
    const err = await resp.json().catch(() => null)
    setToast({ type: 'error', message: extractApiErrorMessage(resp.status, err, 'Не вдалося відкріпити задачу') })
  }

  const loadTeamReports = async (deptId = filterDepartmentId, from = filterDateFrom, to = filterDateTo) => {
    if (!accessToken || !isLeadership) return
    setLoadingTeam(true)
    const params = new URLSearchParams()
    if (deptId) params.set('departmentId', deptId)
    if (from) params.set('dateFrom', from)
    if (to) params.set('dateTo', to)
    const resp = await fetch(`/api/v1/reports/daily?${params.toString()}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (resp.ok) {
      const data = await resp.json()
      setTeamReports(Array.isArray(data) ? data : [])
    }
    setLoadingTeam(false)
  }

  const applyPeriod = (preset: 'today' | 'week' | 'month') => {
    let from: string
    const to = todayStr()
    if (preset === 'today') { from = todayStr() }
    else if (preset === 'week') { from = startOfWeek() }
    else { from = startOfMonth() }
    setActivePeriodBtn(preset)
    setFilterDateFrom(from)
    setFilterDateTo(to)
    loadTeamReports(filterDepartmentId, from, to)
  }

  useEffect(() => {
    loadMyReport()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate, accessToken])

  useEffect(() => {
    if (isLeadership && accessToken) {
      loadTeamReports(filterDepartmentId, filterDateFrom, filterDateTo)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLeadership, accessToken])

  const groupedTeamReports = useMemo(() => {
    const map = new Map<string, DailyReport[]>()
    for (const r of teamReports) {
      const key = r.date
      map.set(key, [...(map.get(key) || []), r])
    }
    return Array.from(map.entries()).sort((a, b) => b[0].localeCompare(a[0]))
  }, [teamReports])

  const periodBtnClass = (btn: string) =>
    `h-8 rounded-lg px-3 text-xs font-medium border transition ${
      activePeriodBtn === btn
        ? 'border-primary bg-primary text-white'
        : 'border-slate-300 bg-white text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200'
    }`

  // Tasks not yet linked
  const linkedIds = new Set((myReport?.tasks || []).map((t) => t.id))
  const availableToAttach = myTasks.filter((t) => !linkedIds.has(t.id))

  return (
    <DashboardLayout>
      <div className="max-w-7xl mx-auto space-y-6">
        {toast && (
          <div className={`fixed right-5 top-5 z-[100] rounded-xl px-4 py-2 text-sm font-medium shadow-lg ${
            toast.type === 'success'
              ? 'border border-emerald-200 bg-emerald-50 text-emerald-700'
              : 'border border-rose-200 bg-rose-50 text-rose-700'
          }`}>
            {toast.message}
          </div>
        )}

        <div>
          <h1 className="text-2xl font-semibold font-display">Денний звіт</h1>
          <p className="text-slate-500 mt-1">Щоденний запис виконаної роботи</p>
        </div>

        {/* My report */}
        <div className="rounded-2xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900 p-4 space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-sm font-semibold">Мій звіт</p>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="h-9 rounded-lg border border-slate-300 px-3 text-sm bg-white text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
            />
            <div className="flex gap-1">
              <button onClick={() => setSelectedDate(offsetDate(-1))} className="h-9 rounded-lg border border-slate-300 px-2.5 text-xs dark:border-slate-600">← Вчора</button>
              <button onClick={() => setSelectedDate(todayStr())} className="h-9 rounded-lg border border-slate-300 px-2.5 text-xs dark:border-slate-600">Сьогодні</button>
            </div>
          </div>

          {loadingMy ? (
            <p className="text-sm text-slate-500">Завантаження...</p>
          ) : (
            <>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={6}
                placeholder="Що було зроблено за сьогодні? Опишіть виконану роботу, зустрічі, прийняті рішення..."
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 resize-none"
              />

              {/* Linked tasks */}
              {myReport && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                      Прикріплені задачі {myReport.tasks.length > 0 && `(${myReport.tasks.length})`}
                    </p>
                    <button
                      onClick={() => setTaskPickerOpen((v) => !v)}
                      className="text-xs text-primary hover:underline"
                    >
                      {taskPickerOpen ? 'Закрити' : '+ Прикріпити задачу'}
                    </button>
                  </div>

                  {taskPickerOpen && (
                    <div className="rounded-lg border border-slate-200 dark:border-slate-700 divide-y divide-slate-100 dark:divide-slate-800 max-h-48 overflow-y-auto">
                      {availableToAttach.length === 0 && (
                        <p className="px-3 py-2 text-xs text-slate-500">Немає доступних задач</p>
                      )}
                      {availableToAttach.map((t) => (
                        <button
                          key={t.id}
                          onClick={() => attachTask(t.id)}
                          disabled={attachingTaskId === t.id}
                          className="w-full text-left px-3 py-2 text-xs hover:bg-slate-50 dark:hover:bg-slate-800/60 transition flex items-center justify-between gap-2"
                        >
                          <span className="flex-1 line-clamp-1">{t.title}</span>
                          <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${STATUS_BADGE[t.status] || ''}`}>
                            {t.status === 'todo' ? 'Нове' : t.status === 'in_progress' ? 'В роботі' : 'Виконано'}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}

                  {myReport.tasks.length > 0 && (
                    <div className="space-y-1">
                      {myReport.tasks.map((t) => (
                        <div key={t.id} className="flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2">
                          <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${STATUS_BADGE[t.status] || ''}`}>
                            {t.statusLabel}
                          </span>
                          <span className="flex-1 text-xs text-slate-800 dark:text-slate-200 line-clamp-1">{t.title}</span>
                          <button
                            onClick={() => detachTask(t.id)}
                            className="shrink-0 text-xs text-slate-400 hover:text-rose-600 transition"
                            title="Відкріпити"
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div className="flex items-center gap-3">
                <button
                  onClick={saveReport}
                  disabled={saving}
                  className="h-9 rounded-lg bg-primary px-4 text-sm font-medium text-white disabled:opacity-60"
                >
                  {saving ? 'Збереження...' : 'Зберегти'}
                </button>
                {myReport?.updatedAt && (
                  <p className="text-xs text-slate-400">
                    Оновлено: {new Date(myReport.updatedAt).toLocaleString('uk-UA')}
                  </p>
                )}
              </div>
            </>
          )}
        </div>

        {/* Leadership team view */}
        {isLeadership && (
          <div className="rounded-2xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900 p-4 space-y-4">
            <p className="text-sm font-semibold">Звіти команди</p>

            <div className="flex flex-wrap items-center gap-2">
              <button className={periodBtnClass('today')} onClick={() => applyPeriod('today')}>Сьогодні</button>
              <button className={periodBtnClass('week')} onClick={() => applyPeriod('week')}>Цей тиждень</button>
              <button className={periodBtnClass('month')} onClick={() => applyPeriod('month')}>Цей місяць</button>
              <span className="text-xs text-slate-400 dark:text-slate-500">або:</span>
              <input
                type="date"
                value={filterDateFrom}
                onChange={(e) => { setFilterDateFrom(e.target.value); setActivePeriodBtn('custom') }}
                className="h-8 rounded-lg border border-slate-300 px-2 text-xs bg-white text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
              />
              <span className="text-xs text-slate-400">—</span>
              <input
                type="date"
                value={filterDateTo}
                onChange={(e) => { setFilterDateTo(e.target.value); setActivePeriodBtn('custom') }}
                className="h-8 rounded-lg border border-slate-300 px-2 text-xs bg-white text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
              />
              {activePeriodBtn === 'custom' && (
                <button
                  onClick={() => loadTeamReports(filterDepartmentId, filterDateFrom, filterDateTo)}
                  className="h-8 rounded-lg border border-slate-300 px-3 text-xs dark:border-slate-600"
                >
                  Застосувати
                </button>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => { setFilterDepartmentId(''); loadTeamReports('', filterDateFrom, filterDateTo) }}
                className={`h-8 rounded-lg px-3 text-xs font-medium border transition ${
                  !filterDepartmentId
                    ? 'border-primary bg-primary text-white'
                    : 'border-slate-300 bg-white text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200'
                }`}
              >
                Усі відділи
              </button>
              {scopedDepartments.map((d) => (
                <button
                  key={d.id}
                  onClick={() => { setFilterDepartmentId(d.id); loadTeamReports(d.id, filterDateFrom, filterDateTo) }}
                  className={`h-8 rounded-lg px-3 text-xs font-medium border transition ${
                    filterDepartmentId === d.id
                      ? 'border-primary bg-primary text-white'
                      : 'border-slate-300 bg-white text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200'
                  }`}
                >
                  {d.nameUk || d.name}
                </button>
              ))}
            </div>

            {loadingTeam && <p className="text-sm text-slate-500">Завантаження...</p>}

            {!loadingTeam && groupedTeamReports.length === 0 && (
              <p className="text-sm text-slate-500 dark:text-slate-400">Звітів за обраний період немає.</p>
            )}

            <div className="space-y-5">
              {groupedTeamReports.map(([date, reports]) => (
                <div key={date}>
                  <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2 pb-1 border-b border-slate-100 dark:border-slate-800">
                    {new Date(date + 'T12:00:00Z').toLocaleDateString('uk-UA', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                    <span className="ml-2 font-normal normal-case">· {reports.length} {reports.length === 1 ? 'запис' : reports.length < 5 ? 'записи' : 'записів'}</span>
                  </p>
                  <div className="space-y-2">
                    {reports.map((r) => (
                      <div key={r.id} className="rounded-lg border border-slate-200 dark:border-slate-700 p-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-medium">
                            {r.author ? `${r.author.firstName} ${r.author.lastName}` : 'Невідомий'}
                            {r.department && (
                              <span className="ml-2 text-xs font-normal text-slate-500 dark:text-slate-400">
                                · {r.department.nameUk}
                              </span>
                            )}
                          </p>
                          <p className="text-xs text-slate-400 shrink-0">
                            {new Date(r.updatedAt).toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' })}
                          </p>
                        </div>
                        {r.text ? (
                          <p className="text-sm whitespace-pre-wrap text-slate-700 dark:text-slate-300">{r.text}</p>
                        ) : (
                          <p className="text-sm text-slate-400 dark:text-slate-500 italic">Порожній звіт</p>
                        )}
                        {r.tasks && r.tasks.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 pt-1 border-t border-slate-100 dark:border-slate-800">
                            {r.tasks.map((t) => (
                              <span key={t.id} className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_BADGE[t.status] || 'bg-slate-100 text-slate-600'}`}>
                                {t.title}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  )
}
