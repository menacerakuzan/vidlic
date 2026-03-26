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
  createdById?: string | null
}

const editableColumns: Array<keyof Pick<ActivityRow, 'title' | 'location' | 'schedule' | 'responsible'>> = [
  'title',
  'location',
  'schedule',
  'responsible',
]

type ActivityPlanResponse = {
  reportId: string
  periodType: 'weekly' | 'monthly'
  period: string
  title: string
  department?: { id: string; nameUk: string }
  rows: ActivityRow[]
  isLocked?: boolean
  lockedAt?: string | null
  lockedById?: string | null
  version?: number
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
  const { isAuthenticated, user } = useAuthStore()
  const [periodType, setPeriodType] = useState<'weekly' | 'monthly'>('monthly')
  const [period, setPeriod] = useState(currentMonth())
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [plan, setPlan] = useState<ActivityPlanResponse | null>(null)
  const [plans, setPlans] = useState<ActivityPlanResponse[]>([])
  const [rows, setRows] = useState<ActivityRow[]>([])
  const accessToken = typeof window !== 'undefined' ? localStorage.getItem('vidlik-accessToken') : null

  const canWork = useMemo(() => !!accessToken && isAuthenticated, [accessToken, isAuthenticated])
  const canManageLock = useMemo(() => ['admin', 'director', 'clerk'].includes(user?.role || ''), [user?.role])
  const isLocked = Boolean(plan?.isLocked)

  const createTempRow = (index: number): ActivityRow => ({
    id: `temp-${Date.now()}-${index}`,
    index,
    title: '',
    location: '',
    schedule: '',
    responsible: '',
    createdById: user?.id || null,
  })

  const loadPlanByPeriod = async () => {
    if (!canWork) return
    setLoading(true)
    setError('')
    const resp = await fetch(
      `/api/v1/reports/activities/plan?periodType=${encodeURIComponent(periodType)}&period=${encodeURIComponent(period)}`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
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

  const loadPlansList = async () => {
    if (!canWork) return
    const resp = await fetch(`/api/v1/reports/activities/plans?periodType=${encodeURIComponent(periodType)}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (!resp.ok) return
    const data = (await resp.json()) as ActivityPlanResponse[]
    setPlans(Array.isArray(data) ? data : [])
  }

  useEffect(() => {
    loadPlanByPeriod()
    loadPlansList()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period, periodType, canWork])

  useEffect(() => {
    setPeriod(periodType === 'weekly' ? currentWeek() : currentMonth())
  }, [periodType])

  const ensurePeriodInput = () => (periodType === 'weekly' ? 'week' : 'month')

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

  const exportDocx = async () => {
    if (!plan?.reportId || !accessToken) return
    const resp = await fetch(`/api/v1/reports/activities/plan/${plan.reportId}/export-docx`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (!resp.ok) {
      setError('Не вдалося експортувати DOCX')
      return
    }
    const data = await resp.json()
    const base64 = data?.contentBase64 || ''
    const fileName = data?.fileName || `zahody-${period}.docx`
    const mime = data?.mimeType || 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    const byteChars = atob(base64)
    const byteNums = new Array(byteChars.length)
    for (let i = 0; i < byteChars.length; i += 1) byteNums[i] = byteChars.charCodeAt(i)
    const blob = new Blob([new Uint8Array(byteNums)], { type: mime })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = fileName
    link.click()
    URL.revokeObjectURL(url)
  }

  const sendReminder = async () => {
    if (!plan?.reportId || !accessToken) return
    const resp = await fetch(`/api/v1/reports/activities/plan/${plan.reportId}/remind`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (!resp.ok) {
      const data = await resp.json().catch(() => null)
      setError(data?.message || 'Не вдалося надіслати нагадування')
      return
    }
  }

  const toggleLock = async () => {
    if (!plan?.reportId || !accessToken) return
    const action = isLocked ? 'unlock' : 'lock'
    const resp = await fetch(`/api/v1/reports/activities/plan/${plan.reportId}/${action}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (!resp.ok) {
      const data = await resp.json().catch(() => null)
      setError(data?.message || 'Не вдалося змінити статус документа')
      return
    }
    const data = (await resp.json()) as ActivityPlanResponse
    setPlan(data)
    setRows(data.rows || [])
    await loadPlansList()
  }

  const addRow = () => {
    if (isLocked) return
    setRows((prev) => [
      ...prev,
      createTempRow(prev.length + 1),
    ])
  }

  const updateLocalRow = (id: string, key: keyof ActivityRow, value: string) => {
    setRows((prev) => prev.map((row) => (row.id === id ? { ...row, [key]: value } : row)))
  }

  const handleGridPaste = (rowId: string, colKey: (typeof editableColumns)[number], pasted: string) => {
    const raw = (pasted || '').replace(/\r/g, '')
    if (!raw.includes('\t') && !raw.includes('\n')) return false

    setRows((prev) => {
      const next = [...prev]
      const startRow = next.findIndex((item) => item.id === rowId)
      const startCol = editableColumns.indexOf(colKey)
      if (startRow < 0 || startCol < 0) return prev

      const lines = raw.split('\n').filter((line) => line.length > 0)
      for (let r = 0; r < lines.length; r += 1) {
        const targetRow = startRow + r
        while (targetRow >= next.length) {
          next.push(createTempRow(next.length + 1))
        }
        const cells = lines[r].split('\t')
        for (let c = 0; c < cells.length; c += 1) {
          const targetCol = startCol + c
          if (targetCol >= editableColumns.length) continue
          const key = editableColumns[targetCol]
          next[targetRow] = { ...next[targetRow], [key]: cells[c].trim() }
        }
      }

      return next.map((item, idx) => ({ ...item, index: idx + 1 }))
    })

    return true
  }

  const saveRow = async (row: ActivityRow) => {
    if (!plan?.reportId || !accessToken || isLocked) return
    setSaving(true)
    setError('')
    const payload = {
      id: row.id.startsWith('temp-') ? undefined : row.id,
      title: row.title,
      location: row.location,
      schedule: row.schedule,
      responsible: row.responsible,
      expectedVersion: plan.version,
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
      await loadPlanByPeriod()
      return
    }
    const data = (await resp.json()) as ActivityPlanResponse
    setPlan(data)
    setRows(data.rows || [])
    await loadPlansList()
  }

  const removeRow = async (rowId: string) => {
    if (!plan?.reportId || !accessToken || isLocked) return
    if (rowId.startsWith('temp-')) {
      setRows((prev) => prev.filter((item) => item.id !== rowId))
      return
    }

    const resp = await fetch(
      `/api/v1/reports/activities/plan/${plan.reportId}/rows/${rowId}?expectedVersion=${encodeURIComponent(String(plan.version || ''))}`,
      {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${accessToken}` },
      },
    )
    if (!resp.ok) {
      const data = await resp.json().catch(() => null)
      setError(data?.message || 'Не вдалося видалити рядок')
      await loadPlanByPeriod()
      return
    }
    await loadPlanByPeriod()
    await loadPlansList()
  }

  return (
    <DashboardLayout>
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold font-display">План заходів</h1>
            <p className="text-slate-500 mt-1">Документи департаменту: тижневі/місячні, заповнення, нагадування, фіналізація</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={periodType}
              onChange={(e) => setPeriodType(e.target.value as 'weekly' | 'monthly')}
              className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900"
            >
              <option value="monthly">Місяць</option>
              <option value="weekly">Тиждень</option>
            </select>
            <input
              type={ensurePeriodInput()}
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
              className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900"
            />
            <button type="button" onClick={addRow} disabled={isLocked} className="h-10 rounded-lg border border-primary px-3 text-sm text-primary disabled:opacity-50">
              Додати рядок
            </button>
            <button type="button" onClick={exportCsv} className="h-10 rounded-lg bg-primary px-3 text-sm text-white">CSV</button>
            <button type="button" onClick={exportDocx} className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-700">DOCX</button>
            <Link
              href={`/dashboard/activities/print?periodType=${encodeURIComponent(periodType)}&period=${encodeURIComponent(period)}`}
              className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-700 inline-flex items-center"
            >
              Друк-версія
            </Link>
            {canManageLock && (
              <>
                <button type="button" onClick={toggleLock} className="h-10 rounded-lg border border-amber-400 bg-amber-50 px-3 text-sm text-amber-700">
                  {isLocked ? 'Розблокувати' : 'Фіналізувати'}
                </button>
                <button type="button" onClick={sendReminder} className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-700">
                  Нагадати
                </button>
              </>
            )}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
          Документи: {plans.slice(0, 8).map((item) => item.period).join(', ') || 'поки немає'}
          {isLocked && <span className="ml-2 font-semibold text-amber-700">• Документ фіналізовано</span>}
          <div className="mt-2 text-xs text-slate-500">
            Режим таблиці: можна вставляти блоки напряму з Excel/Google Sheets через Ctrl/Cmd + V у будь-яку клітинку.
          </div>
        </div>

        {error && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error}
          </div>
        )}

        <div className="rounded-2xl border border-slate-200 bg-white overflow-auto">
          <table className="min-w-full table-fixed text-sm">
            <thead className="bg-slate-50 sticky top-0 z-10">
              <tr>
                <th className="w-12 px-3 py-2 text-left font-semibold text-slate-600">№</th>
                <th className="px-3 py-2 text-left font-semibold text-slate-600">Назва заходу</th>
                <th className="px-3 py-2 text-left font-semibold text-slate-600">Місце проведення</th>
                <th className="px-3 py-2 text-left font-semibold text-slate-600">Дата/час</th>
                <th className="px-3 py-2 text-left font-semibold text-slate-600">Відповідальний</th>
                <th className="w-36 px-3 py-2 text-right font-semibold text-slate-600">Дії</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-slate-500">Завантаження...</td>
                </tr>
              )}
              {!loading && rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-slate-500">Рядків поки немає</td>
                </tr>
              )}
              {!loading && rows.map((row, idx) => (
                <tr key={row.id} className="border-t border-slate-100">
                  <td className="px-3 py-2 align-middle text-slate-500">{idx + 1}</td>
                  <td className="px-1 py-1 align-middle">
                    <input
                      value={row.title}
                      onChange={(e) => updateLocalRow(row.id, 'title', e.target.value)}
                      onPaste={(e) => {
                        const text = e.clipboardData.getData('text')
                        if (handleGridPaste(row.id, 'title', text)) e.preventDefault()
                      }}
                      className="w-full rounded-md border border-transparent bg-transparent px-2 py-2 text-sm text-slate-900 outline-none focus:border-primary/50 focus:bg-primary/5"
                      placeholder="Введіть назву"
                    />
                  </td>
                  <td className="px-1 py-1 align-middle">
                    <input
                      value={row.location}
                      onChange={(e) => updateLocalRow(row.id, 'location', e.target.value)}
                      onPaste={(e) => {
                        const text = e.clipboardData.getData('text')
                        if (handleGridPaste(row.id, 'location', text)) e.preventDefault()
                      }}
                      className="w-full rounded-md border border-transparent bg-transparent px-2 py-2 text-sm text-slate-900 outline-none focus:border-primary/50 focus:bg-primary/5"
                      placeholder="Місце"
                    />
                  </td>
                  <td className="px-1 py-1 align-middle">
                    <input
                      value={row.schedule}
                      onChange={(e) => updateLocalRow(row.id, 'schedule', e.target.value)}
                      onPaste={(e) => {
                        const text = e.clipboardData.getData('text')
                        if (handleGridPaste(row.id, 'schedule', text)) e.preventDefault()
                      }}
                      className="w-full rounded-md border border-transparent bg-transparent px-2 py-2 text-sm text-slate-900 outline-none focus:border-primary/50 focus:bg-primary/5"
                      placeholder="Дата та час"
                    />
                  </td>
                  <td className="px-1 py-1 align-middle">
                    <input
                      value={row.responsible}
                      onChange={(e) => updateLocalRow(row.id, 'responsible', e.target.value)}
                      onPaste={(e) => {
                        const text = e.clipboardData.getData('text')
                        if (handleGridPaste(row.id, 'responsible', text)) e.preventDefault()
                      }}
                      className="w-full rounded-md border border-transparent bg-transparent px-2 py-2 text-sm text-slate-900 outline-none focus:border-primary/50 focus:bg-primary/5"
                      placeholder="Відповідальний"
                    />
                  </td>
                  <td className="px-3 py-2 align-middle text-right">
                    <div className="inline-flex gap-2">
                      <button type="button" onClick={() => saveRow(row)} disabled={saving || isLocked} className="rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-700 disabled:opacity-60">
                        Зберегти
                      </button>
                      <button type="button" onClick={() => removeRow(row.id)} disabled={isLocked} className="rounded-md border border-rose-300 px-2 py-1 text-xs text-rose-700 disabled:opacity-60">
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
