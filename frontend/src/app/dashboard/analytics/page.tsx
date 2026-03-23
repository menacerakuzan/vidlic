'use client'

import { useEffect, useState } from 'react'
import { DashboardLayout } from '@/components/dashboard-layout'
import { GlassCard } from '@/components/ui/glass-card'
import { useAuthStore } from '@/store/auth-store'

interface Anomaly {
  type: string
  message: string
  severity: 'low' | 'medium' | 'high'
}

export default function AnalyticsPage() {
  const { isAuthenticated } = useAuthStore()
  const [anomalies, setAnomalies] = useState<Anomaly[]>([])
  const [workload, setWorkload] = useState<any[]>([])
  const [digestSettings, setDigestSettings] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [savingDigest, setSavingDigest] = useState(false)
  const accessToken = typeof window !== 'undefined' ? localStorage.getItem('vidlik-accessToken') : null

  useEffect(() => {
    let cancelled = false
    async function loadAnalytics() {
      if (!accessToken) return
      setLoading(true)
      const [anomalyResp, workloadResp, digestResp] = await Promise.all([
        fetch('/api/v1/ai/kpi-anomalies', {
          headers: { Authorization: `Bearer ${accessToken}` },
        }),
        fetch('/api/v1/analytics/workload', {
          headers: { Authorization: `Bearer ${accessToken}` },
        }),
        fetch('/api/v1/analytics/digest-settings', {
          headers: { Authorization: `Bearer ${accessToken}` },
        }),
      ])

      if (anomalyResp.ok) {
        const data = await anomalyResp.json()
        if (!cancelled) {
          setAnomalies(data.anomalies || [])
        }
      }

      if (workloadResp.ok) {
        const data = await workloadResp.json()
        if (!cancelled) setWorkload(Array.isArray(data) ? data : [])
      }

      if (digestResp.ok) {
        const data = await digestResp.json()
        if (!cancelled) setDigestSettings(Array.isArray(data) ? data : [])
      }

      if (!cancelled) setLoading(false)
    }

    if (isAuthenticated) loadAnalytics()

    return () => {
      cancelled = true
    }
  }, [accessToken, isAuthenticated])

  const upsertDigest = async (frequency: 'daily' | 'weekly', patch: Partial<any>) => {
    if (!accessToken) return
    const current = digestSettings.find((item) => item.frequency === frequency) || {
      frequency,
      hour: 9,
      minute: 0,
      weekdays: '1,2,3,4,5',
      isActive: true,
    }
    const next = {
      ...current,
      ...patch,
      frequency,
    }
    setSavingDigest(true)
    const resp = await fetch('/api/v1/analytics/digest-settings', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(next),
    })
    setSavingDigest(false)
    if (resp.ok) {
      const refreshed = await fetch('/api/v1/analytics/digest-settings', {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      if (refreshed.ok) {
        const data = await refreshed.json()
        setDigestSettings(Array.isArray(data) ? data : [])
      }
    }
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold font-display">Аналітика</h1>
          <p className="text-slate-500 mt-1">AI‑сигнали та KPI‑аномалії за останні 30 днів</p>
        </div>

        {loading && <div className="glass-card p-6 text-sm text-slate-500">Аналізуємо метрики...</div>}

        {!loading && anomalies.length === 0 && (
          <GlassCard>
            <p className="text-sm text-slate-600">Аномалій не виявлено. KPI в межах норми.</p>
          </GlassCard>
        )}

        {!loading && anomalies.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {anomalies.map((anomaly) => (
              <GlassCard key={anomaly.type}>
                <p className="text-xs uppercase tracking-wide text-slate-500">{anomaly.severity}</p>
                <p className="mt-2 text-base font-semibold text-slate-900 dark:text-white">
                  {anomaly.message}
                </p>
              </GlassCard>
            ))}
          </div>
        )}

        <GlassCard>
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">Навантаження персоналу</h2>
              <p className="text-sm text-slate-500">Відкриті/прострочені задачі та індекс завантаженості</p>
            </div>
          </div>
          <div className="mt-3 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-slate-500">
                  <th className="py-2">Співробітник</th>
                  <th className="py-2">Open</th>
                  <th className="py-2">In Progress</th>
                  <th className="py-2">Overdue</th>
                  <th className="py-2">Critical</th>
                  <th className="py-2">Capacity</th>
                </tr>
              </thead>
              <tbody>
                {workload.map((row) => (
                  <tr key={row.userId} className="border-t border-slate-100">
                    <td className="py-2">{row.fullName}</td>
                    <td className="py-2">{row.openTasks}</td>
                    <td className="py-2">{row.inProgressTasks}</td>
                    <td className="py-2">{row.overdueTasks}</td>
                    <td className="py-2">{row.criticalTasks}</td>
                    <td className="py-2">{row.capacityScore}</td>
                  </tr>
                ))}
                {!workload.length && (
                  <tr>
                    <td className="py-2 text-slate-500" colSpan={6}>Дані навантаження відсутні</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </GlassCard>

        <GlassCard>
          <h2 className="text-lg font-semibold">Планувальник дайджестів</h2>
          <p className="text-sm text-slate-500 mt-1">Автоматичні зведення керівництву у системні сповіщення</p>

          {(['daily', 'weekly'] as const).map((frequency) => {
            const item = digestSettings.find((x) => x.frequency === frequency) || {
              frequency,
              hour: 9,
              minute: 0,
              weekdays: '1,2,3,4,5',
              isActive: false,
            }
            return (
              <div key={frequency} className="mt-4 rounded-lg border border-slate-200 p-3">
                <p className="text-sm font-medium">{frequency === 'daily' ? 'Щоденний' : 'Щотижневий'} дайджест</p>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                  <label className="inline-flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={!!item.isActive}
                      onChange={(e) => upsertDigest(frequency, { isActive: e.target.checked })}
                    />
                    Активний
                  </label>
                  <label>Година</label>
                  <input
                    type="number"
                    min={0}
                    max={23}
                    value={item.hour}
                    onChange={(e) => upsertDigest(frequency, { hour: Number(e.target.value) || 0 })}
                    className="w-20 rounded border border-slate-300 px-2 py-1 bg-white text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                  />
                  <label>Хвилина</label>
                  <input
                    type="number"
                    min={0}
                    max={59}
                    value={item.minute}
                    onChange={(e) => upsertDigest(frequency, { minute: Number(e.target.value) || 0 })}
                    className="w-20 rounded border border-slate-300 px-2 py-1 bg-white text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                  />
                  {frequency === 'weekly' && (
                    <>
                      <label>Дні (0-6)</label>
                      <input
                        value={item.weekdays || '1,2,3,4,5'}
                        onChange={(e) => upsertDigest(frequency, { weekdays: e.target.value })}
                        className="w-40 rounded border border-slate-300 px-2 py-1 bg-white text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                        placeholder="1,2,3,4,5"
                      />
                    </>
                  )}
                </div>
              </div>
            )
          })}
          {savingDigest && <p className="mt-2 text-xs text-slate-500">Збереження...</p>}
        </GlassCard>
      </div>
    </DashboardLayout>
  )
}
