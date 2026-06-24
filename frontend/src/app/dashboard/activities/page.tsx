'use client'

import { useEffect, useMemo, useState } from 'react'
import { DashboardLayout } from '@/components/dashboard-layout'
import { useAuthStore } from '@/store/auth-store'

type ActivityPlanResponse = {
  reportId: string
  periodType: 'weekly' | 'monthly' | 'quarterly'
  period: string
  title: string
  department?: { id: string; nameUk: string }
  googleSheetUrl?: string | null
  googleSheetEmbedUrl?: string | null
  entryDeadlineAt?: string | null
  activityLog?: Array<{
    id: string
    action: string
    details: string
    actorName?: string | null
    actorRole?: string | null
    createdAt: string
  }>
  isLocked?: boolean
  updatedAt: string
}

function currentMonth() {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  return `${year}-${month}`
}

function currentQuarter() {
  const now = new Date()
  const q = Math.ceil((now.getMonth() + 1) / 3)
  return `${now.getFullYear()}-Q${q}`
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

function displayTitle(title: string) {
  return title.replace(/^\[ACTIVITY_PLAN\]\s*/, '')
}

function toLocalDateTimeInput(value?: string | null) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const yyyy = date.getFullYear()
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  const hh = String(date.getHours()).padStart(2, '0')
  const min = String(date.getMinutes()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}T${hh}:${min}`
}

export default function ActivitiesPage() {
  const { isAuthenticated, user } = useAuthStore()
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null)

  const [periodType, setPeriodType] = useState<'weekly' | 'monthly' | 'quarterly'>('monthly')
  const [period, setPeriod] = useState(currentMonth())
  const [loading, setLoading] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState('')
  const [plan, setPlan] = useState<ActivityPlanResponse | null>(null)
  const [plans, setPlans] = useState<ActivityPlanResponse[]>([])
  const [googleSheetUrl, setGoogleSheetUrl] = useState('')
  const [entryDeadlineAt, setEntryDeadlineAt] = useState('')
  const [editingTitle, setEditingTitle] = useState(false)
  const [draftTitle, setDraftTitle] = useState('')
  const [savingTitle, setSavingTitle] = useState(false)

  const accessToken = typeof window !== 'undefined' ? localStorage.getItem('vidlik-accessToken') : null
  const canWork = useMemo(() => !!accessToken && isAuthenticated, [accessToken, isAuthenticated])
  const canManageSheet = useMemo(() => ['admin', 'director', 'clerk', 'specialist'].includes(user?.role || ''), [user?.role])

  const loadPlansList = async () => {
    if (!canWork) return
    const resp = await fetch(`/api/v1/reports/activities/plans?periodType=monthly`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (!resp.ok) return
    const data = (await resp.json()) as ActivityPlanResponse[]
    setPlans(Array.isArray(data) ? data : [])
  }

  const loadPlanById = async (id: string) => {
    if (!canWork || !id) return
    setLoading(true)
    setError('')
    const resp = await fetch(`/api/v1/reports/activities/plan/${encodeURIComponent(id)}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (!resp.ok) {
      const data = await resp.json().catch(() => null)
      setError(data?.message || 'Не вдалося відкрити документ плану заходів')
      setLoading(false)
      return
    }
    const data = (await resp.json()) as ActivityPlanResponse
    setPlan(data)
    setGoogleSheetUrl(data.googleSheetUrl || '')
    setEntryDeadlineAt(toLocalDateTimeInput(data.entryDeadlineAt || null))
    setDraftTitle(displayTitle(data.title))
    setEditingTitle(false)
    setLoading(false)
  }

  const generatePlan = async () => {
    if (!canWork) return
    setLoading(true)
    setError('')
    const resp = await fetch(
      `/api/v1/reports/activities/plan?periodType=${encodeURIComponent(periodType)}&period=${encodeURIComponent(period)}`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    )
    if (!resp.ok) {
      const data = await resp.json().catch(() => null)
      setError(data?.message || 'Не вдалося згенерувати документ плану заходів')
      setLoading(false)
      return
    }
    const data = (await resp.json()) as ActivityPlanResponse
    setPlan(data)
    setGoogleSheetUrl(data.googleSheetUrl || '')
    setEntryDeadlineAt(toLocalDateTimeInput(data.entryDeadlineAt || null))
    setDraftTitle(displayTitle(data.title))
    setEditingTitle(false)
    if (typeof window !== 'undefined') {
      const url = `/dashboard/activities?planId=${encodeURIComponent(data.reportId)}`
      window.history.replaceState(null, '', url)
      setSelectedPlanId(data.reportId)
    }
    setLoading(false)
    await loadPlansList()
  }

  const openPlan = async (id: string) => {
    if (typeof window !== 'undefined') {
      const url = `/dashboard/activities?planId=${encodeURIComponent(id)}`
      window.history.replaceState(null, '', url)
    }
    setSelectedPlanId(id)
    await loadPlanById(id)
  }

  const saveGoogleSheetLink = async () => {
    if (!plan?.reportId || !accessToken) return
    setError('')
    const resp = await fetch(`/api/v1/reports/activities/plan/${plan.reportId}/google-sheet`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        googleSheetUrl: googleSheetUrl.trim() || null,
        entryDeadlineAt: entryDeadlineAt ? new Date(entryDeadlineAt).toISOString() : null,
      }),
    })
    if (!resp.ok) {
      const data = await resp.json().catch(() => null)
      setError(data?.message || 'Не вдалося зберегти посилання Google Sheets')
      return
    }
    const data = (await resp.json()) as ActivityPlanResponse
    setPlan(data)
    setGoogleSheetUrl(data.googleSheetUrl || '')
    setEntryDeadlineAt(toLocalDateTimeInput(data.entryDeadlineAt || null))
    await loadPlansList()
  }

  const deletePlan = async () => {
    if (!plan?.reportId || !accessToken || deleting) return
    const isConfirmed = window.confirm('Видалити цей документ плану заходів? Дію не можна скасувати.')
    if (!isConfirmed) return

    setDeleting(true)
    setError('')
    const resp = await fetch(`/api/v1/reports/${encodeURIComponent(plan.reportId)}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${accessToken}` },
    })

    if (!resp.ok) {
      const data = await resp.json().catch(() => null)
      setError(data?.message || 'Не вдалося видалити документ плану заходів')
      setDeleting(false)
      return
    }

    setPlan(null)
    setGoogleSheetUrl('')
    setSelectedPlanId(null)
    if (typeof window !== 'undefined') {
      window.history.replaceState(null, '', '/dashboard/activities')
    }
    await loadPlansList()
    setDeleting(false)
  }

  const savePlanTitle = async () => {
    if (!plan?.reportId || !accessToken || savingTitle) return
    const trimmed = draftTitle.trim()
    if (!trimmed) return
    setSavingTitle(true)
    setError('')
    const resp = await fetch(`/api/v1/reports/activities/plan/${plan.reportId}/title`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: trimmed }),
    })
    if (!resp.ok) {
      const data = await resp.json().catch(() => null)
      setError(data?.message || 'Не вдалося зберегти назву')
      setSavingTitle(false)
      return
    }
    const data = (await resp.json()) as ActivityPlanResponse
    setPlan(data)
    setDraftTitle(displayTitle(data.title))
    setEditingTitle(false)
    setSavingTitle(false)
    await loadPlansList()
  }

  useEffect(() => {
    loadPlansList()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canWork])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const planId = new URLSearchParams(window.location.search).get('planId')
    setSelectedPlanId(planId)
  }, [])

  useEffect(() => {
    if (!selectedPlanId) return
    loadPlanById(selectedPlanId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPlanId, canWork])

  useEffect(() => {
    if (periodType === 'weekly') setPeriod(currentWeek())
    else if (periodType === 'quarterly') setPeriod(currentQuarter())
    else setPeriod(currentMonth())
  }, [periodType])

  return (
    <DashboardLayout>
      <div className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-display text-2xl font-semibold">Заходи</h1>
            <p className="mt-1 text-muted-foreground">
              Основний режим: один документ на період, редагування через Google Sheets.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={periodType}
              onChange={(e) => setPeriodType(e.target.value as 'weekly' | 'monthly' | 'quarterly')}
              className="h-10 rounded-md border border-border bg-card px-3 text-sm text-foreground dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
            >
              <option value="monthly">Місяць</option>
              <option value="weekly">Тиждень</option>
              <option value="quarterly">Квартал</option>
            </select>
            {periodType === 'quarterly' ? (
              <select
                value={period}
                onChange={(e) => setPeriod(e.target.value)}
                className="h-10 rounded-md border border-border bg-card px-3 text-sm text-foreground dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
              >
                {Array.from({ length: 3 }, (_, yi) => {
                  const year = new Date().getFullYear() - 1 + yi
                  return [1, 2, 3, 4].map((q) => (
                    <option key={`${year}-Q${q}`} value={`${year}-Q${q}`}>
                      {year} Q{q} ({['Січ–Бер', 'Кві–Чер', 'Лип–Вер', 'Жов–Гру'][q - 1]})
                    </option>
                  ))
                }).flat()}
              </select>
            ) : (
              <input
                type={periodType === 'weekly' ? 'week' : 'month'}
                value={period}
                onChange={(e) => setPeriod(e.target.value)}
                className="h-10 rounded-md border border-border bg-card px-3 text-sm text-foreground dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
              />
            )}
            <button
              type="button"
              onClick={generatePlan}
              className="h-10 rounded-lg bg-primary px-3 text-sm text-white"
            >
              Згенерувати план заходів
            </button>
          </div>
        </div>

        {error && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error}
          </div>
        )}

        <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
          <aside className="rounded-2xl border border-border bg-card p-3">
            <div className="mb-2 text-sm font-semibold text-foreground/80">Документи</div>
            <div className="space-y-2">
              {plans.map((item) => {
                const selected = item.reportId === plan?.reportId
                return (
                  <button
                    key={item.reportId}
                    type="button"
                    onClick={() => openPlan(item.reportId)}
                    className={`w-full rounded-lg border px-3 py-2 text-left text-sm ${
                      selected
                        ? 'border-primary bg-primary/5 text-foreground'
                        : 'border-border bg-card text-foreground/80 hover:bg-secondary'
                    }`}
                  >
                    <div className="font-medium truncate">{displayTitle(item.title)}</div>
                    <div className="mt-1 text-xs text-muted-foreground">{item.period} · {item.googleSheetUrl ? 'Google підключено' : 'Google не підключено'}</div>
                  </button>
                )
              })}
              {plans.length === 0 && (
                <div className="rounded-lg border border-dashed border-border px-3 py-4 text-sm text-muted-foreground">
                  Документів поки немає. Натисни «Згенерувати план заходів».
                </div>
              )}
            </div>
          </aside>

          <section className="space-y-4">
            {loading && (
              <div className="rounded-xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
                Завантаження...
              </div>
            )}

            {!loading && !plan && (
              <div className="rounded-xl border border-border bg-card px-4 py-5 text-sm text-muted-foreground">
                Обери документ зліва або згенеруй новий для потрібного періоду.
              </div>
            )}

            {!loading && plan && (
              <>
                <div className="rounded-xl border border-border bg-card p-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      {editingTitle && canManageSheet ? (
                        <div className="flex items-center gap-2">
                          <input
                            value={draftTitle}
                            onChange={(e) => setDraftTitle(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') savePlanTitle(); if (e.key === 'Escape') { setEditingTitle(false); setDraftTitle(displayTitle(plan.title)) } }}
                            className="h-8 flex-1 rounded-md border border-primary px-2 text-sm text-foreground focus:outline-none"
                            maxLength={200}
                            autoFocus
                          />
                          <button type="button" onClick={savePlanTitle} disabled={savingTitle} className="h-8 rounded-md bg-primary px-3 text-xs text-white disabled:opacity-60">
                            {savingTitle ? '...' : 'Зберегти'}
                          </button>
                          <button type="button" onClick={() => { setEditingTitle(false); setDraftTitle(displayTitle(plan.title)) }} className="h-8 rounded-md border border-border px-3 text-xs text-muted-foreground">
                            Скасувати
                          </button>
                        </div>
                      ) : (
                        <div className="mb-1 flex items-center gap-2">
                          <span className="text-sm font-semibold text-foreground">{displayTitle(plan.title)}</span>
                          {canManageSheet && (
                            <button
                              type="button"
                              onClick={() => { setDraftTitle(displayTitle(plan.title)); setEditingTitle(true) }}
                              className="text-muted-foreground hover:text-muted-foreground"
                              title="Перейменувати"
                            >
                              ✎
                            </button>
                          )}
                        </div>
                      )}
                      <div className="text-xs text-muted-foreground">
                        {plan.department?.nameUk || 'Підрозділ'}
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {plan.googleSheetUrl && (
                        <a
                          href={plan.googleSheetUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex h-9 items-center rounded-lg bg-primary px-3 text-sm text-white"
                        >
                          Відкрити таблицю ↗
                        </a>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          const url = `${window.location.origin}/dashboard/activities?planId=${plan.reportId}`
                          navigator.clipboard.writeText(url).then(() => {
                            setError('')
                          }).catch(() => {})
                        }}
                        className="h-9 rounded-lg border border-border px-3 text-sm text-foreground/80 dark:border-slate-600 dark:text-slate-200"
                        title="Скопіювати посилання на цей план"
                      >
                        Копіювати посилання
                      </button>
                      {canManageSheet && (
                        <button
                          type="button"
                          onClick={deletePlan}
                          disabled={deleting}
                          className="h-9 rounded-lg border border-rose-300 px-3 text-sm text-rose-700 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {deleting ? 'Видалення...' : 'Видалити документ'}
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {canManageSheet && (
                  <div className="rounded-xl border border-border bg-card p-3">
                    <div className="mb-2 text-sm font-medium text-foreground">Посилання на Google Docs або Sheets</div>
                    <div className="flex flex-wrap gap-2">
                      <input
                        value={googleSheetUrl}
                        onChange={(e) => setGoogleSheetUrl(e.target.value)}
                        placeholder="https://docs.google.com/document/d/.../edit або https://docs.google.com/spreadsheets/d/.../edit"
                        className="h-10 min-w-[320px] flex-1 rounded-md border border-border bg-card px-3 text-sm text-foreground"
                      />
                      <input
                        type="datetime-local"
                        value={entryDeadlineAt}
                        onChange={(e) => setEntryDeadlineAt(e.target.value)}
                        className="h-10 rounded-md border border-border bg-card px-3 text-sm text-foreground"
                        title="Дедлайн внесення заходів"
                      />
                      <button
                        type="button"
                        onClick={saveGoogleSheetLink}
                        className="h-10 rounded-lg border border-primary px-3 text-sm text-primary"
                      >
                        Зберегти
                      </button>
                      {plan.googleSheetUrl && (
                        <a
                          href={plan.googleSheetUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex h-10 items-center rounded-lg bg-primary px-3 text-sm text-white"
                        >
                          Відкрити в новій вкладці
                        </a>
                      )}
                    </div>
                  </div>
                )}

                {!plan.googleSheetEmbedUrl && (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                    Для цього документа ще не підключено Google Sheets.
                    {canManageSheet ? ' Додай посилання вище.' : ' Звернись до діловода/директора.'}
                  </div>
                )}

                <div className="rounded-xl border border-border bg-card p-3">
                  <div className="mb-2 text-sm font-medium text-foreground">Історія змін у CRM</div>
                  {plan.activityLog && plan.activityLog.length > 0 ? (
                    <div className="max-h-56 space-y-2 overflow-auto pr-1 text-xs text-muted-foreground">
                      {plan.activityLog.slice().reverse().map((entry) => (
                        <div key={entry.id} className="rounded border border-border px-2 py-1">
                          <div className="font-medium text-foreground/80">{entry.details}</div>
                          <div>
                            {entry.actorName || 'Невідомо'} {entry.actorRole ? `(${entry.actorRole})` : ''} ·{' '}
                            {new Date(entry.createdAt).toLocaleString('uk-UA')}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-xs text-muted-foreground">Змін поки немає.</div>
                  )}
                </div>

                {plan.googleSheetEmbedUrl && (
                  <div className="rounded-2xl border border-border bg-card p-2">
                    <iframe
                      title="Google Sheets document"
                      src={plan.googleSheetEmbedUrl}
                      className="h-[calc(100vh-180px)] min-h-[600px] w-full rounded-lg border border-border"
                    />
                  </div>
                )}
              </>
            )}
          </section>
        </div>
      </div>
    </DashboardLayout>
  )
}
