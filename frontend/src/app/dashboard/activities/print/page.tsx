'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'

type ActivityRow = {
  id: string
  index: number
  title: string
  location: string
  schedule: string
  responsible: string
}

type ActivityPlanResponse = {
  reportId: string
  periodType: 'weekly' | 'monthly'
  period: string
  title: string
  department?: { id: string; nameUk: string }
  rows: ActivityRow[]
  updatedAt: string
}

function formatPeriodLabel(periodType: 'weekly' | 'monthly', period: string) {
  if (periodType === 'weekly') {
    return `за тиждень ${period}`
  }
  const [yearRaw, monthRaw] = period.split('-')
  const year = Number(yearRaw)
  const month = Number(monthRaw)
  const monthNames = [
    'січні',
    'лютому',
    'березні',
    'квітні',
    'травні',
    'червні',
    'липні',
    'серпні',
    'вересні',
    'жовтні',
    'листопаді',
    'грудні',
  ]
  const name = monthNames[month - 1] || period
  return `які відбудуться у ${name} ${year} року`
}

export default function ActivitiesPrintPage() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [plan, setPlan] = useState<ActivityPlanResponse | null>(null)
  const accessToken = typeof window !== 'undefined' ? localStorage.getItem('vidlik-accessToken') : null

  const query = useMemo(() => {
    if (typeof window === 'undefined') {
      return { periodType: 'monthly' as const, period: '' }
    }
    const params = new URLSearchParams(window.location.search)
    const periodType = params.get('periodType') === 'weekly' ? 'weekly' : 'monthly'
    const period = params.get('period') || ''
    return { periodType, period }
  }, [])

  useEffect(() => {
    async function load() {
      if (!accessToken || !query.period) return
      setLoading(true)
      setError('')
      const resp = await fetch(
        `/api/v1/reports/activities/plan?periodType=${encodeURIComponent(query.periodType)}&period=${encodeURIComponent(query.period)}`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      )
      if (!resp.ok) {
        setError('Не вдалося завантажити друк-версію плану заходів')
        setLoading(false)
        return
      }
      const data = (await resp.json()) as ActivityPlanResponse
      setPlan(data)
      setLoading(false)
    }
    load()
  }, [accessToken, query.period, query.periodType])

  const departmentName = plan?.department?.nameUk || 'структурного підрозділу облдержадміністрації'
  const periodLabel = formatPeriodLabel(query.periodType, plan?.period || query.period || '')

  return (
    <div className="min-h-screen bg-slate-100 px-4 py-6 md:px-8 print:bg-white print:p-0">
      <div className="mx-auto mb-4 flex max-w-[980px] flex-wrap items-center gap-2 print:hidden">
        <Link
          href="/dashboard/activities"
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
        >
          До заходів
        </Link>
        <button
          onClick={() => window.print()}
          className="rounded-lg border border-primary bg-white px-3 py-2 text-sm text-primary hover:bg-sky-50"
        >
          Друкувати
        </button>
      </div>

      {loading && <div className="mx-auto max-w-[980px] text-sm text-slate-600">Завантаження...</div>}
      {!loading && error && <div className="mx-auto max-w-[980px] text-sm text-rose-700">{error}</div>}

      {!loading && !error && plan && (
        <article className="page-sheet mx-auto w-full max-w-[980px] bg-white text-black shadow-[0_10px_28px_rgba(15,23,42,0.10)] print:max-w-none print:shadow-none">
          <div className="p-[14mm] md:p-[16mm]">
            <div className="mb-6 flex justify-end text-sm leading-6">
              <div className="max-w-[360px] text-left">
                <p className="uppercase">ПОГОДЖУЮ</p>
                <p>Заступник голови обласної державної адміністрації</p>
                <p>_____________________</p>
                <p>«____» __________ 2026 року</p>
              </div>
            </div>

            <div className="mb-4 text-center">
              <p className="text-base font-semibold uppercase">ОСНОВНІ ЗАХОДИ</p>
              <p className="text-sm">
                {departmentName},
              </p>
              <p className="text-sm">{periodLabel}</p>
            </div>

            <table className="w-full border-collapse text-[13px]">
              <thead>
                <tr>
                  <th className="border border-black px-2 py-2 w-[44px]">№</th>
                  <th className="border border-black px-2 py-2">Назва заходу</th>
                  <th className="border border-black px-2 py-2 w-[180px]">Місце проведення заходу</th>
                  <th className="border border-black px-2 py-2 w-[160px]">Дата та час проведення заходу</th>
                  <th className="border border-black px-2 py-2 w-[200px]">Відповідальний за проведення заходу</th>
                </tr>
              </thead>
              <tbody>
                {plan.rows.length === 0 && (
                  <tr>
                    <td className="border border-black px-2 py-2" colSpan={5}>Немає даних</td>
                  </tr>
                )}
                {plan.rows.map((row, idx) => (
                  <tr key={row.id}>
                    <td className="border border-black px-2 py-2 align-top text-center">{idx + 1}</td>
                    <td className="border border-black px-2 py-2 align-top whitespace-pre-wrap">{row.title}</td>
                    <td className="border border-black px-2 py-2 align-top whitespace-pre-wrap">{row.location}</td>
                    <td className="border border-black px-2 py-2 align-top whitespace-pre-wrap">{row.schedule}</td>
                    <td className="border border-black px-2 py-2 align-top whitespace-pre-wrap">{row.responsible}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="mt-8 text-sm">
              <p>Тимчасово виконуючий обовʼязки директора _______________________</p>
            </div>
          </div>
        </article>
      )}

      <style jsx global>{`
        @page {
          size: A4;
          margin: 12mm;
        }
        @media print {
          html,
          body {
            background: #fff !important;
          }
          .page-sheet {
            width: auto !important;
            min-height: auto !important;
          }
        }
      `}</style>
    </div>
  )
}
