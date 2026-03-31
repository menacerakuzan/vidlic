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

function NewReportContent() {
  const { user } = useAuthStore()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [submitting, setSubmitting] = useState(false)
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
    if (!isAggregateMode && (!values.workDone || values.workDone.trim().length < 2)) {
      setError('workDone', { type: 'manual', message: 'Поле "Виконана робота" обовʼязкове' })
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
      return
    }

    const created = await resp.json().catch(() => null)
    const reportId = created?.id
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
          <p className="text-slate-500 mt-1">{user?.department?.nameUk}</p>
        </div>

        <GlassCard>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="reportType">Тип звіту</Label>
                <select
                  id="reportType"
                  className="h-10 w-full rounded-md border border-input bg-white px-3 text-sm text-slate-900 dark:bg-slate-800 dark:text-slate-100"
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
              <div className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-800 dark:border-sky-900/60 dark:bg-sky-950/30 dark:text-sky-200">
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
                    className="w-full rounded-md border border-input bg-white px-3 py-2 text-sm text-slate-900 dark:bg-slate-800 dark:text-slate-100"
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
                      className="w-full rounded-md border border-input bg-white px-3 py-2 text-sm text-slate-900 dark:bg-slate-800 dark:text-slate-100"
                      {...register('achievements')}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="problems">Проблеми</Label>
                    <textarea
                      id="problems"
                      rows={3}
                      className="w-full rounded-md border border-input bg-white px-3 py-2 text-sm text-slate-900 dark:bg-slate-800 dark:text-slate-100"
                      {...register('problems')}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="nextWeekPlan">План на наступний період</Label>
                  <textarea
                    id="nextWeekPlan"
                    rows={3}
                    className="w-full rounded-md border border-input bg-white px-3 py-2 text-sm text-slate-900 dark:bg-slate-800 dark:text-slate-100"
                    {...register('nextWeekPlan')}
                  />
                </div>
              </>
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
    <Suspense fallback={<DashboardLayout><div className="p-6 text-sm text-slate-500">Завантаження...</div></DashboardLayout>}>
      <NewReportContent />
    </Suspense>
  )
}
