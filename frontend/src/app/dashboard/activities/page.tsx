'use client'

import { useEffect, useMemo, useState } from 'react'
import { DashboardLayout } from '@/components/dashboard-layout'
import { useAuthStore } from '@/store/auth-store'
import Link from 'next/link'

type ActivityRow = {
  id: string
  index: number
  title: string
  location: string
  schedule: string
  responsible: string
}

type ActivityPlanResponse = {
  reportId: string
  periodType: 'weekly' | 'monthly'
  period: string
  title: string
  department?: { id: string; nameUk: string }
  rows: ActivityRow[]
  updatedAt: string
}

function currentMonth() {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  return `${year}-${month}`
}

function currentWeek() {
  const now = new Date()
  const d = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()))
  const day = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - day)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  const week = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7)
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`
}

export default function ActivitiesPage() {
  const { isAuthenticated } = useAuthStore()
  const [periodType, setPeriodType] = useState<'weekly' | 'monthly'>('monthly')
  const [period, setPeriod] = useState(currentMonth())
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [plan, setPlan] = useState<ActivityPlanResponse | null>(null)
  const [rows, setRows] = useState<ActivityRow[]>([])
  const accessToken = typeof window !== 'undefined' ? localStorage.getItem('vidlik-accessToken') : null

  const canWork = useMemo(() => !!accessToken && isAuthenticated, [accessToken, isAuthenticated])

  const loadPlanByPeriod = async () => {
    if (!canWork) return
    setLoading(true)
    setError('')
    const resp = await fetch(
      `/api/v1/reports/activities/plan?periodType=${encodeURIComponent(periodType)}&period=${encodeURIComponent(period)}`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      },
    )
    if (!resp.ok) {
      setError('Не вдалося завантажити план заходів')
      setLoading(false)
      return
    }
    const data = (await resp.json()) as ActivityPlanResponse
    setPlan(data)
    setRows(data.rows || [])
    setLoading(false)
  }

  useEffect(() => {
    loadPlanByPeriod()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period, periodType, canWork])

  useEffect(() => {
    setPeriod(periodType === 'weekly' ? currentWeek() : currentMonth())
  }, [periodType])

  const ensurePeriodInput = () => {
    if (periodType === 'weekly') return 'week'
    return 'month'
  }

  const exportCsv = async () => {
    if (!plan?.reportId || !accessToken) return
    const resp = await fetch(`/api/v1/reports/activities/plan/${plan.reportId}/export`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (!resp.ok) {
      setError('Не вдалося експортувати CSV')
      return
    }
    const data = await resp.json()
    const csv = data?.csv || ''
    const fileName = data?.fileName || `zahody-${period}.csv`
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = fileName
    link.click()
    URL.revokeObjectURL(url)
  }

  const addRow = () => {
    setRows((prev) => [
      ...prev,
      {
        id: `temp-${Date.now()}`,
        index: prev.length + 1,
        title: '',
        location: '',
        schedule: '',
        responsible: '',
      },
    ])
  }

  const updateLocalRow = (id: string, key: keyof ActivityRow, value: string) => {
    setRows((prev) => prev.map((row) => (row.id === id ? { ...row, [key]: value } : row)))
  }

  const saveRow = async (row: ActivityRow) => {
    if (!plan?.reportId || !accessToken) return
    if (!row.title.trim()) {
      setError('Поле "Назва заходу" обовʼязкове')
      return
    }
    setSaving(true)
    setError('')
    const payload = {
      id: row.id.startsWith('temp-') ? undefined : row.id,
      title: row.title,
      location: row.location,
      schedule: row.schedule,
      responsible: row.responsible,
    }
    const resp = await fetch(`/api/v1/reports/activities/plan/${plan.reportId}/rows`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })
    setSaving(false)
    if (!resp.ok) {
      const data = await resp.json().catch(() => null)
      setError(data?.message || 'Не вдалося зберегти рядок')
      return
    }
    const data = (await resp.json()) as ActivityPlanResponse
    setPlan(data)
    setRows(data.rows || [])
  }

  const removeRow = async (rowId: string) => {
    if (!plan?.reportId || !accessToken) return
    if (rowId.startsWith('temp-')) {
      setRows((prev) => prev.filter((item) => item.id !== rowId))
      return
    }

    const resp = await fetch(`/api/v1/reports/activities/plan/${plan.reportId}/rows/${rowId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (!resp.ok) {
      const data = await resp.json().catch(() => null)
      setError(data?.message || 'Не вдалося видалити рядок')
      return
    }
    await loadPlanByPeriod()
  }

  return (
    <DashboardLayout>
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold font-display">План заходів</h1>
            <p className="text-slate-500 mt-1">Спільна таблиця департаменту: заповнення, зведення, експорт</p>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={periodType}
              onChange={(e) => setPeriodType(e.target.value as 'weekly' | 'monthly')}
              className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
            >
              <option value="monthly">Місяць</option>
              <option value="weekly">Тиждень</option>
            </select>
            <input
              type={ensurePeriodInput()}
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
              className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
            />
            <button
              type="button"
              onClick={addRow}
              className="h-10 rounded-lg border border-primary px-3 text-sm text-primary hover:bg-primary/10"
            >
              Додати рядок
            </button>
            <button
              type="button"
              onClick={exportCsv}
              className="h-10 rounded-lg bg-primary px-3 text-sm text-white hover:opacity-90"
            >
              Експорт CSV
            </button>
            <Link
              href={`/dashboard/activities/print?periodType=${encodeURIComponent(periodType)}&period=${encodeURIComponent(period)}`}
              className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-700 hover:bg-slate-50 inline-flex items-center"
            >
              Друк-версія
            </Link>
          </div>
        </div>

        {error && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-800 dark:bg-rose-950/30 dark:text-rose-300">
            {error}
          </div>
        )}

        <div className="rounded-2xl border border-slate-200 bg-white overflow-auto dark:border-slate-700 dark:bg-slate-900">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800/60">
              <tr>
                <th className="px-3 py-2 text-left font-semibold text-slate-600 dark:text-slate-300">№</th>
                <th className="px-3 py-2 text-left font-semibold text-slate-600 dark:text-slate-300">Назва заходу</th>
                <th className="px-3 py-2 text-left font-semibold text-slate-600 dark:text-slate-300">Місце проведення заходу</th>
                <th className="px-3 py-2 text-left font-semibold text-slate-600 dark:text-slate-300">Дата та час проведення заходу</th>
                <th className="px-3 py-2 text-left font-semibold text-slate-600 dark:text-slate-300">Відповідальний</th>
                <th className="px-3 py-2 text-right font-semibold text-slate-600 dark:text-slate-300">Дії</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-slate-500 dark:text-slate-400">Завантаження...</td>
                </tr>
              )}
              {!loading && rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-slate-500 dark:text-slate-400">Рядків поки немає</td>
                </tr>
              )}
              {!loading && rows.map((row, idx) => (
                <tr key={row.id} className="border-t border-slate-100 dark:border-slate-800">
                  <td className="px-3 py-2 align-top text-slate-500 dark:text-slate-400">{idx + 1}</td>
                  <td className="px-3 py-2 align-top">
                    <textarea
                      value={row.title}
                      onChange={(e) => updateLocalRow(row.id, 'title', e.target.value)}
                      rows={2}
                      className="w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                    />
                  </td>
                  <td className="px-3 py-2 align-top">
                    <textarea
                      value={row.location}
                      onChange={(e) => updateLocalRow(row.id, 'location', e.target.value)}
                      rows={2}
                      className="w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                    />
                  </td>
                  <td className="px-3 py-2 align-top">
                    <textarea
                      value={row.schedule}
                      onChange={(e) => updateLocalRow(row.id, 'schedule', e.target.value)}
                      rows={2}
                      className="w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                    />
                  </td>
                  <td className="px-3 py-2 align-top">
                    <textarea
                      value={row.responsible}
                      onChange={(e) => updateLocalRow(row.id, 'responsible', e.target.value)}
                      rows={2}
                      className="w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                    />
                  </td>
                  <td className="px-3 py-2 align-top text-right">
                    <div className="inline-flex gap-2">
                      <button
                        type="button"
                        onClick={() => saveRow(row)}
                        disabled={saving}
                        className="rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-100 disabled:opacity-60 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700"
                      >
                        Зберегти
                      </button>
                      <button
                        type="button"
                        onClick={() => removeRow(row.id)}
                        className="rounded-md border border-rose-300 px-2 py-1 text-xs text-rose-700 hover:bg-rose-50 dark:border-rose-700 dark:text-rose-300 dark:hover:bg-rose-950/30"
                      >
                        Видалити
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </DashboardLayout>
  )
}
