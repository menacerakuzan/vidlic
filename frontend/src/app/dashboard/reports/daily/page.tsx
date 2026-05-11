'use client'

import { useEffect, useMemo, useState } from 'react'
import { DashboardLayout } from '@/components/dashboard-layout'
import { useAuthStore } from '@/store/auth-store'
import { extractApiErrorMessage } from '@/lib/error-message'

type DailyReport = {
  id: string
  date: string
  text: string
  author: { id: string; firstName: string; lastName: string } | null
  department: { id: string; nameUk: string } | null
  updatedAt: string
}

type DepartmentOption = { id: string; name?: string; nameUk?: string }

function todayStr() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

export default function DailyReportsPage() {
  const { user } = useAuthStore()
  const accessToken = typeof window !== 'undefined' ? localStorage.getItem('vidlik-accessToken') : null

  const isLeadership = ['manager', 'director', 'deputy_director', 'admin'].includes(user?.role || '')

  const [selectedDate, setSelectedDate] = useState(todayStr())
  const [myReport, setMyReport] = useState<DailyReport | null>(null)
  const [text, setText] = useState('')
  const [saving, setSaving] = useState(false)
  const [loadingMy, setLoadingMy] = useState(false)

  const [teamReports, setTeamReports] = useState<DailyReport[]>([])
  const [loadingTeam, setLoadingTeam] = useState(false)
  const [filterDepartmentId, setFilterDepartmentId] = useState('')
  const [filterDateFrom, setFilterDateFrom] = useState(todayStr())
  const [filterDateTo, setFilterDateTo] = useState(todayStr())
  const [departments, setDepartments] = useState<DepartmentOption[]>([])

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
      .then((d) => setDepartments(Array.isArray(d) ? d : []))
      .catch(() => {})
  }, [accessToken])

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

  const loadTeamReports = async () => {
    if (!accessToken || !isLeadership) return
    setLoadingTeam(true)
    const params = new URLSearchParams()
    if (filterDepartmentId) params.set('departmentId', filterDepartmentId)
    if (filterDateFrom) params.set('dateFrom', filterDateFrom)
    if (filterDateTo) params.set('dateTo', filterDateTo)
    const resp = await fetch(`/api/v1/reports/daily?${params.toString()}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (resp.ok) {
      const data = await resp.json()
      setTeamReports(Array.isArray(data) ? data : [])
    }
    setLoadingTeam(false)
  }

  useEffect(() => {
    loadMyReport()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate, accessToken])

  useEffect(() => {
    if (isLeadership) loadTeamReports()
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

        {/* My report block */}
        <div className="rounded-2xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900 p-4 space-y-3">
          <div className="flex items-center gap-3">
            <p className="text-sm font-semibold">Мій звіт за день</p>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="h-9 rounded-lg border border-slate-300 px-3 text-sm bg-white text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
            />
          </div>
          {loadingMy ? (
            <p className="text-sm text-slate-500">Завантаження...</p>
          ) : (
            <>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={8}
                placeholder="Що було зроблено за сьогодні? Опишіть виконану роботу, зустрічі, прийняті рішення..."
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 resize-none"
              />
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

        {/* Leadership view */}
        {isLeadership && (
          <div className="rounded-2xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900 p-4 space-y-4">
            <p className="text-sm font-semibold">Звіти команди</p>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <select
                value={filterDepartmentId}
                onChange={(e) => setFilterDepartmentId(e.target.value)}
                className="h-9 rounded-lg border border-slate-300 px-3 text-sm bg-white text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
              >
                <option value="">Усі відділи</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>{d.nameUk || d.name}</option>
                ))}
              </select>
              <input
                type="date"
                value={filterDateFrom}
                onChange={(e) => setFilterDateFrom(e.target.value)}
                className="h-9 rounded-lg border border-slate-300 px-3 text-sm bg-white text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
              />
              <input
                type="date"
                value={filterDateTo}
                onChange={(e) => setFilterDateTo(e.target.value)}
                className="h-9 rounded-lg border border-slate-300 px-3 text-sm bg-white text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
              />
              <button
                onClick={loadTeamReports}
                className="h-9 rounded-lg border border-slate-300 px-4 text-sm font-medium dark:border-slate-600"
              >
                Завантажити
              </button>
            </div>

            {loadingTeam && <p className="text-sm text-slate-500">Завантаження...</p>}

            {!loadingTeam && groupedTeamReports.length === 0 && (
              <p className="text-sm text-slate-500 dark:text-slate-400">Звітів за обраний період немає.</p>
            )}

            {groupedTeamReports.map(([date, reports]) => (
              <div key={date} className="space-y-2">
                <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                  {new Date(date + 'T12:00:00Z').toLocaleDateString('uk-UA', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                </p>
                {reports.map((r) => (
                  <div key={r.id} className="rounded-lg border border-slate-200 dark:border-slate-700 p-3">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-sm font-medium">
                        {r.author ? `${r.author.firstName} ${r.author.lastName}` : 'Невідомий'}
                        {r.department && (
                          <span className="ml-2 text-xs font-normal text-slate-500 dark:text-slate-400">
                            · {r.department.nameUk}
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-slate-400">{new Date(r.updatedAt).toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' })}</p>
                    </div>
                    {r.text ? (
                      <p className="text-sm whitespace-pre-wrap text-slate-700 dark:text-slate-300">{r.text}</p>
                    ) : (
                      <p className="text-sm text-slate-400 italic">Порожній звіт</p>
                    )}
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  )
}
