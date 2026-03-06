'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { DashboardLayout } from '@/components/dashboard-layout'
import { useAuthStore } from '@/store/auth-store'
import { ReportStatusBadge } from '@/components/reports/report-status-badge'

type Report = {
  id: string
  title?: string
  reportType: 'weekly' | 'monthly'
  status: string
  createdAt: string
  author?: { firstName: string; lastName: string }
}

export default function ReportsPage() {
  const { isAuthenticated, user } = useAuthStore()
  const [reports, setReports] = useState<Report[]>([])
  const [loading, setLoading] = useState(true)
  const accessToken = typeof window !== 'undefined' ? localStorage.getItem('vidlik-accessToken') : null

  useEffect(() => {
    let cancelled = false
    async function load() {
      if (!accessToken) return
      setLoading(true)
      const resp = await fetch('/api/v1/reports?limit=100', {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      if (!resp.ok) {
        if (!cancelled) setLoading(false)
        return
      }
      const data = await resp.json()
      if (!cancelled) {
        setReports(data.data || [])
        setLoading(false)
      }
    }
    if (isAuthenticated) load()
    return () => {
      cancelled = true
    }
  }, [isAuthenticated, accessToken])

  const canCreate = useMemo(() => !!user, [user])

  return (
    <DashboardLayout>
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold font-display">Звіти</h1>
            <p className="text-slate-500 mt-1">Поточні звіти та погодження</p>
          </div>
          {canCreate && (
            <Link href="/dashboard/reports/new" className="rounded-xl bg-primary text-white px-4 py-2 text-sm font-medium hover:opacity-90">
              Створити чернетку
            </Link>
          )}
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
          <div className="grid grid-cols-12 gap-2 px-4 py-3 text-xs font-semibold text-slate-500 border-b border-slate-100">
            <div className="col-span-4">Назва</div>
            <div className="col-span-2">Тип</div>
            <div className="col-span-2">Статус</div>
            <div className="col-span-2">Автор</div>
            <div className="col-span-2 text-right">Дії</div>
          </div>

          {loading && <div className="px-4 py-6 text-sm text-slate-500">Завантаження...</div>}

          {!loading && reports.length === 0 && (
            <div className="px-4 py-6 text-sm text-slate-500">Звітів поки немає</div>
          )}

          {!loading && reports.map((report) => (
            <div key={report.id} className="grid grid-cols-12 gap-2 px-4 py-3 border-b border-slate-100 items-center text-sm">
              <div className="col-span-4 font-medium text-slate-900 truncate">{report.title || 'Без назви'}</div>
              <div className="col-span-2 text-slate-600">{report.reportType === 'weekly' ? 'Тижневий' : 'Місячний'}</div>
              <div className="col-span-2"><ReportStatusBadge status={report.status} /></div>
              <div className="col-span-2 text-slate-600 truncate">{report.author ? `${report.author.firstName} ${report.author.lastName}` : '-'}</div>
              <div className="col-span-2 text-right">
                <Link className="text-primary font-medium hover:underline" href={`/dashboard/reports/${report.id}`}>
                  Відкрити
                </Link>
              </div>
            </div>
          ))}
        </div>
      </div>
    </DashboardLayout>
  )
}
