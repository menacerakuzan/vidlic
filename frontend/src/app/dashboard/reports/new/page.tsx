'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { DashboardLayout } from '@/components/dashboard-layout'
import { GlassCard } from '@/components/ui/glass-card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAuthStore } from '@/store/auth-store'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'

const schema = z.object({
  reportType: z.enum(['weekly', 'monthly']),
  periodStart: z.string().min(1),
  periodEnd: z.string().min(1),
  title: z.string().min(2),
  workDone: z.string().optional(),
  achievements: z.string().optional(),
  problems: z.string().optional(),
  nextWeekPlan: z.string().optional(),
})

type FormValues = z.infer<typeof schema>

type MyTask = {
  id: string
  title: string
  status: 'todo' | 'in_progress' | 'done'
  dueDate?: string
  completedAt?: string
}

function NewReportContent() {
  const { user } = useAuthStore()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [myTasks, setMyTasks] = useState<MyTask[]>([])
  const [selectedTaskIds, setSelectedTaskIds] = useState<string[]>([])
  const accessToken = typeof window !== 'undefined' ? localStorage.getItem('vidlik-accessToken') : null

  const {
    register,
    handleSubmit,
    setValue,
    setError,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      reportType: 'weekly',
    },
  })

  useEffect(() => {
    if (!accessToken) return
    fetch('/api/v1/tasks?limit=100', { headers: { Authorization: `Bearer ${accessToken}` } })
      .then((r) => r.json())
      .then((data) => setMyTasks(Array.isArray(data?.data) ? data.data : []))
      .catch(() => {})
  }, [accessToken])

  useEffect(() => {
    const mode = searchParams.get('mode')
    const periodStart = searchParams.get('periodStart')
    const periodEnd = searchParams.get('periodEnd')
    const reportType = searchParams.get('reportType')
    const title = searchParams.get('title')

    if (reportType === 'weekly' || reportType === 'monthly') {
      setValue('reportType', reportType)
    }
    if (periodStart) setValue('periodStart', periodStart)
    if (periodEnd) setValue('periodEnd', periodEnd)
    if (title) {
      setValue('title', title)
    } else if (mode === 'aggregate') {
      if (user?.role === 'manager') setValue('title', 'Зведений звіт керівника відділу')
      if (user?.role === 'clerk') setValue('title', 'Зведений звіт діловода департаменту')
      if (user?.role === 'director' || user?.role === 'deputy_director') setValue('title', 'Фінальний зведений звіт директора')
    }
  }, [searchParams, setValue, user?.role])

  const isAggregateMode = searchParams.get('mode') === 'aggregate'

  const onSubmit = async (values: FormValues) => {
    if (!accessToken) return
    setSubmitError('')
    if (!isAggregateMode && (!values.workDone || values.workDone.trim().length < 2)) {
      setError('workDone', { type: 'manual', message: 'Поле "Виконана робота" обовʼязкове' })
      return
    }
    if (values.periodStart && values.periodEnd && new Date(values.periodEnd) < new Date(values.periodStart)) {
      setError('periodEnd', { type: 'manual', message: 'Дата завершення не може бути раніше дати початку' })
      return
    }
    setSubmitting(true)

    const payload: any = {
      reportType: values.reportType,
      periodStart: values.periodStart,
      periodEnd: values.periodEnd,
      title: values.title,
      content: isAggregateMode
        ? { reportMode: 'aggregate' }
        : {
            reportMode: 'regular',
            workDone: values.workDone,
            achievements: values.achievements,
            problems: values.problems,
            nextWeekPlan: values.nextWeekPlan,
          },
    }

    const resp = await fetch('/api/v1/reports', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })

    setSubmitting(false)

    if (!resp.ok) {
      const err = await resp.json().catch(() => null)
      setSubmitError(err?.message || 'Не вдалося створити звіт. Спробуйте ще раз або зверніться до адміністратора.')
      return
    }

    const created = await resp.json().catch(() => null)
    const reportId = created?.id
    if (reportId && selectedTaskIds.length > 0) {
      await Promise.all(
        selectedTaskIds.map((taskId) =>
          fetch(`/api/v1/reports/${reportId}/tasks/${taskId}`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${accessToken}` },
          })
        )
      )
    }
    if (reportId) {
      router.push(`/dashboard/reports/${reportId}`)
      return
    }
    router.push('/dashboard/reports')
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold font-display">
            {isAggregateMode ? 'Створити зведену чернетку' : 'Створити чернетку звіту'}
          </h1>
          <p className="text-muted-foreground mt-1">{user?.department?.nameUk}</p>
        </div>

        <GlassCard>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="reportType">Тип звіту</Label>
                <select
                  id="reportType"
                  className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm text-foreground dark:bg-slate-800 dark:text-slate-100"
                  {...register('reportType')}
                >
                  <option value="weekly">Тижневий</option>
                  <option value="monthly">Місячний</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="title">Назва</Label>
                <Input id="title" {...register('title')} placeholder="Напр. Звіт по інтеграції AI" />
                {errors.title && <p className="text-xs text-red-500">{errors.title.message}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="periodStart">Початок періоду</Label>
                <Input id="periodStart" type="date" {...register('periodStart')} />
                {errors.periodStart && <p className="text-xs text-red-500">{errors.periodStart.message}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="periodEnd">Кінець періоду</Label>
                <Input id="periodEnd" type="date" {...register('periodEnd')} />
                {errors.periodEnd && <p className="text-xs text-red-500">{errors.periodEnd.message}</p>}
              </div>
            </div>

            {isAggregateMode ? (
              <div className="rounded-xl border border-primary/30 bg-primary/5 px-4 py-3 text-sm text-primary dark:border-primary/30 dark:bg-primary/15 dark:text-primary">
                Після створення чернетки ви одразу перейдете у картку звіту, де можна обрати джерела і натиснути
                {' '}<span className="font-semibold">"Згенерувати AI-чернетку"</span>.
                {user?.role === 'manager' && (
                  <> До зведення також додається ваш власний текст звіту.</>
                )}
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  <Label htmlFor="workDone">Виконана робота</Label>
                  <textarea
                    id="workDone"
                    rows={4}
                    className="w-full rounded-md border border-input bg-card px-3 py-2 text-sm text-foreground dark:bg-slate-800 dark:text-slate-100"
                    {...register('workDone')}
                  />
                  {errors.workDone && <p className="text-xs text-red-500">{errors.workDone.message}</p>}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="achievements">Досягнення</Label>
                    <textarea
                      id="achievements"
                      rows={3}
                      className="w-full rounded-md border border-input bg-card px-3 py-2 text-sm text-foreground dark:bg-slate-800 dark:text-slate-100"
                      {...register('achievements')}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="problems">Проблеми</Label>
                    <textarea
                      id="problems"
                      rows={3}
                      className="w-full rounded-md border border-input bg-card px-3 py-2 text-sm text-foreground dark:bg-slate-800 dark:text-slate-100"
                      {...register('problems')}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="nextWeekPlan">План на наступний період</Label>
                  <textarea
                    id="nextWeekPlan"
                    rows={3}
                    className="w-full rounded-md border border-input bg-card px-3 py-2 text-sm text-foreground dark:bg-slate-800 dark:text-slate-100"
                    {...register('nextWeekPlan')}
                  />
                </div>
              </>
            )}

            {myTasks.length > 0 && (
              <div className="space-y-2">
                <Label>Прикріпити задачі до звіту</Label>
                <div className="rounded-lg border border-border bg-secondary p-3 space-y-2 dark:border-slate-700 dark:bg-slate-800/50">
                  {myTasks.map((task) => {
                    const checked = selectedTaskIds.includes(task.id)
                    const statusIcon = task.status === 'done' ? '✅' : task.status === 'in_progress' ? '🔄' : '⬜'
                    return (
                      <label key={task.id} className="flex items-center gap-3 cursor-pointer rounded-md px-2 py-1.5 hover:bg-card dark:hover:bg-slate-700/50">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() =>
                            setSelectedTaskIds((prev) =>
                              checked ? prev.filter((id) => id !== task.id) : [...prev, task.id]
                            )
                          }
                          className="h-4 w-4 rounded border-border accent-primary"
                        />
                        <span className="text-sm">
                          {statusIcon} {task.title}
                        </span>
                        {task.dueDate && (
                          <span className="ml-auto text-xs text-muted-foreground shrink-0">
                            {new Date(task.dueDate).toLocaleDateString('uk-UA')}
                          </span>
                        )}
                      </label>
                    )
                  })}
                </div>
                {selectedTaskIds.length > 0 && (
                  <p className="text-xs text-muted-foreground">Вибрано задач: {selectedTaskIds.length}</p>
                )}
              </div>
            )}

            {submitError && (
              <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {submitError}
              </p>
            )}

            <Button type="submit" disabled={submitting}>
              {submitting ? 'Збереження...' : isAggregateMode ? 'Створити чернетку для AI-склейки' : 'Зберегти чернетку'}
            </Button>
          </form>
        </GlassCard>
      </div>
    </DashboardLayout>
  )
}

export default function NewReport() {
  return (
    <Suspense fallback={<DashboardLayout><div className="p-6 text-sm text-muted-foreground">Завантаження...</div></DashboardLayout>}>
      <NewReportContent />
    </Suspense>
  )
}
