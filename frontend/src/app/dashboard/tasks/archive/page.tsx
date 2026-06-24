'use client'

import { useEffect, useState } from 'react'
import { DashboardLayout } from '@/components/dashboard-layout'
import { useAuthStore } from '@/store/auth-store'
import { extractApiErrorMessage } from '@/lib/error-message'

type ArchivedTask = {
  id: string
  title: string
  description?: string
  status: 'todo' | 'in_progress' | 'done'
  deletedAt?: string | null
  archivedAt?: string | null
  archiveType: 'deleted' | 'completed'
  assignee?: { id: string; firstName: string; lastName: string } | null
  reporter?: { id: string; firstName: string; lastName: string } | null
  department?: { id: string; name?: string; nameUk?: string } | null
}

export default function TaskArchivePage() {
  const { user } = useAuthStore()
  const [tasks, setTasks] = useState<ArchivedTask[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [restoringId, setRestoringId] = useState('')
  const [deletingId, setDeletingId] = useState('')
  const [activeTab, setActiveTab] = useState<'completed' | 'deleted'>('completed')

  const accessToken = typeof window !== 'undefined' ? localStorage.getItem('vidlik-accessToken') : null

  const loadArchive = async () => {
    if (!accessToken) return
    setLoading(true)
    const resp = await fetch('/api/v1/tasks/archive', {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    setLoading(false)
    if (resp.ok) {
      const data = await resp.json()
      setTasks(Array.isArray(data) ? data : [])
      return
    }
    const err = await resp.json().catch(() => null)
    setError(extractApiErrorMessage(resp.status, err, 'Не вдалося завантажити архів'))
  }

  useEffect(() => {
    loadArchive()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 2200)
    return () => clearTimeout(t)
  }, [toast])

  const restore = async (id: string) => {
    if (!accessToken) return
    setRestoringId(id)
    const resp = await fetch(`/api/v1/tasks/${id}/restore`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    setRestoringId('')
    if (resp.ok) {
      setToast({ type: 'success', message: 'Задачу відновлено' })
      await loadArchive()
      return
    }
    const err = await resp.json().catch(() => null)
    setToast({ type: 'error', message: extractApiErrorMessage(resp.status, err, 'Не вдалося відновити задачу') })
  }

  const hardDelete = async (id: string) => {
    if (!accessToken) return
    if (!window.confirm('Остаточно видалити задачу? Цю дію неможливо скасувати.')) return
    setDeletingId(id)
    const resp = await fetch(`/api/v1/tasks/${id}/permanent`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    setDeletingId('')
    if (resp.ok) {
      setToast({ type: 'success', message: 'Задачу видалено остаточно' })
      await loadArchive()
      return
    }
    const err = await resp.json().catch(() => null)
    setToast({ type: 'error', message: extractApiErrorMessage(resp.status, err, 'Не вдалося видалити задачу') })
  }

  const completedTasks = tasks.filter(t => t.archiveType === 'completed')
  const deletedTasks = tasks.filter(t => t.archiveType === 'deleted')
  const visibleTasks = activeTab === 'completed' ? completedTasks : deletedTasks

  const tabDate = (task: ArchivedTask) => {
    const dt = task.archiveType === 'completed' ? task.archivedAt : task.deletedAt
    if (!dt) return ''
    return new Date(dt).toLocaleString('uk-UA', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  }

  return (
    <DashboardLayout>
      <div className="space-y-4 p-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-foreground dark:text-slate-100">Архів задач</h1>
          <p className="text-sm text-muted-foreground dark:text-slate-400">
            {tasks.length > 0 ? `${tasks.length} задач в архіві` : ''}
          </p>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 border-b border-border dark:border-slate-700">
          <button
            onClick={() => setActiveTab('completed')}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'completed'
                ? 'border-emerald-500 text-emerald-700 dark:text-emerald-400'
                : 'border-transparent text-muted-foreground hover:text-foreground/80 dark:text-slate-400 dark:hover:text-slate-200'
            }`}
          >
            ✅ Виконані ({completedTasks.length})
          </button>
          <button
            onClick={() => setActiveTab('deleted')}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'deleted'
                ? 'border-rose-500 text-rose-700 dark:text-rose-400'
                : 'border-transparent text-muted-foreground hover:text-foreground/80 dark:text-slate-400 dark:hover:text-slate-200'
            }`}
          >
            🗑 Видалені ({deletedTasks.length})
          </button>
        </div>

        {activeTab === 'completed' && (
          <p className="text-xs text-muted-foreground dark:text-slate-400">
            Задачі автоматично переміщуються сюди через 1 день після виконання
          </p>
        )}

        {error && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 dark:border-rose-800/40 dark:bg-rose-950/20 p-4">
            <p className="text-sm text-rose-700 dark:text-rose-300">{error}</p>
          </div>
        )}

        {loading && (
          <p className="text-sm text-muted-foreground dark:text-slate-400">Завантаження...</p>
        )}

        {!loading && visibleTasks.length === 0 && !error && (
          <div className="rounded-xl border border-border dark:border-slate-700 bg-card dark:bg-slate-800 p-8 text-center">
            <p className="text-sm text-muted-foreground dark:text-slate-400">
              {activeTab === 'completed' ? 'Немає виконаних задач в архіві' : 'Немає видалених задач'}
            </p>
          </div>
        )}

        <div className="space-y-2">
          {visibleTasks.map((task) => (
            <div
              key={task.id}
              className={`rounded-xl border bg-card dark:bg-slate-800 px-4 py-3 flex items-start gap-4 ${
                task.archiveType === 'deleted'
                  ? 'border-rose-200 dark:border-rose-800/40'
                  : 'border-emerald-200 dark:border-emerald-800/40'
              }`}
            >
              <div className="flex-1 min-w-0 space-y-0.5">
                <p className="text-sm font-medium text-foreground dark:text-slate-200 line-clamp-2">{task.title}</p>
                <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground dark:text-slate-400">
                  {task.assignee && (
                    <span>{task.assignee.firstName} {task.assignee.lastName}</span>
                  )}
                  {task.department && (
                    <span>{task.department.nameUk || task.department.name}</span>
                  )}
                  <span className="text-muted-foreground dark:text-slate-500">
                    {task.archiveType === 'completed' ? 'Виконано та заархівовано:' : 'Видалено:'} {tabDate(task)}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => restore(task.id)}
                  disabled={restoringId === task.id}
                  className="rounded border border-emerald-300 px-2 py-1 text-xs text-emerald-700 dark:border-emerald-700 dark:text-emerald-400 disabled:opacity-60 hover:bg-emerald-50 dark:hover:bg-emerald-950/20 transition"
                >
                  {restoringId === task.id ? '...' : 'Відновити'}
                </button>
                {user?.role === 'admin' && (
                  <button
                    onClick={() => hardDelete(task.id)}
                    disabled={deletingId === task.id}
                    className="rounded border border-rose-300 px-2 py-1 text-xs text-rose-700 dark:border-rose-700 dark:text-rose-400 disabled:opacity-60 hover:bg-rose-50 dark:hover:bg-rose-950/20 transition"
                  >
                    {deletingId === task.id ? '...' : 'Видалити'}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 rounded-xl px-4 py-3 text-sm font-medium shadow-lg ${
          toast.type === 'success'
            ? 'bg-emerald-600 text-white'
            : 'bg-rose-600 text-white'
        }`}>
          {toast.message}
        </div>
      )}
    </DashboardLayout>
  )
}
