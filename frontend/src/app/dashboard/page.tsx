'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { DashboardLayout } from '@/components/dashboard-layout'
import { useAuthStore } from '@/store/auth-store'
import { FileText, CheckSquare, Clock, AlertTriangle } from 'lucide-react'

export default function DashboardPage() {
  const router = useRouter()
  const { user, isAuthenticated } = useAuthStore()
  const [analytics, setAnalytics] = useState<any>(null)
  const accessToken = typeof window !== 'undefined' ? localStorage.getItem('vidlik-accessToken') : null

  useEffect(() => {
    if (!isAuthenticated) router.push('/')
  }, [isAuthenticated, router])

  useEffect(() => {
    let cancelled = false
    async function loadAnalytics() {
      if (!accessToken) return
      const resp = await fetch('/api/v1/analytics/dashboard', {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      if (!resp.ok) return
      const data = await resp.json()
      if (!cancelled) setAnalytics(data)
    }
    loadAnalytics()
    return () => {
      cancelled = true
    }
  }, [accessToken])

  const cards = useMemo(() => ([
    {
      title: 'Звіти',
      value: analytics?.reports?.total ?? 0,
      subtitle: 'За 30 днів',
      icon: FileText,
      href: '/dashboard/reports',
    },
    {
      title: 'Задачі',
      value: analytics?.tasks?.total ?? 0,
      subtitle: 'Всього в роботі',
      icon: CheckSquare,
      href: '/dashboard/tasks',
    },
    {
      title: 'На погодженні',
      value: analytics?.pendingApprovals?.total ?? 0,
      subtitle: 'Потребують рішення',
      icon: Clock,
      href: '/dashboard/reports',
    },
    {
      title: 'Прострочені',
      value: analytics?.tasks?.overdue ?? 0,
      subtitle: 'Задачі з ризиком',
      icon: AlertTriangle,
      href: '/dashboard/tasks',
    },
  ]), [analytics])

  if (!isAuthenticated) return null

  return (
    <DashboardLayout>
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold font-display">Дашборд</h1>
            <p className="text-slate-500 mt-1">{user?.firstName} {user?.lastName} • {user?.department?.nameUk}</p>
          </div>
          <Link href="/dashboard/reports/new" className="rounded-xl bg-primary text-white px-4 py-2 text-sm font-medium hover:opacity-90">
            Створити звіт
          </Link>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {cards.map((card) => (
            <Link key={card.title} href={card.href} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm text-slate-500">{card.title}</p>
                  <p className="mt-2 text-3xl font-semibold text-slate-900">{card.value}</p>
                  <p className="mt-1 text-xs text-slate-400">{card.subtitle}</p>
                </div>
                <card.icon className="w-5 h-5 text-slate-500" />
              </div>
            </Link>
          ))}
        </div>
      </div>
    </DashboardLayout>
  )
}
