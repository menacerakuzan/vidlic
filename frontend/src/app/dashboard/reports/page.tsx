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
  periodStart: string
  periodEnd: string
  createdAt: string
  author?: { id: string; firstName: string; lastName: string; role: string }
  department?: { id: string; nameUk?: string; name?: string }
}

type DepartmentOption = { id: string; nameUk?: string; name?: string }

export default function ReportsPage() {
  const { isAuthenticated, user } = useAuthStore()
  const [reports, setReports] = useState<Report[]>([])
  const [departments, setDepartments] = useState<DepartmentOption[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [authorRoleFilter, setAuthorRoleFilter] = useState<string>('all')
  const [authorIdFilter, setAuthorIdFilter] = useState<string>('all')
  const [departmentFilter, setDepartmentFilter] = useState<string>('all')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [dateFrom, setDateFrom] = useState<string>('')
  const [dateTo, setDateTo] = useState<string>('')
  const accessToken = typeof window !== 'undefined' ? localStorage.getItem('vidlik-accessToken') : null

  const authorOptions = useMemo(() => {
    const map = new Map<string, { id: string; firstName: string; lastName: string; role: string }>()
    reports.forEach((report) => {
      if (!report.author?.id) return
      map.set(report.author.id, report.author)
    })
    return Array.from(map.values()).sort((a, b) =>
      `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`, 'uk'),
    )
  }, [reports])

  useEffect(() => {
    let cancelled = false
    async function load() {
      if (!accessToken) return
      setLoading(true)
      setError('')
      const params = new URLSearchParams()
      params.set('limit', '200')
      if (statusFilter !== 'all') params.set('status', statusFilter)
      if (departmentFilter !== 'all') params.set('departmentId', departmentFilter)
      if (authorIdFilter !== 'all') params.set('authorId', authorIdFilter)
      if (authorRoleFilter !== 'all') params.set('authorRole', authorRoleFilter)
      if (dateFrom) params.set('periodStart', dateFrom)
      if (dateTo) params.set('periodEnd', dateTo)

      const resp = await fetch(`/api/v1/reports?${params.toString()}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      if (!resp.ok) {
        if (!cancelled) {
          const err = await resp.json().catch(() => null)
          setError(err?.message || 'Не вдалося завантажити звіти')
          setLoading(false)
        }
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
  }, [isAuthenticated, accessToken, statusFilter, departmentFilter, authorIdFilter, authorRoleFilter, dateFrom, dateTo])

  useEffect(() => {
    let cancelled = false
    async function loadDepartments() {
      if (!accessToken) return
      const resp = await fetch('/api/v1/departments', {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      if (!resp.ok) return
      const data = await resp.json()
      if (!cancelled) setDepartments(Array.isArray(data) ? data : [])
    }
    if (isAuthenticated) loadDepartments()
    return () => {
      cancelled = true
    }
  }, [isAuthenticated, accessToken])

  const canCreate = useMemo(() => !!user, [user])
  const canCreateAggregate = useMemo(
    () => ['manager', 'clerk', 'director'].includes(user?.role || ''),
    [user?.role],
  )
  const aggregateTitle = useMemo(() => {
    if (user?.role === 'manager') return 'Зведений звіт керівника відділу'
    if (user?.role === 'clerk') return 'Зведений звіт діловода департаменту'
    if (user?.role === 'director') return 'Фінальний зведений звіт директора'
    return 'Зведений звіт'
  }, [user?.role])
  const createDraftLabel = useMemo(() => {
    if (user?.role === 'manager') return 'Створити звичайний звіт'
    return 'Створити чернетку'
  }, [user?.role])
  const aggregateButtonLabel = useMemo(() => {
    if (user?.role === 'manager') return 'Створити зведений звіт'
    if (user?.role === 'clerk') return 'Створити зведення департаменту'
    if (user?.role === 'director') return 'Створити фінальне зведення'
    return 'Створити зведений звіт'
  }, [user?.role])

  return (
    <DashboardLayout>
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold font-display">Звіти</h1>
            <p className="text-slate-500 mt-1">Поточні звіти та погодження</p>
          </div>
          <div className="flex items-center gap-2">
            {canCreate && (
              <Link href="/dashboard/reports/new" className="rounded-xl bg-primary text-white px-4 py-2 text-sm font-medium hover:opacity-90">
                {createDraftLabel}
              </Link>
            )}
            {canCreateAggregate && (
              <Link
                href={`/dashboard/reports/new?mode=aggregate&title=${encodeURIComponent(aggregateTitle)}`}
                className="rounded-xl border border-primary px-4 py-2 text-sm font-medium text-primary hover:bg-primary/10"
              >
                {aggregateButtonLabel}
              </Link>
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3 lg:grid-cols-6">
            <select
              value={authorRoleFilter}
              onChange={(e) => {
                setAuthorRoleFilter(e.target.value)
                setAuthorIdFilter('all')
              }}
              className="h-10 rounded-lg border border-slate-300 px-3 text-sm"
            >
              <option value="all">Усі ролі авторів</option>
              <option value="manager">Від керівників</option>
              <option value="clerk">Від діловода</option>
              <option value="director">Від директора</option>
              <option value="specialist">Від спеціалістів</option>
            </select>

            <select
              value={authorIdFilter}
              onChange={(e) => setAuthorIdFilter(e.target.value)}
              className="h-10 rounded-lg border border-slate-300 px-3 text-sm"
            >
              <option value="all">Усі автори</option>
              {authorOptions
                .filter((a) => authorRoleFilter === 'all' || a.role === authorRoleFilter)
                .map((author) => (
                  <option key={author.id} value={author.id}>
                    {author.lastName} {author.firstName}
                  </option>
                ))}
            </select>

            <select
              value={departmentFilter}
              onChange={(e) => setDepartmentFilter(e.target.value)}
              className="h-10 rounded-lg border border-slate-300 px-3 text-sm"
            >
              <option value="all">Усі підрозділи</option>
              {departments.map((dep) => (
                <option key={dep.id} value={dep.id}>
                  {dep.nameUk || dep.name || dep.id}
                </option>
              ))}
            </select>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="h-10 rounded-lg border border-slate-300 px-3 text-sm"
            >
              <option value="all">Усі статуси</option>
              <option value="draft">Чернетки</option>
              <option value="pending_manager">На погодженні керівника</option>
              <option value="pending_clerk">На погодженні діловода</option>
              <option value="pending_director">На погодженні директора</option>
              <option value="approved">Затверджені</option>
              <option value="rejected">Повернені</option>
            </select>

            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="h-10 rounded-lg border border-slate-300 px-3 text-sm"
            />
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="h-10 rounded-lg border border-slate-300 px-3 text-sm"
            />
          </div>
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
          {!loading && error && <div className="px-4 py-4 text-sm text-rose-600">{error}</div>}

          {!loading && !error && reports.length === 0 && (
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
