'use client'

import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuthStore } from '@/store/auth-store'

type ReportSubmission = {
  documentTitle?: string
  headerLines?: string[]
  bodyText?: string
  style?: {
    fontFamily?: string
    fontSize?: number
  }
}

export default function ReportPrintPage() {
  const params = useParams<{ id: string }>()
  const { user } = useAuthStore()
  const [report, setReport] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [editMode, setEditMode] = useState(false)
  const [isDirty, setIsDirty] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const [draftTitle, setDraftTitle] = useState('ЗВІТ')
  const [draftHeader, setDraftHeader] = useState('')
  const [draftBody, setDraftBody] = useState('')

  const accessToken = typeof window !== 'undefined' ? localStorage.getItem('vidlik-accessToken') : null

  const applySubmissionToDraft = useCallback((submission: ReportSubmission | null) => {
    setDraftTitle(submission?.documentTitle || 'ЗВІТ')
    setDraftHeader(Array.isArray(submission?.headerLines) ? submission!.headerLines!.join('\n') : '')
    setDraftBody(submission?.bodyText || '')
    setIsDirty(false)
  }, [])

  const load = useCallback(async () => {
    if (!accessToken || !params?.id) return
    setLoading(true)
    setError('')

    const resp = await fetch(`/api/v1/reports/${params.id}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })

    if (!resp.ok) {
      setError('Не вдалося завантажити звіт.')
      setLoading(false)
      return
    }

    const data = await resp.json()
    setReport(data)
    applySubmissionToDraft(data?.content?.managerSubmission || null)
    setLoading(false)
  }, [accessToken, applySubmissionToDraft, params?.id])

  useEffect(() => {
    load()
  }, [load])

  const submission = useMemo<ReportSubmission | null>(() => report?.content?.managerSubmission || null, [report])
  const renderedTitle = (editMode ? draftTitle : (submission?.documentTitle || 'ЗВІТ')).trim() || 'ЗВІТ'
  const renderedHeaderLines = (editMode
    ? draftHeader.split('\n').map((line) => line.trim()).filter(Boolean)
    : (submission?.headerLines || [])).slice(0, 6)
  const renderedBody = editMode ? draftBody : (submission?.bodyText || '')

  const canEdit = useMemo(() => {
    if (!user || !report) return false
    if (user.role === 'admin') return true
    return report.status === 'draft' && report.author?.id === user.id
  }, [report, user])

  const saveDraft = async () => {
    if (!accessToken || !report?.id) return
    setSaving(true)
    setError('')
    setSuccess('')

    const existingContent = report.content || {}
    const payload = {
      title: report.title,
      periodStart: report.periodStart,
      periodEnd: report.periodEnd,
      content: {
        ...existingContent,
        managerSubmission: {
          ...(existingContent.managerSubmission || {}),
          documentTitle: (draftTitle || 'ЗВІТ').trim() || 'ЗВІТ',
          headerLines: draftHeader.split('\n').map((line: string) => line.trim()).filter(Boolean),
          bodyText: draftBody,
          style: {
            fontFamily: 'Times New Roman',
            fontSize: 14,
          },
          editedByPrintView: true,
          editedAt: new Date().toISOString(),
        },
      },
    }

    const resp = await fetch(`/api/v1/reports/${report.id}`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })

    setSaving(false)

    if (!resp.ok) {
      const err = await resp.json().catch(() => null)
      setError(err?.message || 'Не вдалося зберегти зміни.')
      return
    }

    setSuccess('Зміни збережено.')
    setEditMode(false)
    setIsDirty(false)
    await load()
  }

  const cancelEdit = () => {
    applySubmissionToDraft(submission)
    setEditMode(false)
    setError('')
    setSuccess('')
  }

  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!isDirty) return
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [isDirty])

  if (loading) {
    return <div className="px-6 py-8 text-sm text-slate-600">Завантаження...</div>
  }

  if (!report) {
    return <div className="px-6 py-8 text-sm text-rose-700">Звіт не знайдено.</div>
  }

  return (
    <div className="min-h-screen bg-slate-100 px-4 py-6 md:px-8 print:bg-white print:p-0">
      <div className="mx-auto mb-4 flex max-w-[920px] flex-wrap items-center gap-2 print:hidden">
        <Link
          href={`/dashboard/reports/${report.id}`}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
        >
          До звіту
        </Link>
        {canEdit && !editMode && (
          <button
            onClick={() => setEditMode(true)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
          >
            Редагувати
          </button>
        )}
        {canEdit && editMode && (
          <>
            <button
              onClick={saveDraft}
              disabled={saving}
              className="rounded-lg bg-emerald-600 px-3 py-2 text-sm text-white disabled:opacity-60"
            >
              {saving ? 'Збереження...' : 'Зберегти'}
            </button>
            <button
              onClick={cancelEdit}
              disabled={saving}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-60"
            >
              Скасувати
            </button>
          </>
        )}
        <button
          onClick={() => window.print()}
          className="rounded-lg border border-primary bg-white px-3 py-2 text-sm text-primary hover:bg-sky-50"
        >
          Друкувати
        </button>
      </div>

      <div className="mx-auto max-w-[920px]">
        {error && <div className="mb-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 print:hidden">{error}</div>}
        {success && <div className="mb-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700 print:hidden">{success}</div>}
      </div>

      <article className="page-sheet mx-auto w-full max-w-[920px] bg-white text-black shadow-[0_10px_28px_rgba(15,23,42,0.10)] print:max-w-none print:shadow-none">
        <div className="p-[18mm] md:p-[20mm]">
          {editMode ? (
            <input
              value={draftTitle}
              onChange={(e) => {
                setDraftTitle(e.target.value)
                setIsDirty(true)
              }}
              className="mb-2 w-full border-0 border-b border-slate-300 bg-transparent px-1 py-1 text-center font-semibold focus:border-slate-500 focus:outline-none"
              style={{ fontFamily: 'Times New Roman', fontSize: 20 }}
            />
          ) : (
            <h1 className="mb-2 text-center font-semibold uppercase tracking-[0.03em]" style={{ fontFamily: 'Times New Roman', fontSize: 20 }}>
              {renderedTitle}
            </h1>
          )}

          {editMode ? (
            <textarea
              value={draftHeader}
              onChange={(e) => {
                setDraftHeader(e.target.value)
                setIsDirty(true)
              }}
              rows={Math.max(2, draftHeader.split('\n').length)}
              className="w-full resize-y border-0 border-b border-slate-300 bg-transparent px-1 py-1 text-center focus:border-slate-500 focus:outline-none"
              style={{ fontFamily: 'Times New Roman', fontSize: 14, lineHeight: 1.5 }}
            />
          ) : (
            <div className="mb-5 space-y-0.5 text-center" style={{ fontFamily: 'Times New Roman', fontSize: 14, lineHeight: 1.5 }}>
              {renderedHeaderLines.map((line, idx) => (
                <p key={`header-${idx}`}>{line}</p>
              ))}
            </div>
          )}

          <div className={editMode ? 'mt-4' : 'mt-6'}>
            {editMode ? (
              <textarea
              value={draftBody}
              onChange={(e) => {
                setDraftBody(e.target.value)
                setIsDirty(true)
              }}
                rows={34}
                className="w-full resize-y rounded-sm border border-slate-300 bg-white px-3 py-3 focus:border-slate-500 focus:outline-none"
                style={{ fontFamily: 'Times New Roman', fontSize: 14, lineHeight: 1.6 }}
              />
            ) : renderedBody.trim().length > 0 ? (
              <div style={{ fontFamily: 'Times New Roman', fontSize: 14, lineHeight: 1.6 }}>
                {renderedBody.split('\n').map((line, idx) => (
                  <p key={`line-${idx}`} className="text-justify first-line:indent-8">
                    {line.trim() || '\u00A0'}
                  </p>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-500">Немає підготовленого тексту для друку.</p>
            )}
          </div>
        </div>
      </article>

      <style jsx global>{`
        @page {
          size: A4;
          margin: 14mm;
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
