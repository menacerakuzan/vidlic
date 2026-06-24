'use client'

import { useEffect, useRef, useState } from 'react'
import { DashboardLayout } from '@/components/dashboard-layout'

type Notification = {
  id: string
  type: string
  title: string
  message: string
  isRead: boolean
  createdAt: string
}

const TYPE_LABELS: Record<string, string> = {
  task_assigned: 'Задачі',
  task_overdue: 'Задачі',
  report_submitted: 'Звіти',
  report_approved: 'Звіти',
  report_rejected: 'Звіти',
  digest: 'Дайджест',
}

const TYPE_GROUPS = [
  { label: 'Усі', value: '' },
  { label: 'Задачі', value: 'task' },
  { label: 'Звіти', value: 'report' },
  { label: 'Дайджест', value: 'digest' },
]

export default function NotificationsPage() {
  const [items, setItems] = useState<Notification[]>([])
  const [loading, setLoading] = useState(true)
  const [typeFilter, setTypeFilter] = useState('')
  const accessToken = typeof window !== 'undefined' ? localStorage.getItem('vidlik-accessToken') : null
  const loadRef = useRef<() => Promise<void>>()

  const load = async () => {
    if (!accessToken) return
    setLoading(true)
    const resp = await fetch('/api/v1/notifications?limit=100', {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (resp.ok) {
      const data = await resp.json()
      setItems(data.data || [])
    }
    setLoading(false)
  }
  loadRef.current = load

  useEffect(() => {
    load()
    if (!accessToken) return

    let stream: EventSource
    let retryTimeout: ReturnType<typeof setTimeout>

    const connect = () => {
      stream = new EventSource(`/api/v1/notifications/stream?token=${encodeURIComponent(accessToken)}`)
      stream.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data || '{}')
          if (payload?.type === 'notification.created') {
            loadRef.current?.()
          }
        } catch {
          // ignore
        }
      }
      stream.onerror = () => {
        stream.close()
        retryTimeout = setTimeout(connect, 5000)
      }
    }

    connect()

    return () => {
      stream?.close()
      clearTimeout(retryTimeout)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken])

  const markRead = async (id: string) => {
    if (!accessToken) return
    const resp = await fetch(`/api/v1/notifications/${id}/read`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (resp.ok) await load()
  }

  const markAllRead = async () => {
    if (!accessToken) return
    const resp = await fetch('/api/v1/notifications/read-all', {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (resp.ok) await load()
  }

  const filtered = typeFilter
    ? items.filter((item) => item.type.startsWith(typeFilter))
    : items

  const unreadCount = items.filter((i) => !i.isRead).length

  return (
    <DashboardLayout>
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold font-display">Сповіщення</h1>
            <p className="text-muted-foreground mt-1">Оповіщення щодо звітів і задач{unreadCount > 0 ? ` · ${unreadCount} непрочитаних` : ''}</p>
          </div>
          <button className="rounded-lg border border-border px-3 py-2 text-sm dark:border-slate-600" onClick={markAllRead}>
            Позначити все як прочитане
          </button>
        </div>

        <div className="flex gap-2 flex-wrap">
          {TYPE_GROUPS.map((g) => (
            <button
              key={g.value}
              onClick={() => setTypeFilter(g.value)}
              className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                typeFilter === g.value
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border text-muted-foreground dark:border-slate-600 dark:text-slate-300'
              }`}
            >
              {g.label}
            </button>
          ))}
        </div>

        <div className="rounded-2xl border border-border bg-card overflow-hidden dark:border-slate-700 dark:bg-slate-900">
          {loading && <div className="px-4 py-5 text-sm text-muted-foreground dark:text-slate-400">Завантаження...</div>}
          {!loading && filtered.length === 0 && <div className="px-4 py-5 text-sm text-muted-foreground dark:text-slate-400">Сповіщень поки немає</div>}
          {!loading && filtered.map((item) => (
            <div
              key={item.id}
              className={`px-4 py-4 border-b border-border dark:border-slate-700 ${
                item.isRead
                  ? 'bg-card dark:bg-slate-900'
                  : 'bg-blue-50 dark:bg-blue-950/40 border-l-4 border-l-blue-400'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className={`font-medium ${item.isRead ? 'text-foreground dark:text-slate-100' : 'text-foreground dark:text-white'}`}>
                      {item.title}
                    </p>
                    {!item.isRead && (
                      <span className="shrink-0 inline-block w-2 h-2 rounded-full bg-blue-500" />
                    )}
                  </div>
                  <p className="text-sm text-foreground/80 dark:text-slate-300 mt-1">{item.message}</p>
                  <p className="text-xs text-muted-foreground dark:text-slate-500 mt-1.5">
                    {TYPE_LABELS[item.type] || item.type} · {new Date(item.createdAt).toLocaleString('uk-UA')}
                  </p>
                </div>
                {!item.isRead && (
                  <button className="shrink-0 text-xs text-primary hover:underline" onClick={() => markRead(item.id)}>
                    Прочитано
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </DashboardLayout>
  )
}
