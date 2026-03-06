'use client'

import { useEffect, useState } from 'react'
import { DashboardLayout } from '@/components/dashboard-layout'

type Notification = {
  id: string
  type: string
  title: string
  message: string
  isRead: boolean
  createdAt: string
}

export default function NotificationsPage() {
  const [items, setItems] = useState<Notification[]>([])
  const [loading, setLoading] = useState(true)
  const accessToken = typeof window !== 'undefined' ? localStorage.getItem('vidlik-accessToken') : null

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

  useEffect(() => {
    load()
    if (!accessToken) return

    const stream = new EventSource(`/api/v1/notifications/stream?token=${encodeURIComponent(accessToken)}`)
    stream.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data || '{}')
        if (payload?.type === 'notification.created') {
          load()
        }
      } catch {
        // ignore
      }
    }
    stream.onerror = () => stream.close()

    return () => stream.close()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken])

  const markRead = async (id: string) => {
    if (!accessToken) return
    const resp = await fetch(`/api/v1/notifications/${id}/read`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (resp.ok) {
      await load()
    }
  }

  const markAllRead = async () => {
    if (!accessToken) return
    const resp = await fetch('/api/v1/notifications/read-all', {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (resp.ok) {
      await load()
    }
  }

  return (
    <DashboardLayout>
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold font-display">Сповіщення</h1>
            <p className="text-slate-500 mt-1">Оповіщення щодо звітів і задач</p>
          </div>
          <button className="rounded-lg border border-slate-300 px-3 py-2 text-sm" onClick={markAllRead}>
            Позначити все як прочитане
          </button>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
          {loading && <div className="px-4 py-5 text-sm text-slate-500">Завантаження...</div>}
          {!loading && items.length === 0 && <div className="px-4 py-5 text-sm text-slate-500">Сповіщень поки немає</div>}
          {!loading && items.map((item) => (
            <div key={item.id} className={`px-4 py-4 border-b border-slate-100 ${item.isRead ? 'bg-white' : 'bg-blue-50/40'}`}>
              <div className="flex items-center justify-between gap-3">
                <p className="font-medium text-slate-900">{item.title}</p>
                {!item.isRead && (
                  <button className="text-xs text-primary hover:underline" onClick={() => markRead(item.id)}>
                    Прочитано
                  </button>
                )}
              </div>
              <p className="text-sm text-slate-700 mt-1">{item.message}</p>
              <p className="text-xs text-slate-500 mt-2">{new Date(item.createdAt).toLocaleString('uk-UA')}</p>
            </div>
          ))}
        </div>
      </div>
    </DashboardLayout>
  )
}
