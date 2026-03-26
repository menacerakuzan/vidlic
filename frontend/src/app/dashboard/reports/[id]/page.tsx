'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { DashboardLayout } from '@/components/dashboard-layout'
import { useAuthStore } from '@/store/auth-store'
import { ReportStatusBadge } from '@/components/reports/report-status-badge'

export default function ReportDetailsPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const { user, isAuthenticated } = useAuthStore()
  const [report, setReport] = useState<any>(null)
  const [aiSummary, setAiSummary] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)
  const [error, setError] = useState<string>('')
  const [summaryLoading, setSummaryLoading] = useState(false)
  const [draftLoading, setDraftLoading] = useState(false)
  const [savingDraft, setSavingDraft] = useState(false)
  const [autoSaving, setAutoSaving] = useState(false)
  const [isDirty, setIsDirty] = useState(false)
  const [lastSavedAt, setLastSavedAt] = useState<string>('')
  const [managerDraftText, setManagerDraftText] = useState('')
  const [managerDraftTitle, setManagerDraftTitle] = useState('ЗВІТ')
  const [managerDraftHeaderLines, setManagerDraftHeaderLines] = useState<string[]>([])
  const [managerDraftSource, setManagerDraftSource] = useState<'ai' | 'fallback' | ''>('')
  const [comments, setComments] = useState<any[]>([])
  const [commentsLoading, setCommentsLoading] = useState(false)
  const [commentText, setCommentText] = useState('')
  const [commentSection, setCommentSection] = useState('workDone')
  const [commentSubmitting, setCommentSubmitting] = useState(false)
  const [versionDiff, setVersionDiff] = useState<any>(null)
  const [fromVersion, setFromVersion] = useState<number>(1)
  const [toVersion, setToVersion] = useState<number>(1)
  const [versionDiffLoading, setVersionDiffLoading] = useState(false)
  const [attachments, setAttachments] = useState<any[]>([])
  const [attachmentsLoading, setAttachmentsLoading] = useState(false)
  const [uploadingAttachment, setUploadingAttachment] = useState(false)
  const [aggregationSources, setAggregationSources] = useState<any[]>([])
  const [aggregationSourcesLoading, setAggregationSourcesLoading] = useState(false)
  const [selectedSourceIds, setSelectedSourceIds] = useState<string[]>([])
  const [sourceStatusFilter, setSourceStatusFilter] = useState<'all' | 'approved' | 'pending'>('all')
  const [sourceDepartmentFilter, setSourceDepartmentFilter] = useState<string>('all')
  const [sourceAuthorFilter, setSourceAuthorFilter] = useState<string>('all')
  const accessToken = typeof window !== 'undefined' ? localStorage.getItem('vidlik-accessToken') : null
  const decodeEntities = (value: string) =>
    value
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'")
  const normalizeSubmissionText = (submission: any) => {
    const plain = typeof submission?.bodyTextPlain === 'string' ? submission.bodyTextPlain : ''
    if (plain.trim()) return plain
    const body = typeof submission?.bodyText === 'string' ? submission.bodyText : ''
    if (!body) return ''
    const looksLikeHtml = /<\/?[a-z][\s\S]*>/i.test(body)
    if (!looksLikeHtml) return body
    return decodeEntities(
      body
        .replace(/\r/g, '')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/p>/gi, '\n')
        .replace(/<\/div>/gi, '\n')
        .replace(/<li>/gi, '• ')
        .replace(/<\/li>/gi, '\n')
        .replace(/<[^>]+>/g, '')
        .replace(/\n{3,}/g, '\n\n')
        .trim(),
    )
  }

  useEffect(() => {
    if (!isAuthenticated) router.push('/')
  }, [isAuthenticated, router])

  const loadData = async () => {
    if (!accessToken || !params?.id) return
    setLoading(true)
    setError('')

    const [reportResp, summaryResp] = await Promise.all([
      fetch(`/api/v1/reports/${params.id}`, { headers: { Authorization: `Bearer ${accessToken}` } }),
      fetch(`/api/v1/ai/reports/${params.id}/summary`, { headers: { Authorization: `Bearer ${accessToken}` } }),
    ])

    if (reportResp.ok) {
      const data = await reportResp.json()
      setReport(data)
      const submission = data?.content?.managerSubmission
      if (submission) {
        setManagerDraftText(normalizeSubmissionText(submission))
        setManagerDraftTitle(submission.documentTitle || 'ЗВІТ')
        setManagerDraftHeaderLines(Array.isArray(submission.headerLines) ? submission.headerLines : [])
        setManagerDraftSource(submission.generatedBy || '')
      } else {
        setManagerDraftText('')
        setManagerDraftTitle('ЗВІТ')
        setManagerDraftHeaderLines([])
        setManagerDraftSource('')
      }
      setIsDirty(false)
      setLastSavedAt(new Date().toISOString())
      setFromVersion(Math.max(1, Number(data?.version || 1) - 1))
      setToVersion(Number(data?.version || 1))
    }

    if (summaryResp.ok) {
      const data = await summaryResp.json()
      setAiSummary(data)
    } else {
      setAiSummary(null)
    }

    if (!reportResp.ok) {
      setError('Не вдалося завантажити звіт')
    }

    setLoading(false)
  }

  useEffect(() => {
    loadData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params?.id, accessToken])

  const loadComments = async () => {
    if (!accessToken || !params?.id) return
    setCommentsLoading(true)
    const resp = await fetch(`/api/v1/reports/${params.id}/comments`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (resp.ok) {
      const data = await resp.json()
      setComments(Array.isArray(data) ? data : [])
    }
    setCommentsLoading(false)
  }

  const loadVersionDiff = async (from = fromVersion, to = toVersion) => {
    if (!accessToken || !params?.id) return
    setVersionDiffLoading(true)
    const resp = await fetch(`/api/v1/reports/${params.id}/version-diff?fromVersion=${from}&toVersion=${to}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (resp.ok) {
      const data = await resp.json()
      setVersionDiff(data)
    }
    setVersionDiffLoading(false)
  }

  useEffect(() => {
    loadComments()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params?.id, accessToken])

  useEffect(() => {
    if (!report?.id) return
    loadVersionDiff(fromVersion, toVersion)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [report?.id, fromVersion, toVersion])

  const loadAttachments = async () => {
    if (!accessToken || !params?.id) return
    setAttachmentsLoading(true)
    const resp = await fetch(`/api/v1/attachments?entityType=report&entityId=${params.id}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (resp.ok) {
      const data = await resp.json()
      setAttachments(Array.isArray(data) ? data : [])
    }
    setAttachmentsLoading(false)
  }

  useEffect(() => {
    loadAttachments()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params?.id, accessToken])

  const checklist = useMemo(() => {
    const content = report?.content || {}
    return [
      { key: 'title', label: 'Назва звіту заповнена', ok: !!report?.title?.trim() },
      { key: 'period', label: 'Період звіту заповнений', ok: !!report?.periodStart && !!report?.periodEnd },
      { key: 'workDone', label: 'Розділ \"Виконана робота\" заповнений', ok: !!content?.workDone?.trim?.() },
      { key: 'managerSubmission', label: 'Текст для погодження підготовлений', ok: managerDraftText.trim().length > 0 },
    ]
  }, [report, managerDraftText])

  const canSubmit = useMemo(
    () => report?.status === 'draft' && report?.author?.id === user?.id && checklist.every((item) => item.ok),
    [report, user, checklist],
  )

  const canEditSubmission = useMemo(
    () => report?.status === 'draft' && report?.author?.id === user?.id,
    [report, user],
  )
  const canComment = useMemo(() => ['manager', 'clerk', 'director', 'admin'].includes(user?.role || ''), [user?.role])

  const canDelete = useMemo(() => {
    if (!report || !user) return false
    if (user.role === 'admin') return true
    return ['draft', 'rejected'].includes(report.status) && report.author?.id === user.id
  }, [report, user])

  const canApprove = useMemo(() => {
    if (!report || !user) return false
    if (user.role === 'manager') {
      return report.status === 'pending_manager' && report.currentApprover?.id === user.id
    }
    if (user.role === 'clerk') {
      return report.status === 'pending_clerk' && report.currentApprover?.id === user.id
    }
    if (user.role === 'director') {
      return report.status === 'pending_director' && report.currentApprover?.id === user.id
    }
    return false
  }, [report, user])
  const canCreateAggregateDraft = useMemo(
    () => !!report && ['manager', 'clerk', 'director'].includes(user?.role || '') && !canEditSubmission,
    [report, user?.role, canEditSubmission],
  )
  const aggregateCreateLabel = useMemo(() => {
    if (user?.role === 'manager') return 'Створити зведений звіт відділу'
    if (user?.role === 'clerk') return 'Створити зведений звіт департаменту'
    if (user?.role === 'director') return 'Створити фінальний зведений звіт'
    return 'Створити зведений звіт'
  }, [user?.role])
  const aggregateDraftHint = useMemo(() => {
    if (user?.role === 'manager') {
      return 'Ви переглядаєте звіт спеціаліста. Для склейки по відділу створіть власну чернетку за цей період і натисніть "Згенерувати AI-чернетку".'
    }
    if (user?.role === 'clerk') {
      return 'Ви переглядаєте звіт керівника. Для склейки по департаменту створіть власну чернетку за цей період і натисніть "Згенерувати AI-чернетку".'
    }
    if (user?.role === 'director') {
      return 'Для фінального зведення створіть власну чернетку за цей період і натисніть "Згенерувати AI-чернетку".'
    }
    return ''
  }, [user?.role])

  const submitButtonLabel = useMemo(() => {
    if (!user) return 'Відправити на погодження'
    if (user.role === 'specialist') return 'На погодження керівнику'
    if (user.role === 'manager') return 'На погодження діловоду'
    if (user.role === 'clerk') return 'На погодження директору'
    return 'Відправити на погодження'
  }, [user])

  const draftHint = useMemo(() => {
    if (!user) return 'Сформуйте AI-чернетку за поточний період.'
    if (user.role === 'manager') {
      return 'AI зведе ваш власний звіт + звіти спеціалістів вашого відділу за обраний період у єдиний документ керівника.'
    }
    if (user.role === 'clerk') {
      return 'AI зведе звіти керівників відділів вашого департаменту за обраний період у консолідований документ діловода.'
    }
    if (user.role === 'director') {
      return 'AI сформує фінальне зведення директора на основі консолідованих документів діловода за обраний період.'
    }
    return 'AI сформує офіційний документ для погодження за обраний період.'
  }, [user])
  const canAggregateBySources = useMemo(
    () => canEditSubmission && ['manager', 'clerk', 'director'].includes(user?.role || ''),
    [canEditSubmission, user?.role],
  )
  const sourceDepartmentOptions = useMemo(() => {
    const map = new Map<string, string>()
    aggregationSources.forEach((source) => {
      if (source.departmentId) map.set(source.departmentId, source.departmentName)
    })
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }))
  }, [aggregationSources])
  const sourceAuthorOptions = useMemo(() => {
    const map = new Map<string, string>()
    aggregationSources.forEach((source) => {
      if (source.authorId) map.set(source.authorId, source.authorName)
    })
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }))
  }, [aggregationSources])
  const filteredAggregationSources = useMemo(() => {
    return aggregationSources.filter((source) => {
      if (sourceStatusFilter === 'approved' && source.status !== 'approved') return false
      if (sourceStatusFilter === 'pending' && source.status === 'approved') return false
      if (sourceDepartmentFilter !== 'all' && source.departmentId !== sourceDepartmentFilter) return false
      if (sourceAuthorFilter !== 'all' && source.authorId !== sourceAuthorFilter) return false
      return true
    })
  }, [aggregationSources, sourceStatusFilter, sourceDepartmentFilter, sourceAuthorFilter])

  const loadAggregationSources = async () => {
    if (!accessToken || !params?.id || !canAggregateBySources) {
      setAggregationSources([])
      setSelectedSourceIds([])
      return
    }
    setAggregationSourcesLoading(true)
    const resp = await fetch(`/api/v1/reports/${params.id}/aggregation-sources`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (resp.ok) {
      const data = await resp.json()
      const sources = Array.isArray(data?.sources) ? data.sources : []
      setAggregationSources(sources)
      setSelectedSourceIds(sources.map((s: any) => s.reportId))
    } else {
      setAggregationSources([])
      setSelectedSourceIds([])
    }
    setAggregationSourcesLoading(false)
  }

  const doAction = async (type: 'submit' | 'approve' | 'reject') => {
    if (!accessToken || !params?.id) return
    setActionLoading(true)

    const body = type === 'reject'
      ? { comment: window.prompt('Вкажіть причину відхилення') || '' }
      : { comment: '' }

    if (type === 'reject' && !body.comment) {
      setActionLoading(false)
      return
    }

    const resp = await fetch(`/api/v1/reports/${params.id}/${type}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })

    setActionLoading(false)

    if (resp.ok) {
      await loadData()
      return
    }

    const errorData = await resp.json().catch(() => null)
    setError(errorData?.message || 'Дія не виконана')
  }

  const refreshAiSummary = async () => {
    if (!accessToken || !params?.id) return
    setSummaryLoading(true)
    const summaryResp = await fetch(`/api/v1/ai/reports/${params.id}/summary`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (summaryResp.ok) {
      const data = await summaryResp.json()
      setAiSummary(data)
      setSummaryLoading(false)
      return
    }
    setSummaryLoading(false)
    setError('Не вдалося згенерувати AI summary')
  }

  const generateManagerDraft = async () => {
    if (!accessToken || !params?.id) return
    setDraftLoading(true)
    setError('')
    const hasManualSelection = canAggregateBySources && aggregationSources.length > 0
    if (hasManualSelection && selectedSourceIds.length === 0) {
      setDraftLoading(false)
      setError('Оберіть хоча б одне джерело для склейки')
      return
    }
    const resp = await fetch(`/api/v1/reports/${params.id}/generate-manager-draft`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(
        hasManualSelection
          ? { sourceReportIds: selectedSourceIds }
          : {},
      ),
    })
    setDraftLoading(false)

    if (!resp.ok) {
      const errorData = await resp.json().catch(() => null)
      setError(errorData?.message || 'Не вдалося згенерувати AI-чернетку')
      return
    }

    await loadData()
  }

  const buildManagerDraftPayload = () => {
    if (!report) return null
    const existingContent = report.content || {}
    return {
      title: report.title,
      periodStart: report.periodStart,
      periodEnd: report.periodEnd,
        content: {
          ...existingContent,
          managerSubmission: {
            ...(existingContent.managerSubmission || {}),
            documentTitle: managerDraftTitle || 'ЗВІТ',
            headerLines: managerDraftHeaderLines,
            bodyText: managerDraftText,
            bodyTextPlain: managerDraftText,
            style: {
              fontFamily: 'Times New Roman',
              fontSize: 14,
          },
          editedByAuthor: true,
          editedAt: new Date().toISOString(),
        },
      },
    }
  }

  const saveManagerDraft = async (options?: { auto?: boolean }) => {
    if (!accessToken || !params?.id || !report) return
    if (options?.auto) {
      setAutoSaving(true)
    } else {
      setSavingDraft(true)
    }
    setError('')
    const payload = buildManagerDraftPayload()
    if (!payload) return

    const resp = await fetch(`/api/v1/reports/${params.id}`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })

    setSavingDraft(false)
    setAutoSaving(false)

    if (!resp.ok) {
      const errorData = await resp.json().catch(() => null)
      setError(errorData?.message || 'Не вдалося зберегти текст для погодження')
      return
    }
    setIsDirty(false)
    setLastSavedAt(new Date().toISOString())
    if (!options?.auto) {
      await loadData()
    }
  }

  useEffect(() => {
    if (!canEditSubmission || !isDirty) return
    const timeout = setTimeout(() => {
      saveManagerDraft({ auto: true })
    }, 1800)
    return () => clearTimeout(timeout)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [managerDraftText, managerDraftTitle, JSON.stringify(managerDraftHeaderLines), canEditSubmission, isDirty])

  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!isDirty) return
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [isDirty])

  useEffect(() => {
    loadAggregationSources()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params?.id, accessToken, canAggregateBySources])

  const addComment = async () => {
    if (!accessToken || !params?.id || !commentText.trim()) return
    setCommentSubmitting(true)
    const resp = await fetch(`/api/v1/reports/${params.id}/comments`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sectionKey: commentSection,
        sectionLabel: sectionSectionLabel(commentSection),
        text: commentText.trim(),
      }),
    })
    setCommentSubmitting(false)
    if (!resp.ok) {
      const errorData = await resp.json().catch(() => null)
      setError(errorData?.message || 'Не вдалося додати коментар')
      return
    }
    setCommentText('')
    await loadComments()
  }

  const resolveComment = async (commentId: string) => {
    if (!accessToken || !params?.id) return
    const resp = await fetch(`/api/v1/reports/${params.id}/comments/${commentId}/resolve`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    })
    if (resp.ok) {
      await loadComments()
    }
  }

  const uploadAttachment = async (file: File) => {
    if (!accessToken || !params?.id) return
    setUploadingAttachment(true)
    const contentBase64 = await fileToBase64(file)
    const resp = await fetch('/api/v1/attachments', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        entityType: 'report',
        reportId: params.id,
        fileName: file.name,
        mimeType: file.type || 'application/octet-stream',
        contentBase64,
      }),
    })
    setUploadingAttachment(false)
    if (resp.ok) await loadAttachments()
  }

  const deleteAttachment = async (id: string) => {
    if (!accessToken) return
    const resp = await fetch(`/api/v1/attachments/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (resp.ok) await loadAttachments()
  }

  const downloadAttachment = async (id: string, fileName: string) => {
    if (!accessToken) return
    const resp = await fetch(`/api/v1/attachments/${id}/download`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (!resp.ok) return
    const blob = await resp.blob()
    const url = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = fileName
    link.click()
    window.URL.revokeObjectURL(url)
  }

  const deleteReport = async () => {
    if (!accessToken || !params?.id) return
    const ok = window.confirm('Видалити цей звіт? Дію неможливо скасувати.')
    if (!ok) return

    setActionLoading(true)
    setError('')
    const resp = await fetch(`/api/v1/reports/${params.id}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    })
    setActionLoading(false)

    if (resp.ok) {
      router.push('/dashboard/reports')
      return
    }

    const errorData = await resp.json().catch(() => null)
    setError(errorData?.message || 'Не вдалося видалити звіт')
  }

  return (
    <DashboardLayout>
      <div className="max-w-5xl mx-auto space-y-6">
        {loading && <div className="rounded-xl border border-slate-200 bg-white px-4 py-6 text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">Завантаження...</div>}
        {!loading && error && <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-800 dark:bg-rose-950/30 dark:text-rose-300">{error}</div>}

        {!loading && report && (
          <>
            <div className="rounded-2xl border border-slate-200 bg-white p-6 space-y-4 dark:border-slate-700 dark:bg-slate-900">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h1 className="text-2xl font-semibold font-display">{report.title || 'Звіт без назви'}</h1>
                  <p className="text-slate-500 dark:text-slate-400 mt-1">{report.author?.firstName} {report.author?.lastName}</p>
                </div>
                <ReportStatusBadge status={report.status} />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-slate-500 dark:text-slate-400">Період</p>
                  <p className="font-medium">{new Date(report.periodStart).toLocaleDateString('uk-UA')} - {new Date(report.periodEnd).toLocaleDateString('uk-UA')}</p>
                </div>
                <div>
                  <p className="text-slate-500 dark:text-slate-400">Поточний погоджувач</p>
                  <p className="font-medium">{report.currentApprover ? `${report.currentApprover.firstName} ${report.currentApprover.lastName}` : '-'}</p>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                {report?.id && (
                  <Link href={`/dashboard/reports/${report.id}/print`} className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800">
                    Друк-версія
                  </Link>
                )}
                {canCreateAggregateDraft && (
                  <Link
                    href={`/dashboard/reports/new?mode=aggregate&periodStart=${encodeURIComponent(report.periodStart)}&periodEnd=${encodeURIComponent(report.periodEnd)}&reportType=${encodeURIComponent(report.reportType)}`}
                    className="rounded-lg border border-primary px-4 py-2 text-sm text-primary hover:bg-primary/10"
                  >
                    {aggregateCreateLabel}
                  </Link>
                )}
                {canEditSubmission && (
                  <button disabled={draftLoading} onClick={generateManagerDraft} className="rounded-lg border border-primary px-4 py-2 text-sm text-primary disabled:opacity-60">
                    {draftLoading ? 'Генерація чернетки...' : 'Згенерувати AI-чернетку'}
                  </button>
                )}
                {canSubmit && (
                  <button disabled={actionLoading} onClick={() => doAction('submit')} className="rounded-lg bg-primary px-4 py-2 text-sm text-white disabled:opacity-60">{submitButtonLabel}</button>
                )}
                {canApprove && (
                  <button disabled={actionLoading} onClick={() => doAction('approve')} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm text-white disabled:opacity-60">Погодити</button>
                )}
                {canApprove && (
                  <button disabled={actionLoading} onClick={() => doAction('reject')} className="rounded-lg bg-rose-600 px-4 py-2 text-sm text-white disabled:opacity-60">Відхилити</button>
                )}
                {canDelete && (
                  <button disabled={actionLoading} onClick={deleteReport} className="rounded-lg border border-rose-300 px-4 py-2 text-sm text-rose-700 hover:bg-rose-50 disabled:opacity-60 dark:border-rose-700 dark:text-rose-300 dark:hover:bg-rose-950/30">
                    Видалити звіт
                  </button>
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-6 space-y-3 dark:border-slate-700 dark:bg-slate-900">
              {canCreateAggregateDraft && (
                <div className="rounded-lg border border-primary/30 bg-primary/5 px-4 py-3 text-sm text-slate-700 dark:text-slate-200">
                  {aggregateDraftHint}
                </div>
              )}
              {canEditSubmission && (
                <div className="rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-800 dark:border-sky-900/60 dark:bg-sky-950/30 dark:text-sky-200">
                  {draftHint}
                </div>
              )}
              {canAggregateBySources && (
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 space-y-3 dark:border-slate-700 dark:bg-slate-800/60">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Джерела для AI-склейки</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Обрано: {selectedSourceIds.length} з {aggregationSources.length}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setSelectedSourceIds((prev) =>
                          Array.from(new Set([...prev, ...filteredAggregationSources.map((item) => item.reportId)])),
                        )
                      }
                      className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700"
                    >
                      Обрати всі (за фільтром)
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedSourceIds([])}
                      className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700"
                    >
                      Очистити вибір
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setSourceStatusFilter('all')
                        setSourceDepartmentFilter('all')
                        setSourceAuthorFilter('all')
                      }}
                      className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700"
                    >
                      Скинути фільтри
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                    <select
                      value={sourceStatusFilter}
                      onChange={(e) => setSourceStatusFilter(e.target.value as 'all' | 'approved' | 'pending')}
                      className="rounded-md border border-slate-300 px-2 py-1.5 text-xs bg-white text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                    >
                      <option value="all">Усі статуси</option>
                      <option value="approved">Лише погоджені</option>
                      <option value="pending">Лише в роботі/на погодженні</option>
                    </select>
                    <select
                      value={sourceDepartmentFilter}
                      onChange={(e) => setSourceDepartmentFilter(e.target.value)}
                      className="rounded-md border border-slate-300 px-2 py-1.5 text-xs bg-white text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                    >
                      <option value="all">Усі відділи</option>
                      {sourceDepartmentOptions.map((item) => (
                        <option key={item.id} value={item.id}>{item.name}</option>
                      ))}
                    </select>
                    <select
                      value={sourceAuthorFilter}
                      onChange={(e) => setSourceAuthorFilter(e.target.value)}
                      className="rounded-md border border-slate-300 px-2 py-1.5 text-xs bg-white text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                    >
                      <option value="all">Усі автори</option>
                      {sourceAuthorOptions.map((item) => (
                        <option key={item.id} value={item.id}>{item.name}</option>
                      ))}
                    </select>
                  </div>

                  {aggregationSourcesLoading && (
                    <p className="text-xs text-slate-500 dark:text-slate-400">Завантаження джерел...</p>
                  )}
                  {!aggregationSourcesLoading && aggregationSources.length === 0 && (
                    <p className="text-xs text-slate-500 dark:text-slate-400">Джерел для обраного періоду не знайдено.</p>
                  )}
                  {!aggregationSourcesLoading && filteredAggregationSources.length > 0 && (
                    <div className="max-h-56 overflow-auto space-y-2">
                      {filteredAggregationSources.map((source) => (
                        <label
                          key={source.reportId}
                          className="flex items-start gap-2 rounded-md border border-slate-200 bg-white p-2 text-sm dark:border-slate-700 dark:bg-slate-900/70"
                        >
                          <input
                            type="checkbox"
                            checked={selectedSourceIds.includes(source.reportId)}
                            onChange={(e) => {
                              const checked = e.target.checked
                              setSelectedSourceIds((prev) =>
                                checked ? [...prev, source.reportId] : prev.filter((id) => id !== source.reportId),
                              )
                            }}
                          />
                          <span>
                            <span className="font-medium">{source.departmentName}</span>{' '}
                            <span className="text-slate-500 dark:text-slate-400">• {source.authorName}</span>
                            <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-600 dark:bg-slate-700 dark:text-slate-200">
                              {source.status}
                            </span>
                            <br />
                            <span className="text-xs text-slate-500 dark:text-slate-400">
                              {new Date(source.periodStart).toLocaleDateString('uk-UA')} - {new Date(source.periodEnd).toLocaleDateString('uk-UA')}
                            </span>
                          </span>
                        </label>
                      ))}
                    </div>
                  )}
                  {!aggregationSourcesLoading && aggregationSources.length > 0 && filteredAggregationSources.length === 0 && (
                    <p className="text-xs text-slate-500 dark:text-slate-400">За поточним фільтром джерел немає.</p>
                  )}
                </div>
              )}
              {canEditSubmission && (
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/60">
                  <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-2">Чек-лист перед відправкою</p>
                  <div className="space-y-1">
                    {checklist.map((item) => (
                      <p key={item.key} className={`text-sm ${item.ok ? 'text-emerald-700' : 'text-amber-700'}`}>
                        {item.ok ? '✓' : '•'} {item.label}
                      </p>
                    ))}
                  </div>
                </div>
              )}
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-lg font-semibold">Текст для погодження</h2>
                {managerDraftSource && (
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Джерело: {managerDraftSource === 'ai' ? 'AI' : managerDraftSource}
                  </p>
                )}
              </div>
              {!!report?.content?.managerSubmission?.sourceReportsCount && (
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Використано джерел: {report.content.managerSubmission.sourceReportsCount}; підрозділів: {report.content.managerSubmission.sourceDepartmentsCount || 0}
                </p>
              )}

              {managerDraftText ? (
                <div className="space-y-3">
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/60">
                    <p className="text-center font-semibold" style={{ fontFamily: 'Times New Roman', fontSize: 14 }}>
                      {managerDraftTitle || 'ЗВІТ'}
                    </p>
                    {managerDraftHeaderLines.map((line, idx) => (
                      <p key={`header-${idx}`} className="text-center" style={{ fontFamily: 'Times New Roman', fontSize: 14 }}>
                        {line}
                      </p>
                    ))}
                  </div>

                  {canEditSubmission ? (
                    <div className="space-y-2">
                      <textarea
                        value={managerDraftText}
                        onChange={(e) => {
                          setManagerDraftText(e.target.value)
                          setIsDirty(true)
                        }}
                        rows={28}
                        className="mx-auto block w-full max-w-[210mm] min-h-[297mm] rounded-md border border-input bg-white p-[14mm] text-sm text-slate-900 dark:bg-slate-800 dark:text-slate-100"
                        style={{ fontFamily: 'Times New Roman', fontSize: 14, lineHeight: 1.6 }}
                      />
                      <button
                        disabled={savingDraft}
                        onClick={() => saveManagerDraft()}
                        className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-60 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
                      >
                        {savingDraft ? 'Збереження...' : 'Зберегти текст для погодження'}
                      </button>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {autoSaving ? 'Автозбереження...' : isDirty ? 'Є незбережені зміни' : `Збережено: ${new Date(lastSavedAt || Date.now()).toLocaleTimeString('uk-UA')}`}
                      </p>
                    </div>
                  ) : (
                    <div className="rounded-lg border border-slate-200 bg-white p-4 whitespace-pre-wrap text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100" style={{ fontFamily: 'Times New Roman', fontSize: 14 }}>
                      {managerDraftText}
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Спочатку сформуйте AI-чернетку, перевірте текст і лише потім відправляйте на погодження.
                </p>
              )}
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-6 space-y-3 dark:border-slate-700 dark:bg-slate-900">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-lg font-semibold">AI summary</h2>
                <button
                  disabled={summaryLoading}
                  onClick={refreshAiSummary}
                  className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-60 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  {summaryLoading ? 'Генерація...' : 'Оновити AI'}
                </button>
              </div>
              {aiSummary ? (
                <>
                  <p className="text-sm text-slate-700 dark:text-slate-200">{aiSummary.summary}</p>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                    <Block title="Highlights" items={aiSummary.highlights || []} />
                    <Block title="Risks" items={aiSummary.risks || []} />
                    <Block title="Next" items={aiSummary.nextSteps || []} />
                  </div>
                </>
              ) : (
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  AI summary недоступний, але звіт можна погоджувати без нього.
                </p>
              )}
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-6 space-y-4 dark:border-slate-700 dark:bg-slate-900">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">Коментарі по секціях</h2>
                {commentsLoading && <p className="text-xs text-slate-500 dark:text-slate-400">Оновлення...</p>}
              </div>

              {canComment && (
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-2 dark:border-slate-700 dark:bg-slate-800/60">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                    <select
                      value={commentSection}
                      onChange={(e) => setCommentSection(e.target.value)}
                      className="rounded-md border border-input bg-white px-2 py-2 text-sm text-slate-900 dark:bg-slate-800 dark:text-slate-100"
                    >
                      <option value="workDone">Виконана робота</option>
                      <option value="achievements">Досягнення</option>
                      <option value="problems">Проблеми</option>
                      <option value="nextWeekPlan">План</option>
                      <option value="managerSubmission">Текст для погодження</option>
                    </select>
                    <textarea
                      value={commentText}
                      onChange={(e) => setCommentText(e.target.value)}
                      rows={2}
                      className="md:col-span-2 rounded-md border border-input bg-white px-3 py-2 text-sm text-slate-900 dark:bg-slate-800 dark:text-slate-100"
                      placeholder="Зауваження до конкретної секції..."
                    />
                  </div>
                  <button
                    onClick={addComment}
                    disabled={commentSubmitting}
                    className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-100 disabled:opacity-60 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    {commentSubmitting ? 'Додавання...' : 'Додати коментар'}
                  </button>
                </div>
              )}

              {comments.length === 0 && <p className="text-sm text-slate-500 dark:text-slate-400">Коментарів поки немає.</p>}
              {comments.map((item) => (
                <div key={item.id} className={`rounded-lg border p-3 ${item.status === 'resolved' ? 'border-emerald-200 bg-emerald-50/40 dark:border-emerald-800 dark:bg-emerald-950/20' : 'border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800/70'}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{item.sectionLabel || item.sectionKey}</p>
                      <p className="text-sm text-slate-700 dark:text-slate-200 mt-1">{item.text}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
                        {item.createdByName} · {new Date(item.createdAt).toLocaleString('uk-UA')}
                      </p>
                    </div>
                    {item.status !== 'resolved' && canComment && (
                      <button onClick={() => resolveComment(item.id)} className="text-xs text-emerald-700 hover:underline">
                        Закрити
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-6 space-y-4 dark:border-slate-700 dark:bg-slate-900">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-lg font-semibold">Зміни між версіями</h2>
                <button
                  onClick={() => loadVersionDiff(fromVersion, toVersion)}
                  className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  Оновити
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-2 text-sm">
                <label>Від</label>
                <input
                  type="number"
                  min={1}
                  max={Math.max(1, report.version || 1)}
                  value={fromVersion}
                  onChange={(e) => setFromVersion(Number(e.target.value) || 1)}
                  className="w-24 rounded-md border border-input px-2 py-1 bg-white text-slate-900 dark:bg-slate-800 dark:text-slate-100"
                />
                <label>До</label>
                <input
                  type="number"
                  min={1}
                  max={Math.max(1, report.version || 1)}
                  value={toVersion}
                  onChange={(e) => setToVersion(Number(e.target.value) || 1)}
                  className="w-24 rounded-md border border-input px-2 py-1 bg-white text-slate-900 dark:bg-slate-800 dark:text-slate-100"
                />
                {versionDiffLoading && <span className="text-xs text-slate-500 dark:text-slate-400">Порівняння...</span>}
              </div>

              {versionDiff?.changedFields?.length ? (
                <div className="space-y-3">
                  {versionDiff.changedFields.slice(0, 8).map((change: any) => (
                    <div key={change.key} className="rounded-lg border border-slate-200 p-3 dark:border-slate-700 dark:bg-slate-800/70">
                      <p className="text-sm font-medium">{change.key}</p>
                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Було:</p>
                      <p className="text-sm text-slate-700 dark:text-slate-200 whitespace-pre-wrap">{change.from || '—'}</p>
                      <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">Стало:</p>
                      <p className="text-sm text-slate-900 dark:text-slate-100 whitespace-pre-wrap">{change.to || '—'}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-slate-500 dark:text-slate-400">Суттєвих змін між вибраними версіями не знайдено.</p>
              )}
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-6 space-y-3 dark:border-slate-700 dark:bg-slate-900">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-lg font-semibold">Вкладення до звіту</h2>
                <label className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 cursor-pointer dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800">
                  {uploadingAttachment ? 'Завантаження...' : 'Додати файл'}
                  <input
                    type="file"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      if (file) uploadAttachment(file)
                      e.currentTarget.value = ''
                    }}
                  />
                </label>
              </div>
              {attachmentsLoading && <p className="text-sm text-slate-500 dark:text-slate-400">Завантаження...</p>}
              {!attachmentsLoading && attachments.length === 0 && <p className="text-sm text-slate-500 dark:text-slate-400">Файлів поки немає.</p>}
              {attachments.map((item) => (
                <div key={item.id} className="rounded-lg border border-slate-200 p-3 flex items-center justify-between gap-3 dark:border-slate-700 dark:bg-slate-800/70">
                  <div>
                    <p className="text-sm font-medium">{item.fileName}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{Math.round((item.fileSize || 0) / 1024)} KB · {new Date(item.createdAt).toLocaleString('uk-UA')}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => downloadAttachment(item.id, item.fileName)}
                      className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-700 dark:border-slate-600 dark:text-slate-200"
                    >
                      Завантажити
                    </button>
                    <button onClick={() => deleteAttachment(item.id)} className="rounded border border-rose-300 px-2 py-1 text-xs text-rose-700">
                      Видалити
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </DashboardLayout>
  )
}

async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = String(reader.result || '')
      resolve(result.replace(/^data:.*;base64,/, ''))
    }
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

function sectionSectionLabel(sectionKey: string): string {
  if (sectionKey === 'workDone') return 'Виконана робота'
  if (sectionKey === 'achievements') return 'Досягнення'
  if (sectionKey === 'problems') return 'Проблеми'
  if (sectionKey === 'nextWeekPlan') return 'План'
  if (sectionKey === 'managerSubmission') return 'Текст для погодження'
  return sectionKey
}

function Block({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-lg border border-slate-200 p-3">
      <p className="font-medium text-slate-900 mb-2">{title}</p>
      {items.length === 0 && <p className="text-slate-400">-</p>}
      {items.map((item, i) => <p key={`${title}-${i}`} className="text-slate-700">• {item}</p>)}
    </div>
  )
}
