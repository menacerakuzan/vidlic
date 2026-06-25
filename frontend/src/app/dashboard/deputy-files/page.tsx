'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { DashboardLayout } from '@/components/dashboard-layout'
import { useAuthStore } from '@/store/auth-store'
import { useRouter } from 'next/navigation'

// ── Types ──────────────────────────────────────────────────────────────────────

type Department = {
  id: string
  name: string
  nameUk: string
  parentId: string | null
}

type TeamMember = {
  id: string
  firstName: string
  lastName: string
  patronymic?: string
  role: string
  position?: { titleUk?: string; title?: string }
  department?: { id: string; nameUk: string }
}

type DeputyFile = {
  id: string
  entityType: 'department' | 'user'
  entityId: string
  fileName: string
  mimeType: string
  fileSize: number
  notes: string | null
  reminderAt: string | null
  createdAt: string
  updatedAt: string
}

type Reminder = {
  id: string
  fileName: string
  entityType: string
  entityId: string
  notes: string | null
  reminderAt: string
}

type ViewerFile = DeputyFile & { blobUrl?: string }

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatBytes(n: number) {
  if (n < 1024) return `${n} Б`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} КБ`
  return `${(n / (1024 * 1024)).toFixed(1)} МБ`
}

function formatDate(s: string) {
  return new Date(s).toLocaleDateString('uk-UA', { day: '2-digit', month: 'short', year: 'numeric' })
}

function fileIcon(mimeType: string) {
  if (mimeType.startsWith('image/')) return '🖼'
  if (mimeType.startsWith('video/')) return '🎬'
  if (mimeType === 'application/pdf') return '📄'
  if (mimeType.includes('word') || mimeType.includes('document')) return '📝'
  if (mimeType.includes('sheet') || mimeType.includes('excel')) return '📊'
  return '📎'
}

function isViewableInBrowser(mimeType: string) {
  return (
    mimeType.startsWith('image/') ||
    mimeType.startsWith('video/') ||
    mimeType === 'application/pdf'
  )
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function DeputyFilesPage() {
  const { user } = useAuthStore()
  const router = useRouter()
  const token = typeof window !== 'undefined' ? localStorage.getItem('vidlik-accessToken') : null

  const [departments, setDepartments] = useState<Department[]>([])
  const [teamMap, setTeamMap] = useState<Record<string, TeamMember[]>>({})
  const [filesMap, setFilesMap] = useState<Record<string, DeputyFile[]>>({})
  const [reminders, setReminders] = useState<Reminder[]>([])
  const [expandedDepts, setExpandedDepts] = useState<Set<string>>(new Set())
  const [selectedEntity, setSelectedEntity] = useState<{ type: 'department' | 'user'; id: string; label: string } | null>(null)
  const [uploading, setUploading] = useState(false)
  const [viewer, setViewer] = useState<ViewerFile | null>(null)
  const [editingNote, setEditingNote] = useState<DeputyFile | null>(null)
  const [noteText, setNoteText] = useState('')
  const [reminderValue, setReminderValue] = useState('')
  const [savingNote, setSavingNote] = useState(false)
  const [toast, setToast] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null)
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [dragging, setDragging] = useState(false)
  const dragStart = useRef({ mx: 0, my: 0, px: 0, py: 0 })
  const fileInputRef = useRef<HTMLInputElement>(null)

  // ── Access guard ─────────────────────────────────────────────────────────────

  useEffect(() => {
    if (user && user.role !== 'deputy_head') {
      router.replace('/dashboard')
    }
  }, [user, router])

  // ── Load departments ──────────────────────────────────────────────────────────

  useEffect(() => {
    if (!token) return
    fetch('/api/v1/departments', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(data => setDepartments(Array.isArray(data) ? data : data.data || []))
      .catch(() => {})
    fetch('/api/v1/deputy-files/reminders', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(data => setReminders(Array.isArray(data) ? data : []))
      .catch(() => {})
  }, [token])

  const loadFiles = useCallback(async (entityType: 'department' | 'user', entityId: string) => {
    if (!token) return
    const key = `${entityType}:${entityId}`
    const r = await fetch(`/api/v1/deputy-files?entityType=${entityType}&entityId=${entityId}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    const data = await r.json()
    setFilesMap(prev => ({ ...prev, [key]: Array.isArray(data) ? data : [] }))
  }, [token])

  const loadTeam = useCallback(async (deptId: string) => {
    if (!token || teamMap[deptId]) return
    const r = await fetch(`/api/v1/departments/${deptId}/team`, { headers: { Authorization: `Bearer ${token}` } })
    const data = await r.json()
    const members: TeamMember[] = Array.isArray(data?.members) ? data.members : []
    setTeamMap(prev => ({ ...prev, [deptId]: members }))
  }, [token, teamMap])

  const selectEntity = useCallback(async (type: 'department' | 'user', id: string, label: string) => {
    setSelectedEntity({ type, id, label })
    await loadFiles(type, id)
  }, [loadFiles])

  const toggleDept = useCallback(async (deptId: string) => {
    setExpandedDepts(prev => {
      const next = new Set(prev)
      if (next.has(deptId)) { next.delete(deptId) } else { next.add(deptId) }
      return next
    })
    await loadTeam(deptId)
  }, [loadTeam])

  // ── File operations ───────────────────────────────────────────────────────────

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!selectedEntity || !token) return
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    const reader = new FileReader()
    reader.onload = async () => {
      const contentBase64 = (reader.result as string)
      const r = await fetch('/api/v1/deputy-files', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entityType: selectedEntity.type,
          entityId: selectedEntity.id,
          fileName: file.name,
          mimeType: file.type || 'application/octet-stream',
          contentBase64,
        }),
      })
      setUploading(false)
      if (r.ok) {
        showToast('ok', 'Файл завантажено')
        await loadFiles(selectedEntity.type, selectedEntity.id)
      } else {
        showToast('err', 'Помилка завантаження')
      }
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  const openViewer = async (file: DeputyFile) => {
    if (!isViewableInBrowser(file.mimeType) || !token) {
      // For non-viewable files, trigger download
      const r = await fetch(`/api/v1/deputy-files/${file.id}/content`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const blob = await r.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = file.fileName
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 5000)
      return
    }
    setZoom(1)
    setPan({ x: 0, y: 0 })
    setViewer({ ...file })
    // fetch blob
    const r = await fetch(`/api/v1/deputy-files/${file.id}/content`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    const blob = await r.blob()
    const blobUrl = URL.createObjectURL(blob)
    setViewer(v => v ? { ...v, blobUrl } : null)
  }

  const closeViewer = () => {
    if (viewer?.blobUrl) URL.revokeObjectURL(viewer.blobUrl)
    setViewer(null)
  }

  const handleDelete = async (id: string) => {
    if (!token || !selectedEntity) return
    const r = await fetch(`/api/v1/deputy-files/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    })
    if (r.ok) {
      showToast('ok', 'Файл видалено')
      await loadFiles(selectedEntity.type, selectedEntity.id)
    } else {
      showToast('err', 'Помилка видалення')
    }
  }

  const openNoteEditor = (file: DeputyFile) => {
    setEditingNote(file)
    setNoteText(file.notes || '')
    setReminderValue(file.reminderAt ? file.reminderAt.slice(0, 16) : '')
  }

  const saveNote = async () => {
    if (!editingNote || !token) return
    setSavingNote(true)
    const r = await fetch(`/api/v1/deputy-files/${editingNote.id}/notes`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ notes: noteText || null, reminderAt: reminderValue || null }),
    })
    setSavingNote(false)
    if (r.ok) {
      showToast('ok', 'Нотатку збережено')
      setEditingNote(null)
      if (selectedEntity) await loadFiles(selectedEntity.type, selectedEntity.id)
    } else {
      showToast('err', 'Помилка збереження')
    }
  }

  const handlePrint = () => {
    if (!viewer?.blobUrl) return
    const w = window.open(viewer.blobUrl, '_blank')
    w?.print()
  }

  // ── Viewer pan ────────────────────────────────────────────────────────────────

  const onMouseDown = (e: React.MouseEvent) => {
    if (viewer?.mimeType === 'application/pdf') return
    setDragging(true)
    dragStart.current = { mx: e.clientX, my: e.clientY, px: pan.x, py: pan.y }
  }

  const onMouseMove = (e: React.MouseEvent) => {
    if (!dragging) return
    setPan({
      x: dragStart.current.px + e.clientX - dragStart.current.mx,
      y: dragStart.current.py + e.clientY - dragStart.current.my,
    })
  }

  const onMouseUp = () => setDragging(false)

  // ── Toast ─────────────────────────────────────────────────────────────────────

  const showToast = (type: 'ok' | 'err', msg: string) => {
    setToast({ type, msg })
    setTimeout(() => setToast(null), 3000)
  }

  // ── Derived ───────────────────────────────────────────────────────────────────

  const rootDepts = departments.filter(d => !d.parentId)
  const childMap = departments.reduce<Record<string, Department[]>>((acc, d) => {
    if (d.parentId) { acc[d.parentId] = [...(acc[d.parentId] || []), d] }
    return acc
  }, {})

  const currentFiles = selectedEntity
    ? (filesMap[`${selectedEntity.type}:${selectedEntity.id}`] || [])
    : []

  if (user?.role !== 'deputy_head') return null

  return (
    <DashboardLayout>
      <div className="flex h-[calc(100vh-64px)] overflow-hidden">

        {/* ── Sidebar ── */}
        <aside className="w-72 shrink-0 border-r border-border bg-card flex flex-col overflow-hidden">
          <div className="p-4 border-b border-border">
            <h2 className="text-sm font-semibold text-foreground">Файловий менеджер</h2>
            <p className="text-[11px] text-muted-foreground mt-0.5">Приватно · тільки ви</p>
          </div>

          {reminders.length > 0 && (
            <div className="px-3 py-2 border-b border-border bg-amber-50 dark:bg-amber-950/20">
              <p className="text-[11px] font-semibold text-amber-700 dark:text-amber-400 mb-1">
                Нагадування · {reminders.length}
              </p>
              {reminders.slice(0, 3).map(r => (
                <div key={r.id} className="text-[11px] text-amber-600 dark:text-amber-500 truncate">
                  {formatDate(r.reminderAt)} — {r.fileName}
                </div>
              ))}
            </div>
          )}

          <nav className="flex-1 overflow-y-auto p-2 space-y-0.5">
            {rootDepts.map(dept => (
              <div key={dept.id}>
                {/* Root dept row */}
                <div className="flex items-center">
                  <button
                    onClick={() => toggleDept(dept.id)}
                    className="w-5 h-5 flex items-center justify-center text-muted-foreground hover:text-foreground shrink-0"
                  >
                    <span className="text-[10px]">{expandedDepts.has(dept.id) ? '▼' : '▶'}</span>
                  </button>
                  <button
                    onClick={() => selectEntity('department', dept.id, dept.nameUk)}
                    className={`flex-1 text-left px-2 py-1.5 rounded-lg text-[13px] truncate transition-colors ${
                      selectedEntity?.id === dept.id && selectedEntity.type === 'department'
                        ? 'bg-primary/10 text-primary font-medium'
                        : 'text-foreground hover:bg-secondary'
                    }`}
                  >
                    🏛 {dept.nameUk}
                  </button>
                </div>

                {expandedDepts.has(dept.id) && (
                  <div className="ml-4 space-y-0.5 mt-0.5">
                    {/* Child depts */}
                    {(childMap[dept.id] || []).map(child => (
                      <div key={child.id}>
                        <div className="flex items-center">
                          <button
                            onClick={() => toggleDept(child.id)}
                            className="w-5 h-5 flex items-center justify-center text-muted-foreground hover:text-foreground shrink-0"
                          >
                            <span className="text-[10px]">{expandedDepts.has(child.id) ? '▼' : '▶'}</span>
                          </button>
                          <button
                            onClick={() => selectEntity('department', child.id, child.nameUk)}
                            className={`flex-1 text-left px-2 py-1.5 rounded-lg text-[12px] truncate transition-colors ${
                              selectedEntity?.id === child.id && selectedEntity.type === 'department'
                                ? 'bg-primary/10 text-primary font-medium'
                                : 'text-foreground/80 hover:bg-secondary'
                            }`}
                          >
                            📁 {child.nameUk}
                          </button>
                        </div>

                        {expandedDepts.has(child.id) && (
                          <div className="ml-4 space-y-0.5 mt-0.5">
                            {(teamMap[child.id] || []).map(member => (
                              <button
                                key={member.id}
                                onClick={() => selectEntity('user', member.id, `${member.lastName} ${member.firstName}`)}
                                className={`w-full text-left px-2 py-1.5 rounded-lg text-[11px] truncate transition-colors ${
                                  selectedEntity?.id === member.id && selectedEntity.type === 'user'
                                    ? 'bg-primary/10 text-primary font-medium'
                                    : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
                                }`}
                              >
                                👤 {member.lastName} {member.firstName}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}

                    {/* Root dept members */}
                    {(teamMap[dept.id] || []).map(member => (
                      <button
                        key={member.id}
                        onClick={() => selectEntity('user', member.id, `${member.lastName} ${member.firstName}`)}
                        className={`w-full text-left px-2 py-1.5 rounded-lg text-[12px] truncate transition-colors ${
                          selectedEntity?.id === member.id && selectedEntity.type === 'user'
                            ? 'bg-primary/10 text-primary font-medium'
                            : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
                        }`}
                      >
                        👤 {member.lastName} {member.firstName}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </nav>
        </aside>

        {/* ── Main panel ── */}
        <main className="flex-1 flex flex-col overflow-hidden bg-background">
          {selectedEntity ? (
            <>
              {/* Header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-card">
                <div>
                  <h1 className="text-base font-semibold text-foreground truncate max-w-lg">
                    {selectedEntity.type === 'department' ? '📁' : '👤'} {selectedEntity.label}
                  </h1>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    {currentFiles.length} {currentFiles.length === 1 ? 'файл' : 'файлів'}
                  </p>
                </div>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-white disabled:opacity-60 hover:bg-primary/90 transition-colors"
                >
                  {uploading ? (
                    <span className="animate-spin">↻</span>
                  ) : (
                    <span>+ Завантажити файл</span>
                  )}
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.gif,.webp,.mp4,.mov,.avi,.mkv,.webm"
                  onChange={handleUpload}
                />
              </div>

              {/* File grid */}
              <div className="flex-1 overflow-y-auto p-6">
                {currentFiles.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-center">
                    <div className="text-5xl mb-3 opacity-30">📂</div>
                    <p className="text-sm text-muted-foreground">Файлів немає</p>
                    <p className="text-xs text-muted-foreground mt-1">Натисніть "Завантажити файл" щоб додати</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                    {currentFiles.map(file => (
                      <FileCard
                        key={file.id}
                        file={file}
                        onOpen={() => openViewer(file)}
                        onNote={() => openNoteEditor(file)}
                        onDelete={() => handleDelete(file.id)}
                      />
                    ))}
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
              <div className="text-6xl mb-4 opacity-20">🗂</div>
              <p className="text-base font-medium text-foreground/60">Оберіть управління, відділ або особу</p>
              <p className="text-sm text-muted-foreground mt-1">Файли видимі тільки вам</p>
            </div>
          )}
        </main>
      </div>

      {/* ── File Viewer Modal ── */}
      {viewer && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex flex-col"
          style={{ animation: 'fadeIn 0.18s ease' }}
        >
          {/* Viewer toolbar */}
          <div className="flex items-center justify-between px-4 py-2 bg-black/60 border-b border-white/10">
            <span className="text-white text-sm font-medium truncate max-w-sm">
              {fileIcon(viewer.mimeType)} {viewer.fileName}
            </span>
            <div className="flex items-center gap-2">
              {!viewer.mimeType.startsWith('video/') && viewer.mimeType !== 'application/pdf' && (
                <>
                  <ToolBtn onClick={() => setZoom(z => Math.max(0.25, z - 0.25))} title="Зменшити">−</ToolBtn>
                  <span className="text-white/60 text-xs w-10 text-center">{Math.round(zoom * 100)}%</span>
                  <ToolBtn onClick={() => setZoom(z => Math.min(5, z + 0.25))} title="Збільшити">+</ToolBtn>
                  <ToolBtn onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }) }} title="Скинути">⌂</ToolBtn>
                </>
              )}
              <ToolBtn onClick={handlePrint} title="Друк">🖨</ToolBtn>
              <button
                onClick={closeViewer}
                className="ml-2 w-8 h-8 flex items-center justify-center rounded-lg text-white/80 hover:text-white hover:bg-white/10 transition-colors text-lg"
                title="Закрити"
              >
                ✕
              </button>
            </div>
          </div>

          {/* Content area */}
          <div
            className="flex-1 overflow-hidden flex items-center justify-center"
            style={{ cursor: dragging ? 'grabbing' : (viewer.mimeType.startsWith('image/') ? 'grab' : 'default') }}
            onMouseDown={onMouseDown}
            onMouseMove={onMouseMove}
            onMouseUp={onMouseUp}
            onMouseLeave={onMouseUp}
          >
            {!viewer.blobUrl ? (
              <div className="flex flex-col items-center gap-3">
                <div className="w-10 h-10 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span className="text-white/50 text-sm">Завантаження…</span>
              </div>
            ) : viewer.mimeType.startsWith('image/') ? (
              <img
                src={viewer.blobUrl}
                alt={viewer.fileName}
                draggable={false}
                style={{
                  transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                  transformOrigin: 'center center',
                  transition: dragging ? 'none' : 'transform 0.15s ease',
                  maxWidth: '100%',
                  maxHeight: '100%',
                  objectFit: 'contain',
                  userSelect: 'none',
                }}
              />
            ) : viewer.mimeType.startsWith('video/') ? (
              <video
                src={viewer.blobUrl}
                controls
                autoPlay
                className="max-w-full max-h-full rounded-xl"
                style={{ maxHeight: 'calc(100vh - 100px)' }}
              />
            ) : viewer.mimeType === 'application/pdf' ? (
              <iframe
                src={viewer.blobUrl}
                title={viewer.fileName}
                className="w-full h-full"
                style={{ border: 'none' }}
              />
            ) : null}
          </div>

          {/* Notes strip */}
          {viewer.notes && (
            <div className="px-4 py-2 bg-black/60 border-t border-white/10">
              <p className="text-white/70 text-xs">📝 {viewer.notes}</p>
            </div>
          )}
        </div>
      )}

      {/* ── Note editor modal ── */}
      {editingNote && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" style={{ animation: 'fadeIn 0.15s ease' }}>
          <div className="w-full max-w-md rounded-2xl bg-card border border-border shadow-2xl p-6">
            <h3 className="text-base font-semibold text-foreground mb-1">Нотатка</h3>
            <p className="text-xs text-muted-foreground mb-4 truncate">{editingNote.fileName}</p>

            <textarea
              value={noteText}
              onChange={e => setNoteText(e.target.value)}
              placeholder="Ваш коментар, нотатка, нагадування…"
              rows={5}
              className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground resize-none focus:outline-none focus:ring-2 focus:ring-primary/30"
            />

            <div className="mt-3">
              <label className="text-xs text-muted-foreground mb-1 block">Нагадати (дата і час)</label>
              <input
                type="datetime-local"
                value={reminderValue}
                onChange={e => setReminderValue(e.target.value)}
                className="rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>

            <div className="flex gap-2 mt-5">
              <button
                onClick={saveNote}
                disabled={savingNote}
                className="flex-1 rounded-xl bg-primary py-2.5 text-sm font-medium text-white disabled:opacity-60"
              >
                {savingNote ? 'Збереження…' : 'Зберегти'}
              </button>
              <button
                onClick={() => setEditingNote(null)}
                className="px-4 rounded-xl border border-border text-sm text-foreground hover:bg-secondary transition-colors"
              >
                Скасувати
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Toast ── */}
      {toast && (
        <div
          className={`fixed bottom-6 right-6 z-[60] rounded-xl px-4 py-3 text-sm font-medium shadow-lg transition-all ${
            toast.type === 'ok'
              ? 'bg-emerald-600 text-white'
              : 'bg-destructive text-white'
          }`}
          style={{ animation: 'slideUp 0.2s ease' }}
        >
          {toast.msg}
        </div>
      )}

      <style>{`
        @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
        @keyframes slideUp { from { opacity: 0; transform: translateY(12px) } to { opacity: 1; transform: translateY(0) } }
      `}</style>
    </DashboardLayout>
  )
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function FileCard({
  file,
  onOpen,
  onNote,
  onDelete,
}: {
  file: DeputyFile
  onOpen: () => void
  onNote: () => void
  onDelete: () => void
}) {
  const [confirm, setConfirm] = useState(false)

  return (
    <div className="group relative rounded-2xl border border-border bg-card hover:border-primary/40 hover:shadow-md transition-all duration-200 overflow-hidden">
      {/* Preview area */}
      <button
        onClick={onOpen}
        className="w-full aspect-square flex flex-col items-center justify-center bg-secondary/50 hover:bg-secondary transition-colors"
      >
        <span className="text-4xl">{fileIcon(file.mimeType)}</span>
        {file.notes && (
          <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-amber-400" title="Є нотатка" />
        )}
        {file.reminderAt && new Date(file.reminderAt) > new Date() && (
          <span className="absolute top-2 left-2 w-2 h-2 rounded-full bg-primary" title="Є нагадування" />
        )}
      </button>

      {/* Info */}
      <div className="px-3 py-2.5">
        <p className="text-xs font-medium text-foreground truncate" title={file.fileName}>
          {file.fileName}
        </p>
        <p className="text-[10px] text-muted-foreground mt-0.5">
          {formatBytes(file.fileSize)} · {formatDate(file.createdAt)}
        </p>
        {file.reminderAt && (
          <p className="text-[10px] text-primary mt-0.5">⏰ {formatDate(file.reminderAt)}</p>
        )}
      </div>

      {/* Action bar */}
      <div className="flex border-t border-border">
        <button
          onClick={onNote}
          className="flex-1 py-1.5 text-[11px] text-muted-foreground hover:text-primary hover:bg-secondary transition-colors"
          title="Нотатка"
        >
          📝
        </button>
        <button
          onClick={onOpen}
          className="flex-1 py-1.5 text-[11px] text-muted-foreground hover:text-primary hover:bg-secondary transition-colors border-x border-border"
          title="Відкрити"
        >
          👁
        </button>
        {confirm ? (
          <button
            onClick={() => { setConfirm(false); onDelete() }}
            className="flex-1 py-1.5 text-[11px] text-destructive hover:bg-destructive/10 transition-colors font-medium"
          >
            Так
          </button>
        ) : (
          <button
            onClick={() => setConfirm(true)}
            className="flex-1 py-1.5 text-[11px] text-muted-foreground hover:text-destructive hover:bg-secondary transition-colors"
            title="Видалити"
          >
            🗑
          </button>
        )}
      </div>
    </div>
  )
}

function ToolBtn({ onClick, title, children }: { onClick: () => void; title: string; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="w-8 h-8 flex items-center justify-center rounded-lg text-white/80 hover:text-white hover:bg-white/10 transition-colors text-sm font-medium"
    >
      {children}
    </button>
  )
}
