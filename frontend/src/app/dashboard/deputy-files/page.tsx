'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { DashboardLayout } from '@/components/dashboard-layout'
import { useAuthStore } from '@/store/auth-store'
import { useRouter } from 'next/navigation'

// ── Types ──────────────────────────────────────────────────────────────────────

type Department = { id: string; name: string; nameUk: string; parentId: string | null; divisionTag?: string | null }

type TeamMember = {
  id: string; firstName: string; lastName: string; patronymic?: string
  role: string; position?: { titleUk?: string }
}

type DeputyFolder = {
  id: string; name: string; entityType: string; entityId: string; createdAt: string
}

type DeputyFile = {
  id: string; entityType: 'department' | 'user'; entityId: string
  folderId: string | null
  fileName: string; mimeType: string; fileSize: number
  notes: string | null; reminderAt: string | null
  tags: string[]; isPinned: boolean; archivedAt: string | null
  version: number; parentFileId: string | null
  createdAt: string; updatedAt: string
}

type ViewerFile = DeputyFile & { blobUrl?: string }

// ── Constants ──────────────────────────────────────────────────────────────────

const TAGS = ['Договір', 'Протокол', 'Наказ', 'Звіт', 'Особисте', 'Фото', 'Відео', 'Інше']
const TAG_COLORS: Record<string, string> = {
  'Договір': 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  'Протокол': 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
  'Наказ': 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  'Звіт': 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
  'Особисте': 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  'Фото': 'bg-pink-100 text-pink-700 dark:bg-pink-900/40 dark:text-pink-300',
  'Відео': 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300',
  'Інше': 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatBytes(n: number) {
  if (n < 1024) return `${n} Б`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} КБ`
  return `${(n / (1024 * 1024)).toFixed(1)} МБ`
}
function formatDate(s: string) {
  return new Date(s).toLocaleDateString('uk-UA', { day: '2-digit', month: 'short', year: 'numeric' })
}
function formatDatetime(s: string) {
  return new Date(s).toLocaleString('uk-UA', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}
function fileIcon(mimeType: string) {
  if (mimeType.startsWith('image/')) return '🖼'
  if (mimeType.startsWith('video/')) return '🎬'
  if (mimeType === 'application/pdf') return '📄'
  if (mimeType.includes('word') || mimeType.includes('document')) return '📝'
  if (mimeType.includes('sheet') || mimeType.includes('excel')) return '📊'
  return '📎'
}
function isViewable(mimeType: string) {
  return mimeType.startsWith('image/') || mimeType.startsWith('video/') || mimeType === 'application/pdf'
}

const thumbCache = new Map<string, string>()

// ── ImageThumb ─────────────────────────────────────────────────────────────────

function ImageThumb({ fileId, token }: { fileId: string; token: string }) {
  const [src, setSrc] = useState<string | null>(thumbCache.get(fileId) ?? null)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (src || !ref.current) return
    const obs = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return
      obs.disconnect()
      fetch(`/api/v1/deputy-files/${fileId}/thumbnail`, { headers: { Authorization: `Bearer ${token}` } })
        .then(r => r.ok ? r.blob() : null)
        .then(blob => {
          if (!blob || blob.size === 0) return
          const url = URL.createObjectURL(blob)
          thumbCache.set(fileId, url)
          setSrc(url)
        })
        .catch(() => {})
    })
    obs.observe(ref.current)
    return () => obs.disconnect()
  }, [fileId, token, src])

  return (
    <div ref={ref} className="w-full h-full flex items-center justify-center">
      {src
        ? <img src={src} alt="" className="w-full h-full object-cover" />
        : <span className="text-4xl">🖼</span>}
    </div>
  )
}

// ── Main ───────────────────────────────────────────────────────────────────────

export default function DeputyFilesPage() {
  const { user } = useAuthStore()
  const router = useRouter()

  // Token — read client-side only to avoid SSR null issue
  const [token, setToken] = useState<string | null>(null)
  useEffect(() => { setToken(localStorage.getItem('vidlik-accessToken')) }, [])

  // Navigation
  const [departments, setDepartments] = useState<Department[]>([])
  const [teamMap, setTeamMap] = useState<Record<string, TeamMember[]>>({})
  const [expandedDepts, setExpandedDepts] = useState<Set<string>>(new Set())
  const [selectedEntity, setSelectedEntity] = useState<{ type: 'department' | 'user'; id: string; label: string } | null>(null)

  // Files & folders
  const [filesMap, setFilesMap] = useState<Record<string, DeputyFile[]>>({})
  const [allFiles, setAllFiles] = useState<DeputyFile[]>([])
  const [folders, setFolders] = useState<DeputyFolder[]>([])
  const [selectedFolderId, setSelectedFolderId] = useState<string | null | undefined>(undefined) // undefined = no folder filter
  const [viewMode, setViewMode] = useState<'tree' | 'all'>('tree')

  // Filters
  const [searchQuery, setSearchQuery] = useState('')
  const [activeTag, setActiveTag] = useState<string | null>(null)
  const [sortBy, setSortBy] = useState<'date_desc' | 'date_asc' | 'name' | 'size'>('date_desc')
  const [showArchived, setShowArchived] = useState(false)

  // Upload staging (selected file waits for modal)
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [pendingParentId, setPendingParentId] = useState<string | null>(null)
  const [uploadMeta, setUploadMeta] = useState({ fileName: '', tags: [] as string[], notes: '', reminderAt: '', folderId: '' })
  const [uploading, setUploading] = useState(false)
  const [isDragOver, setIsDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const versionInputRef = useRef<HTMLInputElement>(null)

  // Folder management
  const [newFolderName, setNewFolderName] = useState('')
  const [creatingFolder, setCreatingFolder] = useState(false)
  const [renamingFolderId, setRenamingFolderId] = useState<string | null>(null)
  const [renameFolderName, setRenameFolderName] = useState('')

  // File rename
  const [renamingFileId, setRenamingFileId] = useState<string | null>(null)
  const [renameFileName, setRenameFileName] = useState('')

  // Viewer
  const [viewer, setViewer] = useState<ViewerFile | null>(null)
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [dragging, setDragging] = useState(false)
  const dragStart = useRef({ mx: 0, my: 0, px: 0, py: 0 })
  const [viewerNotes, setViewerNotes] = useState('')
  const [viewerReminder, setViewerReminder] = useState('')
  const [viewerTags, setViewerTags] = useState<string[]>([])
  const [savingViewerNote, setSavingViewerNote] = useState(false)
  const [notePanelOpen, setNotePanelOpen] = useState(true)

  // Modals
  const [remindersModal, setRemindersModal] = useState(false)
  const [reminders, setReminders] = useState<DeputyFile[]>([])
  const [versionsModal, setVersionsModal] = useState<DeputyFile | null>(null)
  const [versions, setVersions] = useState<DeputyFile[]>([])
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [versionTargetId, setVersionTargetId] = useState<string | null>(null)

  const [toast, setToast] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null)

  // ── Access guard ─────────────────────────────────────────────────────────────

  useEffect(() => {
    if (user && user.role !== 'deputy_head') router.replace('/dashboard')
  }, [user, router])

  // ── Data loading ──────────────────────────────────────────────────────────────

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
    let url = `/api/v1/deputy-files?entityType=${entityType}&entityId=${entityId}`
    if (showArchived) url += '&archived=true'
    if (selectedFolderId !== undefined) url += `&folderId=${selectedFolderId === null ? 'null' : selectedFolderId}`
    const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
    const data = await r.json()
    setFilesMap(prev => ({ ...prev, [key]: Array.isArray(data) ? data : [] }))
  }, [token, showArchived, selectedFolderId])

  const loadFolders = useCallback(async (entityType: string, entityId: string) => {
    if (!token) return
    const r = await fetch(`/api/v1/deputy-files/folders?entityType=${entityType}&entityId=${entityId}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    const data = await r.json()
    setFolders(Array.isArray(data) ? data : [])
  }, [token])

  const loadAllFiles = useCallback(async () => {
    if (!token) return
    const url = '/api/v1/deputy-files' + (showArchived ? '?archived=true' : '')
    const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
    const data = await r.json()
    setAllFiles(Array.isArray(data) ? data : [])
  }, [token, showArchived])

  const loadReminders = useCallback(async () => {
    if (!token) return
    const r = await fetch('/api/v1/deputy-files/reminders', { headers: { Authorization: `Bearer ${token}` } })
    const data = await r.json()
    setReminders(Array.isArray(data) ? data : [])
  }, [token])

  useEffect(() => {
    if (viewMode === 'all' && token) loadAllFiles()
  }, [viewMode, loadAllFiles, showArchived, token])

  const loadTeam = useCallback(async (deptId: string) => {
    if (!token || teamMap[deptId] !== undefined) return
    const r = await fetch(`/api/v1/departments/${deptId}/team`, { headers: { Authorization: `Bearer ${token}` } })
    const data = await r.json()
    const members: TeamMember[] = Array.isArray(data) ? data : Array.isArray(data?.members) ? data.members : []
    setTeamMap(prev => ({ ...prev, [deptId]: members }))
  }, [token, teamMap])

  const selectEntity = useCallback(async (type: 'department' | 'user', id: string, label: string) => {
    setSelectedEntity({ type, id, label })
    setSelectedFolderId(undefined)
    await Promise.all([loadFiles(type, id), loadFolders(type, id)])
  }, [loadFiles, loadFolders])

  const toggleDept = useCallback(async (deptId: string) => {
    setExpandedDepts(prev => {
      const next = new Set(prev)
      next.has(deptId) ? next.delete(deptId) : next.add(deptId)
      return next
    })
    await loadTeam(deptId)
  }, [loadTeam])

  const refreshCurrentView = useCallback(async () => {
    if (viewMode === 'all') await loadAllFiles()
    else if (selectedEntity) await loadFiles(selectedEntity.type, selectedEntity.id)
    await loadReminders()
  }, [viewMode, selectedEntity, loadAllFiles, loadFiles, loadReminders])

  // ── Upload flow ───────────────────────────────────────────────────────────────

  const stageFile = (file: File, parentFileId?: string) => {
    setPendingFile(file)
    setPendingParentId(parentFileId ?? null)
    setUploadMeta({
      fileName: file.name,
      tags: [],
      notes: '',
      reminderAt: '',
      folderId: (selectedFolderId as string) ?? '',
    })
  }

  const confirmUpload = async () => {
    if (!token || !pendingFile) return
    const entity = selectedEntity
    if (!entity) { showToast('err', 'Оберіть підрозділ або особу'); return }
    setUploading(true)
    const reader = new FileReader()
    reader.onload = async () => {
      const contentBase64 = reader.result as string
      let thumbnailBase64: string | undefined
      if (pendingFile.type.startsWith('image/')) thumbnailBase64 = await generateThumbnail(contentBase64)

      const r = await fetch('/api/v1/deputy-files', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entityType: entity.type,
          entityId: entity.id,
          folderId: uploadMeta.folderId || null,
          fileName: uploadMeta.fileName || pendingFile.name,
          mimeType: pendingFile.type || 'application/octet-stream',
          contentBase64,
          thumbnailBase64,
          notes: uploadMeta.notes || null,
          reminderAt: uploadMeta.reminderAt || null,
          tags: uploadMeta.tags,
          parentFileId: pendingParentId ?? null,
        }),
      })
      setUploading(false)
      setPendingFile(null)
      if (r.ok) {
        showToast('ok', pendingParentId ? 'Нова версія збережена' : 'Файл завантажено')
        await refreshCurrentView()
        if (versionsModal) setVersions(await loadVersionsData(versionsModal.id))
      } else {
        const err = await r.json().catch(() => null)
        const msg = err?.message
          ? (Array.isArray(err.message) ? err.message.join(', ') : err.message)
          : `Помилка завантаження (${r.status})`
        showToast('err', msg)
      }
    }
    reader.readAsDataURL(pendingFile)
  }

  const generateThumbnail = (dataUrl: string): Promise<string> =>
    new Promise(resolve => {
      const img = new Image()
      img.onload = () => {
        const MAX = 200
        const scale = Math.min(MAX / img.width, MAX / img.height)
        const canvas = document.createElement('canvas')
        canvas.width = img.width * scale; canvas.height = img.height * scale
        canvas.getContext('2d')?.drawImage(img, 0, 0, canvas.width, canvas.height)
        resolve(canvas.toDataURL('image/jpeg', 0.75))
      }
      img.onerror = () => resolve('')
      img.src = dataUrl
    })

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (file) stageFile(file); e.target.value = ''
  }
  const handleVersionInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file && versionTargetId) stageFile(file, versionTargetId)
    e.target.value = ''; setVersionTargetId(null)
  }
  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); setIsDragOver(true) }
  const handleDragLeave = () => setIsDragOver(false)
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); setIsDragOver(false)
    const file = e.dataTransfer.files[0]; if (file) stageFile(file)
  }

  // ── Folder actions ────────────────────────────────────────────────────────────

  const handleCreateFolder = async () => {
    if (!token || !selectedEntity || !newFolderName.trim()) return
    setCreatingFolder(false)
    const r = await fetch('/api/v1/deputy-files/folders', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ entityType: selectedEntity.type, entityId: selectedEntity.id, name: newFolderName.trim() }),
    })
    setNewFolderName('')
    if (r.ok) { showToast('ok', 'Папку створено'); await loadFolders(selectedEntity.type, selectedEntity.id) }
  }

  const handleRenameFolder = async (id: string) => {
    if (!token || !renameFolderName.trim()) return
    await fetch(`/api/v1/deputy-files/folders/${id}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: renameFolderName.trim() }),
    })
    setRenamingFolderId(null)
    if (selectedEntity) { showToast('ok', 'Папку перейменовано'); await loadFolders(selectedEntity.type, selectedEntity.id) }
  }

  const handleDeleteFolder = async (id: string) => {
    if (!token) return
    await fetch(`/api/v1/deputy-files/folders/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } })
    if (selectedFolderId === id) setSelectedFolderId(undefined)
    if (selectedEntity) await loadFolders(selectedEntity.type, selectedEntity.id)
    await refreshCurrentView()
  }

  // ── File actions ──────────────────────────────────────────────────────────────

  const openViewer = async (file: DeputyFile) => {
    if (!token) return
    if (!isViewable(file.mimeType)) {
      const r = await fetch(`/api/v1/deputy-files/${file.id}/content`, { headers: { Authorization: `Bearer ${token}` } })
      const blob = await r.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a'); a.href = url; a.download = file.fileName; a.click()
      setTimeout(() => URL.revokeObjectURL(url), 5000)
      return
    }
    setZoom(1); setPan({ x: 0, y: 0 })
    setViewerNotes(file.notes || ''); setViewerReminder(file.reminderAt ? file.reminderAt.slice(0, 16) : '')
    setViewerTags(file.tags || []); setViewer({ ...file })
    const r = await fetch(`/api/v1/deputy-files/${file.id}/content`, { headers: { Authorization: `Bearer ${token}` } })
    const blob = await r.blob()
    setViewer(v => v ? { ...v, blobUrl: URL.createObjectURL(blob) } : null)
  }

  const closeViewer = () => { if (viewer?.blobUrl) URL.revokeObjectURL(viewer.blobUrl); setViewer(null) }

  const saveViewerNote = async () => {
    if (!viewer || !token) return
    setSavingViewerNote(true)
    const r = await fetch(`/api/v1/deputy-files/${viewer.id}/notes`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ notes: viewerNotes || null, reminderAt: viewerReminder || null, tags: viewerTags }),
    })
    setSavingViewerNote(false)
    if (r.ok) { const updated = await r.json(); setViewer(v => v ? { ...v, ...updated } : null); showToast('ok', 'Нотатку збережено'); await refreshCurrentView() }
  }

  const handleRenameFile = async () => {
    if (!token || !renamingFileId || !renameFileName.trim()) return
    const r = await fetch(`/api/v1/deputy-files/${renamingFileId}/rename`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileName: renameFileName.trim() }),
    })
    setRenamingFileId(null)
    if (r.ok) { showToast('ok', 'Перейменовано'); await refreshCurrentView() }
  }

  const toggleFilePin = async (id: string) => {
    if (!token) return
    await fetch(`/api/v1/deputy-files/${id}/pin`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } })
    await refreshCurrentView()
  }

  const toggleFileArchive = async (id: string) => {
    if (!token) return
    await fetch(`/api/v1/deputy-files/${id}/archive`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } })
    showToast('ok', 'Архів оновлено'); await refreshCurrentView()
  }

  const handleDelete = async (id: string) => {
    if (!token) return
    const r = await fetch(`/api/v1/deputy-files/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } })
    if (r.ok) { showToast('ok', 'Файл видалено'); setConfirmDeleteId(null); await refreshCurrentView() }
    else showToast('err', 'Помилка видалення')
  }

  const loadVersionsData = useCallback(async (id: string): Promise<DeputyFile[]> => {
    if (!token) return []
    const r = await fetch(`/api/v1/deputy-files/${id}/versions`, { headers: { Authorization: `Bearer ${token}` } })
    const data = await r.json()
    return Array.isArray(data) ? data : []
  }, [token])

  const openVersions = async (file: DeputyFile) => { setVersionsModal(file); setVersions(await loadVersionsData(file.id)) }
  const handlePrint = () => { if (viewer?.blobUrl) window.open(viewer.blobUrl, '_blank')?.print() }

  // ── Viewer pan / zoom ─────────────────────────────────────────────────────────

  const onMouseDown = (e: React.MouseEvent) => {
    if (!viewer?.mimeType.startsWith('image/')) return
    setDragging(true); dragStart.current = { mx: e.clientX, my: e.clientY, px: pan.x, py: pan.y }
  }
  const onMouseMove = (e: React.MouseEvent) => {
    if (!dragging) return
    setPan({ x: dragStart.current.px + e.clientX - dragStart.current.mx, y: dragStart.current.py + e.clientY - dragStart.current.my })
  }
  const onMouseUp = () => setDragging(false)
  const onWheelZoom = (e: React.WheelEvent) => {
    if (!viewer?.mimeType.startsWith('image/')) return
    e.preventDefault(); setZoom(z => Math.max(0.1, Math.min(8, z - e.deltaY * 0.001)))
  }

  const showToast = (type: 'ok' | 'err', msg: string) => {
    setToast({ type, msg }); setTimeout(() => setToast(null), 3000)
  }

  // ── Filter + sort ─────────────────────────────────────────────────────────────

  const applyFilters = (files: DeputyFile[]) => {
    let result = [...files]
    if (!showArchived) result = result.filter(f => !f.archivedAt)
    if (selectedFolderId !== undefined) result = result.filter(f => f.folderId === (selectedFolderId ?? null))
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      result = result.filter(f => f.fileName.toLowerCase().includes(q) || (f.notes || '').toLowerCase().includes(q))
    }
    if (activeTag) result = result.filter(f => f.tags?.includes(activeTag))
    switch (sortBy) {
      case 'date_asc': result.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()); break
      case 'name': result.sort((a, b) => a.fileName.localeCompare(b.fileName, 'uk')); break
      case 'size': result.sort((a, b) => b.fileSize - a.fileSize); break
      default: result.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    }
    return [...result.filter(f => f.isPinned), ...result.filter(f => !f.isPinned)]
  }

  // ── Derived ───────────────────────────────────────────────────────────────────

  const deptIds = new Set(departments.map(d => d.id))
  const childMap = departments.reduce<Record<string, Department[]>>((acc, d) => {
    if (d.parentId) acc[d.parentId] = [...(acc[d.parentId] || []), d]
    return acc
  }, {})
  const rootDepts = departments.filter(d => !d.parentId || !deptIds.has(d.parentId))

  const rawFiles = viewMode === 'all' ? allFiles : selectedEntity ? (filesMap[`${selectedEntity.type}:${selectedEntity.id}`] || []) : []
  const currentFiles = applyFilters(rawFiles)
  const upcomingReminders = reminders.filter(r => new Date(r.reminderAt!) > new Date())

  if (user?.role !== 'deputy_head') return null

  // Group children by divisionTag for управління display
  const groupByDivision = (children: Department[]): { tag: string | null; items: Department[] }[] => {
    const groups = new Map<string, Department[]>()
    for (const c of children) {
      const key = c.divisionTag?.trim() || ''
      groups.set(key, [...(groups.get(key) || []), c])
    }
    const tagged: { tag: string; items: Department[] }[] = []
    for (const [tag, items] of groups.entries()) if (tag) tagged.push({ tag, items })
    tagged.sort((a, b) => a.tag.localeCompare(b.tag, 'uk'))
    const untagged = groups.get('') || []
    return [...tagged, ...(untagged.length ? [{ tag: null, items: untagged }] : [])]
  }

  const DeptNode = ({ dept, depth = 0 }: { dept: Department; depth?: number }) => {
    const isExpanded = expandedDepts.has(dept.id)
    const isSelected = selectedEntity?.id === dept.id && selectedEntity.type === 'department'
    const children = childMap[dept.id] || []
    const members = teamMap[dept.id] || []
    const groups = groupByDivision(children)
    const hasMultipleGroups = groups.some(g => g.tag !== null)

    const handleClick = async () => {
      await selectEntity('department', dept.id, dept.nameUk)
      if (!isExpanded) await toggleDept(dept.id)
    }

    return (
      <div>
        <div className="flex items-center" style={{ paddingLeft: depth * 14 }}>
          <button
            onClick={e => { e.stopPropagation(); toggleDept(dept.id) }}
            className="w-5 h-5 flex items-center justify-center text-muted-foreground hover:text-foreground shrink-0"
            style={{ transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.15s ease' }}
          >
            <span className="text-[9px]">▶</span>
          </button>
          <button
            onClick={handleClick}
            className={`flex-1 text-left px-2 py-1.5 rounded-lg truncate transition-colors ${depth === 0 ? 'text-[13px]' : 'text-[12px]'} ${isSelected ? 'bg-primary/10 text-primary font-semibold' : 'text-foreground hover:bg-secondary'}`}
          >
            {depth === 0 ? '🏛' : '📁'} {dept.nameUk}
          </button>
        </div>
        {isExpanded && (
          <div>
            {hasMultipleGroups ? (
              // Show управління groups
              groups.map(({ tag, items }) => (
                <DivisionGroup
                  key={tag ?? '__none__'}
                  tag={tag}
                  depts={items}
                  depth={depth}
                />
              ))
            ) : (
              children.map(child => <DeptNode key={child.id} dept={child} depth={depth + 1} />)
            )}
            {members.map(m => (
              <button
                key={m.id}
                onClick={() => selectEntity('user', m.id, `${m.lastName} ${m.firstName}`)}
                style={{ paddingLeft: depth * 14 + 28 }}
                className={`w-full text-left pr-2 py-1.5 rounded-lg text-[11px] truncate transition-colors ${
                  selectedEntity?.id === m.id && selectedEntity.type === 'user'
                    ? 'bg-primary/10 text-primary font-medium'
                    : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
                }`}
              >
                👤 {m.lastName} {m.firstName}
              </button>
            ))}
          </div>
        )}
      </div>
    )
  }

  // Management group — uses expandedDepts with `mgmt:${tag}` keys to avoid defining state inside
  const DivisionGroup = ({ tag, depts, depth }: { tag: string | null; depts: Department[]; depth: number }) => {
    const isOpen = tag ? !expandedDepts.has(`mgmt_collapsed:${tag}`) : true
    if (!tag) return <div>{depts.map(d => <DeptNode key={d.id} dept={d} depth={depth + 1} />)}</div>
    return (
      <div>
        <button
          onClick={() => {
            const key = `mgmt_collapsed:${tag}`
            setExpandedDepts(prev => {
              const next = new Set(prev)
              next.has(key) ? next.delete(key) : next.add(key)
              return next
            })
          }}
          style={{ paddingLeft: depth * 14 + 8 }}
          className="w-full text-left pr-2 py-1 flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide hover:text-foreground transition-colors"
        >
          <span style={{ display: 'inline-block', transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.15s ease', fontSize: 8 }}>▶</span>
          <span>📂 {tag}</span>
        </button>
        {isOpen && depts.map(d => <DeptNode key={d.id} dept={d} depth={depth + 1} />)}
      </div>
    )
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <DashboardLayout>
      <div className="flex h-[calc(100vh-64px)] overflow-hidden">

        {/* ── Sidebar ── */}
        {viewMode === 'tree' && (
          <aside className="w-64 shrink-0 border-r border-border bg-card flex flex-col overflow-hidden">
            <div className="px-3 py-3 border-b border-border flex items-center justify-between">
              <h2 className="text-sm font-semibold text-foreground">Мої файли</h2>
              <span className="text-[10px] text-muted-foreground">Приватно</span>
            </div>

            {upcomingReminders.length > 0 && (
              <button onClick={() => setRemindersModal(true)} className="mx-2 mt-2 rounded-xl px-3 py-2 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/40 text-left hover:bg-amber-100 transition-colors">
                <p className="text-[11px] font-semibold text-amber-700 dark:text-amber-400">⏰ Нагадування · {upcomingReminders.length}</p>
                <p className="text-[10px] text-amber-600 dark:text-amber-500 truncate mt-0.5">{upcomingReminders[0].fileName}</p>
              </button>
            )}

            <nav className="flex-1 overflow-y-auto p-2 space-y-0.5 mt-1">
              {!token ? (
                <p className="text-[11px] text-muted-foreground px-2 py-4 text-center">Завантаження…</p>
              ) : departments.length === 0 ? (
                <p className="text-[11px] text-muted-foreground px-2 py-4 text-center">Немає доступних підрозділів</p>
              ) : (
                rootDepts.map(dept => <DeptNode key={dept.id} dept={dept} depth={0} />)
              )}
            </nav>
          </aside>
        )}

        {/* ── Main panel ── */}
        <main
          className={`flex-1 flex flex-col overflow-hidden bg-background relative ${isDragOver ? 'ring-2 ring-inset ring-primary' : ''}`}
          onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}
        >
          {isDragOver && (
            <div className="absolute inset-0 z-20 flex items-center justify-center bg-primary/5 pointer-events-none">
              <div className="text-center"><div className="text-5xl mb-2">📂</div><p className="text-base font-semibold text-primary">Відпустіть файл</p></div>
            </div>
          )}

          {/* Top bar */}
          <div className="flex flex-wrap items-center gap-2 px-4 py-2.5 border-b border-border bg-card">
            <div className="flex rounded-lg border border-border overflow-hidden shrink-0">
              <button onClick={() => setViewMode('tree')} className={`px-3 py-1.5 text-xs transition-colors ${viewMode === 'tree' ? 'bg-primary text-white' : 'text-muted-foreground hover:bg-secondary'}`}>🌲 Дерево</button>
              <button onClick={() => setViewMode('all')} className={`px-3 py-1.5 text-xs transition-colors ${viewMode === 'all' ? 'bg-primary text-white' : 'text-muted-foreground hover:bg-secondary'}`}>📋 Всі файли</button>
            </div>
            <div className="relative flex-1 min-w-36">
              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground text-xs">🔍</span>
              <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Пошук…"
                className="w-full pl-7 pr-3 py-1.5 rounded-lg border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30" />
            </div>
            <select value={sortBy} onChange={e => setSortBy(e.target.value as typeof sortBy)}
              className="rounded-lg border border-border bg-background px-2 py-1.5 text-xs text-foreground focus:outline-none">
              <option value="date_desc">Нові спочатку</option>
              <option value="date_asc">Старі спочатку</option>
              <option value="name">За назвою</option>
              <option value="size">За розміром</option>
            </select>
            <button onClick={() => setShowArchived(p => !p)}
              className={`px-3 py-1.5 rounded-lg text-xs transition-colors border ${showArchived ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:bg-secondary'}`}>
              📦 Архів
            </button>
            <button onClick={() => setRemindersModal(true)} className="px-3 py-1.5 rounded-lg text-xs border border-border text-muted-foreground hover:bg-secondary transition-colors">
              ⏰{upcomingReminders.length > 0 && <span className="ml-1 text-amber-500 font-semibold">{upcomingReminders.length}</span>}
            </button>
            {selectedEntity ? (
              <button onClick={() => fileInputRef.current?.click()}
                className="ml-auto px-4 py-1.5 rounded-lg bg-primary text-white text-xs font-medium hover:bg-primary/90 transition-colors shrink-0">
                + Завантажити
              </button>
            ) : viewMode === 'tree' ? null : (
              <span className="ml-auto text-[11px] text-muted-foreground italic">Оберіть підрозділ у дереві</span>
            )}
            {/* Tag filter */}
            <div className="w-full flex gap-1.5 flex-wrap pt-0.5">
              <button onClick={() => setActiveTag(null)}
                className={`px-2.5 py-0.5 rounded-full text-[11px] transition-colors ${!activeTag ? 'bg-primary text-white' : 'bg-secondary text-muted-foreground hover:bg-secondary/70'}`}>
                Всі
              </button>
              {TAGS.map(tag => (
                <button key={tag} onClick={() => setActiveTag(activeTag === tag ? null : tag)}
                  className={`px-2.5 py-0.5 rounded-full text-[11px] transition-colors border-2 ${activeTag === tag ? 'border-primary' : 'border-transparent'} ${TAG_COLORS[tag]}`}>
                  {tag}
                </button>
              ))}
            </div>
          </div>

          {/* Entity header + folder bar */}
          {viewMode === 'tree' && selectedEntity && (
            <div className="border-b border-border bg-card/50">
              <div className="px-4 py-2 flex items-center gap-2">
                <span className="text-sm font-medium text-foreground truncate">
                  {selectedEntity.type === 'department' ? '📁' : '👤'} {selectedEntity.label}
                </span>
                <span className="text-xs text-muted-foreground ml-auto">{currentFiles.length} файлів</span>
              </div>
              <div className="px-4 pb-2 flex items-center gap-2 flex-wrap">
                <button onClick={() => setSelectedFolderId(undefined)}
                  className={`px-3 py-1 rounded-lg text-xs transition-colors ${selectedFolderId === undefined ? 'bg-primary text-white' : 'bg-secondary text-muted-foreground hover:bg-secondary/70'}`}>
                  Всі
                </button>
                <button onClick={() => setSelectedFolderId(null)}
                  className={`px-3 py-1 rounded-lg text-xs transition-colors ${selectedFolderId === null ? 'bg-primary text-white' : 'bg-secondary text-muted-foreground hover:bg-secondary/70'}`}>
                  Без папки
                </button>
                {folders.map(f => (
                  <div key={f.id} className="flex items-center gap-0.5 group">
                    {renamingFolderId === f.id ? (
                      <form onSubmit={e => { e.preventDefault(); handleRenameFolder(f.id) }} className="flex gap-1">
                        <input value={renameFolderName} onChange={e => setRenameFolderName(e.target.value)} autoFocus
                          className="w-28 text-xs rounded-lg border border-border px-2 py-0.5 focus:outline-none focus:ring-1 focus:ring-primary"
                          onBlur={() => setRenamingFolderId(null)} />
                        <button type="submit" className="text-xs text-primary">✓</button>
                      </form>
                    ) : (
                      <>
                        <button onClick={() => setSelectedFolderId(f.id)}
                          className={`px-3 py-1 rounded-lg text-xs transition-colors ${selectedFolderId === f.id ? 'bg-primary text-white' : 'bg-secondary text-muted-foreground hover:bg-secondary/70'}`}>
                          📁 {f.name}
                        </button>
                        <button onClick={() => { setRenamingFolderId(f.id); setRenameFolderName(f.name) }}
                          className="opacity-0 group-hover:opacity-100 text-[11px] text-muted-foreground hover:text-foreground px-0.5 transition-opacity">✎</button>
                        <button onClick={() => handleDeleteFolder(f.id)}
                          className="opacity-0 group-hover:opacity-100 text-[11px] text-destructive hover:text-destructive/80 px-0.5 transition-opacity">✕</button>
                      </>
                    )}
                  </div>
                ))}
                {creatingFolder ? (
                  <form onSubmit={e => { e.preventDefault(); handleCreateFolder() }} className="flex gap-1">
                    <input value={newFolderName} onChange={e => setNewFolderName(e.target.value)} placeholder="Назва папки…" autoFocus
                      className="w-32 text-xs rounded-lg border border-border px-2 py-1 focus:outline-none focus:ring-1 focus:ring-primary"
                      onBlur={() => setCreatingFolder(false)} />
                    <button type="submit" className="text-xs text-primary font-medium">+ Створити</button>
                  </form>
                ) : (
                  <button onClick={() => setCreatingFolder(true)} className="text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded-lg hover:bg-secondary transition-colors">
                    + Папка
                  </button>
                )}
              </div>
            </div>
          )}

          <div className="flex-1 overflow-y-auto p-4">
            {viewMode === 'tree' && !selectedEntity ? (
              <div className="h-full flex flex-col items-center justify-center text-center">
                <div className="text-6xl mb-4 opacity-20">🗂</div>
                <p className="text-sm font-medium text-foreground/50">Оберіть управління, відділ або особу</p>
                <p className="text-xs text-muted-foreground mt-1">Або перейдіть у режим «Всі файли»</p>
              </div>
            ) : currentFiles.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center">
                <div className="text-5xl mb-3 opacity-20">📂</div>
                <p className="text-sm text-muted-foreground">Файлів немає</p>
                {selectedEntity && <p className="text-xs text-muted-foreground mt-1">Перетягніть файл або натисніть «Завантажити»</p>}
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-3">
                {currentFiles.map(file => (
                  <FileCard key={file.id} file={file} token={token || ''} folders={folders}
                    onOpen={() => openViewer(file)}
                    onPin={() => toggleFilePin(file.id)}
                    onArchive={() => toggleFileArchive(file.id)}
                    onNewVersion={() => { setVersionTargetId(file.id); versionInputRef.current?.click() }}
                    onVersions={() => openVersions(file)}
                    onRename={() => { setRenamingFileId(file.id); setRenameFileName(file.fileName) }}
                    onMove={async (folderId) => {
                      if (!token) return
                      await fetch(`/api/v1/deputy-files/${file.id}/move`, {
                        method: 'PATCH',
                        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                        body: JSON.stringify({ folderId }),
                      })
                      await refreshCurrentView()
                    }}
                    onDelete={() => setConfirmDeleteId(file.id)}
                  />
                ))}
              </div>
            )}
          </div>
        </main>
      </div>

      <input ref={fileInputRef} type="file" className="hidden"
        accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.gif,.webp,.mp4,.mov,.avi,.mkv,.webm"
        onChange={handleFileInput} />
      <input ref={versionInputRef} type="file" className="hidden"
        accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.gif,.webp,.mp4,.mov,.avi,.mkv,.webm"
        onChange={handleVersionInput} />

      {/* ── Upload modal ── */}
      {pendingFile && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" style={{ animation: 'fadeIn 0.15s ease' }}>
          <div className="w-full max-w-md rounded-2xl bg-card border border-border shadow-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-border flex items-center justify-between">
              <h3 className="font-semibold text-foreground">Завантажити файл</h3>
              <button onClick={() => setPendingFile(null)} className="text-muted-foreground hover:text-foreground text-xl">✕</button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">Назва файлу</label>
                <input value={uploadMeta.fileName} onChange={e => setUploadMeta(m => ({ ...m, fileName: e.target.value }))}
                  className="w-full rounded-xl border border-border px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30" />
              </div>
              {folders.length > 0 && (
                <div>
                  <label className="text-xs font-medium text-muted-foreground block mb-1">Папка</label>
                  <select value={uploadMeta.folderId} onChange={e => setUploadMeta(m => ({ ...m, folderId: e.target.value }))}
                    className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none">
                    <option value="">Без папки</option>
                    {folders.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                  </select>
                </div>
              )}
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1.5">Тип документа</label>
                <div className="flex flex-wrap gap-1.5">
                  {TAGS.map(tag => (
                    <button key={tag}
                      onClick={() => setUploadMeta(m => ({
                        ...m, tags: m.tags.includes(tag) ? m.tags.filter(t => t !== tag) : [...m.tags, tag],
                      }))}
                      className={`px-3 py-1 rounded-full text-xs font-medium transition-colors border-2 ${uploadMeta.tags.includes(tag) ? 'border-primary' : 'border-transparent'} ${TAG_COLORS[tag]}`}>
                      {tag}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">Нотатка</label>
                <textarea value={uploadMeta.notes} onChange={e => setUploadMeta(m => ({ ...m, notes: e.target.value }))} rows={2}
                  className="w-full rounded-xl border border-border px-3 py-2 text-sm text-foreground resize-none focus:outline-none focus:ring-2 focus:ring-primary/30" placeholder="Необов'язково…" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">Нагадати</label>
                <input type="datetime-local" value={uploadMeta.reminderAt} onChange={e => setUploadMeta(m => ({ ...m, reminderAt: e.target.value }))}
                  className="w-full rounded-xl border border-border px-3 py-2 text-sm text-foreground focus:outline-none" />
              </div>
            </div>
            <div className="px-5 pb-5 flex gap-2">
              <button onClick={confirmUpload} disabled={uploading}
                className="flex-1 rounded-xl bg-primary py-2.5 text-sm font-medium text-white disabled:opacity-60">
                {uploading ? 'Завантаження…' : '⬆ Завантажити'}
              </button>
              <button onClick={() => setPendingFile(null)} className="px-4 rounded-xl border border-border text-sm text-muted-foreground">Скасувати</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Viewer ── */}
      {viewer && (
        <div className="fixed inset-0 z-50 bg-black/85 flex flex-col" style={{ animation: 'fadeIn 0.18s ease' }}>
          <div className="flex items-center gap-2 px-4 py-2 bg-black/60 border-b border-white/10 shrink-0">
            <span className="text-white text-sm font-medium truncate max-w-xs">{fileIcon(viewer.mimeType)} {viewer.fileName}</span>
            {viewer.version > 1 && <span className="text-[10px] text-white/50 bg-white/10 px-1.5 py-0.5 rounded">v{viewer.version}</span>}
            <div className="flex items-center gap-1 ml-auto">
              {viewer.mimeType.startsWith('image/') && (
                <>
                  <ToolBtn onClick={() => setZoom(z => Math.max(0.1, z - 0.25))}>−</ToolBtn>
                  <span className="text-white/50 text-xs w-10 text-center">{Math.round(zoom * 100)}%</span>
                  <ToolBtn onClick={() => setZoom(z => Math.min(8, z + 0.25))}>+</ToolBtn>
                  <ToolBtn onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }) }}>⌂</ToolBtn>
                </>
              )}
              <ToolBtn onClick={handlePrint}>🖨</ToolBtn>
              <button onClick={() => setNotePanelOpen(p => !p)} className="px-2 py-1 text-xs rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-colors">
                {notePanelOpen ? '📝 ×' : '📝'}
              </button>
              <button onClick={closeViewer} className="w-8 h-8 flex items-center justify-center rounded-lg text-white/80 hover:text-white hover:bg-white/10 ml-1">✕</button>
            </div>
          </div>
          <div className="flex-1 flex min-h-0">
            <div className="flex-1 overflow-hidden flex items-center justify-center"
              style={{ cursor: viewer.mimeType.startsWith('image/') ? (dragging ? 'grabbing' : 'grab') : 'default' }}
              onMouseDown={onMouseDown} onMouseMove={onMouseMove} onMouseUp={onMouseUp} onMouseLeave={onMouseUp} onWheel={onWheelZoom}>
              {!viewer.blobUrl ? (
                <div className="flex flex-col items-center gap-3">
                  <div className="w-10 h-10 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                  <span className="text-white/40 text-sm">Завантаження…</span>
                </div>
              ) : viewer.mimeType.startsWith('image/') ? (
                <img src={viewer.blobUrl} alt={viewer.fileName} draggable={false}
                  style={{ transform: `translate(${pan.x}px,${pan.y}px) scale(${zoom})`, transformOrigin: 'center', transition: dragging ? 'none' : 'transform 0.1s ease', maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', userSelect: 'none' }} />
              ) : viewer.mimeType.startsWith('video/') ? (
                <video src={viewer.blobUrl} controls autoPlay className="max-w-full max-h-full rounded-xl" />
              ) : (
                <iframe src={viewer.blobUrl} title={viewer.fileName} className="w-full h-full border-none" />
              )}
            </div>
            {notePanelOpen && (
              <div className="w-72 shrink-0 border-l border-white/10 bg-black/40 flex flex-col p-4 gap-3" style={{ animation: 'slideLeft 0.2s ease' }}>
                <p className="text-white/60 text-xs font-semibold uppercase tracking-wide">Нотатка</p>
                <textarea value={viewerNotes} onChange={e => setViewerNotes(e.target.value)} placeholder="Додайте нотатку…" rows={5}
                  className="rounded-xl bg-white/10 text-white placeholder:text-white/30 text-sm px-3 py-2 resize-none focus:outline-none focus:ring-1 focus:ring-white/30" />
                <div>
                  <p className="text-white/50 text-xs mb-1">Нагадати</p>
                  <input type="datetime-local" value={viewerReminder} onChange={e => setViewerReminder(e.target.value)}
                    className="rounded-xl bg-white/10 text-white text-xs px-3 py-2 w-full focus:outline-none focus:ring-1 focus:ring-white/30" />
                </div>
                <div>
                  <p className="text-white/50 text-xs mb-1.5">Теги</p>
                  <div className="flex flex-wrap gap-1">
                    {TAGS.map(tag => (
                      <button key={tag}
                        onClick={() => setViewerTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag])}
                        className={`px-2 py-0.5 rounded-full text-[10px] transition-colors ${viewerTags.includes(tag) ? 'bg-primary text-white' : 'bg-white/10 text-white/60 hover:bg-white/20'}`}>
                        {tag}
                      </button>
                    ))}
                  </div>
                </div>
                <button onClick={saveViewerNote} disabled={savingViewerNote}
                  className="mt-auto rounded-xl bg-primary py-2 text-sm font-medium text-white disabled:opacity-60">
                  {savingViewerNote ? 'Збереження…' : 'Зберегти'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Rename file modal ── */}
      {renamingFileId && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="w-80 rounded-2xl bg-card border border-border shadow-2xl p-6">
            <h3 className="font-semibold text-foreground mb-3">Перейменувати файл</h3>
            <form onSubmit={e => { e.preventDefault(); handleRenameFile() }}>
              <input value={renameFileName} onChange={e => setRenameFileName(e.target.value)} autoFocus
                className="w-full rounded-xl border border-border px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 mb-4" />
              <div className="flex gap-2">
                <button type="submit" className="flex-1 rounded-xl bg-primary text-white py-2.5 text-sm font-medium">Зберегти</button>
                <button type="button" onClick={() => setRenamingFileId(null)} className="flex-1 rounded-xl border border-border text-foreground py-2.5 text-sm">Скасувати</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Reminders modal ── */}
      {remindersModal && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" style={{ animation: 'fadeIn 0.15s ease' }}>
          <div className="w-full max-w-lg rounded-2xl bg-card border border-border shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <h3 className="font-semibold text-foreground">Нагадування</h3>
              <button onClick={() => setRemindersModal(false)} className="text-muted-foreground hover:text-foreground text-xl">✕</button>
            </div>
            <div className="max-h-96 overflow-y-auto divide-y divide-border">
              {reminders.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground text-sm">Немає нагадувань</div>
              ) : reminders.map(r => (
                <div key={r.id} className="px-5 py-3 flex items-start gap-3">
                  <div className="text-xl shrink-0 mt-0.5">{fileIcon(r.mimeType)}</div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{r.fileName}</p>
                    {r.notes && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{r.notes}</p>}
                    <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">⏰ {formatDatetime(r.reminderAt!)}</p>
                  </div>
                  <button onClick={() => { setRemindersModal(false); openViewer(r) }} className="shrink-0 text-xs text-primary hover:underline">Відкрити</button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Versions modal ── */}
      {versionsModal && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" style={{ animation: 'fadeIn 0.15s ease' }}>
          <div className="w-full max-w-md rounded-2xl bg-card border border-border shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <div>
                <h3 className="font-semibold text-foreground">Версії файлу</h3>
                <p className="text-xs text-muted-foreground truncate max-w-xs">{versionsModal.fileName}</p>
              </div>
              <button onClick={() => setVersionsModal(null)} className="text-muted-foreground hover:text-foreground text-xl">✕</button>
            </div>
            <div className="max-h-80 overflow-y-auto divide-y divide-border">
              {versions.map((v, i) => (
                <div key={v.id} className="px-5 py-3 flex items-center gap-3">
                  <span className="text-xs font-bold text-muted-foreground w-6">v{v.version}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm truncate text-foreground">{v.fileName}</p>
                    <p className="text-xs text-muted-foreground">{formatDate(v.createdAt)} · {formatBytes(v.fileSize)}</p>
                  </div>
                  <button onClick={() => openViewer(v)} className="text-xs text-primary hover:underline shrink-0">Відкрити</button>
                  {i === 0 && <span className="text-[10px] text-green-600 dark:text-green-400 font-medium shrink-0">Поточна</span>}
                </div>
              ))}
            </div>
            <div className="px-5 py-3 border-t border-border">
              <button onClick={() => { setVersionTargetId(versionsModal.id); versionInputRef.current?.click() }}
                className="w-full rounded-xl bg-primary py-2 text-sm font-medium text-white">
                + Завантажити нову версію
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete confirm ── */}
      {confirmDeleteId && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="w-80 rounded-2xl bg-card border border-border shadow-2xl p-6 text-center">
            <div className="text-4xl mb-3">🗑</div>
            <h3 className="font-semibold text-foreground mb-1">Видалити файл?</h3>
            <p className="text-xs text-muted-foreground mb-5">Ця дія незворотна</p>
            <div className="flex gap-2">
              <button onClick={() => handleDelete(confirmDeleteId)} className="flex-1 rounded-xl bg-destructive text-white py-2.5 text-sm font-medium">Видалити</button>
              <button onClick={() => setConfirmDeleteId(null)} className="flex-1 rounded-xl border border-border text-foreground py-2.5 text-sm">Скасувати</button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className={`fixed bottom-6 right-6 z-[60] rounded-xl px-4 py-3 text-sm font-medium shadow-lg ${toast.type === 'ok' ? 'bg-emerald-600 text-white' : 'bg-destructive text-white'}`}
          style={{ animation: 'slideUp 0.2s ease' }}>
          {toast.msg}
        </div>
      )}

      <style>{`
        @keyframes fadeIn { from { opacity:0 } to { opacity:1 } }
        @keyframes slideUp { from { opacity:0; transform:translateY(12px) } to { opacity:1; transform:translateY(0) } }
        @keyframes slideLeft { from { opacity:0; transform:translateX(20px) } to { opacity:1; transform:translateX(0) } }
      `}</style>
    </DashboardLayout>
  )
}

// ── FileCard ───────────────────────────────────────────────────────────────────

function FileCard({
  file, token, folders,
  onOpen, onPin, onArchive, onNewVersion, onVersions, onRename, onMove, onDelete,
}: {
  file: DeputyFile; token: string; folders: DeputyFolder[]
  onOpen: () => void; onPin: () => void; onArchive: () => void
  onNewVersion: () => void; onVersions: () => void; onRename: () => void
  onMove: (folderId: string | null) => void; onDelete: () => void
}) {
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <div className={`relative rounded-2xl border bg-card transition-all duration-200 overflow-hidden ${file.archivedAt ? 'opacity-60 border-dashed border-border' : 'border-border hover:border-primary/40 hover:shadow-md'}`}>
      <button onClick={onOpen} className="w-full aspect-square flex flex-col items-center justify-center bg-secondary/40 hover:bg-secondary/70 transition-colors relative overflow-hidden">
        {file.mimeType.startsWith('image/')
          ? <ImageThumb fileId={file.id} token={token} />
          : <span className="text-4xl">{fileIcon(file.mimeType)}</span>}
        <div className="absolute top-1.5 left-1.5 flex gap-1">
          {file.isPinned && <span className="text-[10px] bg-primary text-white px-1 py-0.5 rounded-md">📌</span>}
          {file.version > 1 && <span className="text-[10px] bg-black/50 text-white px-1 py-0.5 rounded-md">v{file.version}</span>}
        </div>
        {file.reminderAt && new Date(file.reminderAt) > new Date() && (
          <div className="absolute bottom-1.5 right-1.5 text-[10px] bg-amber-500 text-white px-1 py-0.5 rounded-md">⏰</div>
        )}
      </button>

      <div className="px-2.5 py-2">
        <p className="text-xs font-medium text-foreground truncate" title={file.fileName}>{file.fileName}</p>
        <p className="text-[10px] text-muted-foreground mt-0.5">{formatBytes(file.fileSize)}</p>
        {file.tags?.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1">
            {file.tags.slice(0, 2).map(tag => (
              <span key={tag} className={`text-[9px] px-1.5 py-0.5 rounded-full ${TAG_COLORS[tag] || 'bg-gray-100 text-gray-600'}`}>{tag}</span>
            ))}
          </div>
        )}
        {file.notes && <p className="text-[10px] text-muted-foreground mt-1 line-clamp-1">📝 {file.notes}</p>}
      </div>

      <div className="flex border-t border-border">
        <button onClick={onPin} className={`flex-1 py-1.5 text-[11px] transition-colors ${file.isPinned ? 'text-primary' : 'text-muted-foreground'} hover:bg-secondary`}>📌</button>
        <button onClick={onOpen} className="flex-1 py-1.5 text-[11px] text-muted-foreground hover:bg-secondary transition-colors border-x border-border">👁</button>
        <div className="relative flex-1">
          <button onClick={() => setMenuOpen(p => !p)} className="w-full py-1.5 text-[11px] text-muted-foreground hover:bg-secondary transition-colors">⋯</button>
          {menuOpen && (
            <div className="absolute bottom-full right-0 mb-1 w-48 rounded-xl bg-popover border border-border shadow-xl z-10 overflow-hidden">
              <button onClick={() => { onRename(); setMenuOpen(false) }} className="w-full px-3 py-2 text-xs text-left text-foreground hover:bg-secondary transition-colors">✎ Перейменувати</button>
              <button onClick={() => { onVersions(); setMenuOpen(false) }} className="w-full px-3 py-2 text-xs text-left text-foreground hover:bg-secondary transition-colors">🔄 Версії</button>
              <button onClick={() => { onNewVersion(); setMenuOpen(false) }} className="w-full px-3 py-2 text-xs text-left text-foreground hover:bg-secondary transition-colors">⬆ Нова версія</button>
              {folders.length > 0 && (
                <>
                  <div className="border-t border-border" />
                  <p className="px-3 pt-1.5 pb-0.5 text-[10px] text-muted-foreground font-medium">Перемістити до:</p>
                  <button onClick={() => { onMove(null); setMenuOpen(false) }} className="w-full px-3 py-1.5 text-xs text-left text-foreground hover:bg-secondary transition-colors">📭 Без папки</button>
                  {folders.map(f => (
                    <button key={f.id} onClick={() => { onMove(f.id); setMenuOpen(false) }} className="w-full px-3 py-1.5 text-xs text-left text-foreground hover:bg-secondary transition-colors truncate">📁 {f.name}</button>
                  ))}
                </>
              )}
              <div className="border-t border-border" />
              <button onClick={() => { onArchive(); setMenuOpen(false) }} className="w-full px-3 py-2 text-xs text-left text-foreground hover:bg-secondary transition-colors">{file.archivedAt ? '📤 Розархівувати' : '📦 Архівувати'}</button>
              <button onClick={() => { onDelete(); setMenuOpen(false) }} className="w-full px-3 py-2 text-xs text-left text-destructive hover:bg-secondary transition-colors">🗑 Видалити</button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function ToolBtn({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className="w-8 h-8 flex items-center justify-center rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-colors text-sm">
      {children}
    </button>
  )
}
