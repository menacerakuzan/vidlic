'use client'

import { useEffect, useMemo, useState } from 'react'
import { DashboardLayout } from '@/components/dashboard-layout'
import { useAuthStore } from '@/store/auth-store'

type ActivityPlanResponse = {
  reportId: string
  periodType: 'weekly' | 'monthly'
  period: string
  title: string
  department?: { id: string; nameUk: string }
  googleSheetUrl?: string | null
  googleSheetEmbedUrl?: string | null
  isLocked?: boolean
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
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null)

  const [periodType, setPeriodType] = useState<'weekly' | 'monthly'>('monthly')
  const [period, setPeriod] = useState(currentMonth())
  const [loading, setLoading] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState('')
  const [plan, setPlan] = useState<ActivityPlanResponse | null>(null)
  const [plans, setPlans] = useState<ActivityPlanResponse[]>([])
  const [googleSheetUrl, setGoogleSheetUrl] = useState('')

  const accessToken = typeof window !== 'undefined' ? localStorage.getItem('vidlik-accessToken') : null
  const canWork = useMemo(() => !!accessToken && isAuthenticated, [accessToken, isAuthenticated])
  const canManageSheet = useMemo(() => ['admin', 'director', 'clerk'].includes(user?.role || ''), [user?.role])

  const loadPlansList = async () => {
    if (!canWork) return
    const resp = await fetch(`/api/v1/reports/activities/plans?periodType=${encodeURIComponent(periodType)}`, {
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
      body: JSON.stringify({ googleSheetUrl: googleSheetUrl.trim() || null }),
    })
    if (!resp.ok) {
      const data = await resp.json().catch(() => null)
      setError(data?.message || 'Не вдалося зберегти посилання Google Sheets')
      return
    }
    const data = (await resp.json()) as ActivityPlanResponse
    setPlan(data)
    setGoogleSheetUrl(data.googleSheetUrl || '')
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

  useEffect(() => {
    loadPlansList()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periodType, canWork])

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
    setPeriod(periodType === 'weekly' ? currentWeek() : currentMonth())
  }, [periodType])

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-display text-2xl font-semibold">Заходи</h1>
            <p className="mt-1 text-slate-500">
              Основний режим: один документ на період, редагування через Google Sheets.
            </p>
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
              type={periodType === 'weekly' ? 'week' : 'month'}
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
              className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900"
            />
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

        <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
          <aside className="rounded-2xl border border-slate-200 bg-white p-3">
            <div className="mb-2 text-sm font-semibold text-slate-700">Документи</div>
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
                        ? 'border-primary bg-sky-50 text-slate-900'
                        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <div className="font-medium">{item.periodType === 'weekly' ? 'Тиждень' : 'Місяць'}: {item.period}</div>
                    <div className="mt-1 text-xs text-slate-500">{item.googleSheetUrl ? 'Google Docs/Sheets підключено' : 'Google Docs/Sheets не підключено'}</div>
                  </button>
                )
              })}
              {plans.length === 0 && (
                <div className="rounded-lg border border-dashed border-slate-300 px-3 py-4 text-sm text-slate-500">
                  Документів поки немає. Натисни «Згенерувати план заходів».
                </div>
              )}
            </div>
          </aside>

          <section className="space-y-4">
            {loading && (
              <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
                Завантаження...
              </div>
            )}

            {!loading && !plan && (
              <div className="rounded-xl border border-slate-200 bg-white px-4 py-5 text-sm text-slate-600">
                Обери документ зліва або згенеруй новий для потрібного періоду.
              </div>
            )}

            {!loading && plan && (
              <>
                <div className="rounded-xl border border-slate-200 bg-white p-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="mb-1 text-sm font-semibold text-slate-800">
                        {plan.periodType === 'weekly' ? 'Тижневий' : 'Місячний'} документ: {plan.period}
                      </div>
                      <div className="text-xs text-slate-500">
                        {plan.department?.nameUk || 'Підрозділ'}
                      </div>
                    </div>
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

                {canManageSheet && (
                  <div className="rounded-xl border border-slate-200 bg-white p-3">
                    <div className="mb-2 text-sm font-medium text-slate-800">Посилання на Google Docs або Sheets</div>
                    <div className="flex flex-wrap gap-2">
                      <input
                        value={googleSheetUrl}
                        onChange={(e) => setGoogleSheetUrl(e.target.value)}
                        placeholder="https://docs.google.com/document/d/.../edit або https://docs.google.com/spreadsheets/d/.../edit"
                        className="h-10 min-w-[320px] flex-1 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900"
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

                {plan.googleSheetEmbedUrl && (
                  <div className="rounded-2xl border border-slate-200 bg-white p-2">
                    <iframe
                      title="Google Sheets document"
                      src={plan.googleSheetEmbedUrl}
                      className="h-[760px] w-full rounded-lg border border-slate-200"
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
