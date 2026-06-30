'use client'

import { useCallback, useEffect, useState } from 'react'
import { DashboardLayout } from '@/components/dashboard-layout'
import { useAuthStore } from '@/store/auth-store'
import { extractApiErrorMessage } from '@/lib/error-message'

// ─── Types ───────────────────────────────────────────────────────────────────

type RootDept = {
  id: string
  name: string
  nameUk: string
  code: string
  usersCount: number
  director?: { id: string; firstName: string; lastName: string } | null
  manager?: { id: string; firstName: string; lastName: string } | null
  clerk?: { id: string; firstName: string; lastName: string } | null
}

type Management = {
  id: string
  name: string
  nameUk: string
  departmentId: string
  headId: string | null
  head?: { id: string; firstName: string; lastName: string } | null
}

type Section = {
  id: string
  name: string
  nameUk: string
  code: string
  parentId: string
  managementId: string | null
  usersCount: number
  manager?: { id: string; firstName: string; lastName: string } | null
  clerk?: { id: string; firstName: string; lastName: string } | null
}

type OrgUser = {
  id: string
  firstName: string
  lastName: string
  email: string
  employeeId: string
  role: string
  isActive: boolean
  departmentId: string | null
  position?: { title: string; titleUk?: string } | null
}

type SelectedNode =
  | { type: 'dept'; id: string }
  | { type: 'management'; id: string }
  | { type: 'section'; id: string }

const ROLE_LABELS: Record<string, string> = {
  specialist: 'Спеціаліст',
  manager: 'Керівник відділу',
  clerk: 'Діловод',
  director: 'Директор',
  deputy_director: 'Заступник директора',
  deputy_head: 'Заступник голови',
  lawyer: 'Юрист',
  accountant: 'Бухгалтер',
  hr: 'HR',
  admin: 'Адміністратор',
}

const ALL_ROLES = ['specialist', 'manager', 'clerk', 'director', 'deputy_director', 'deputy_head', 'lawyer', 'accountant', 'hr', 'admin'] as const

// ─── Main component ───────────────────────────────────────────────────────────

export default function DepartmentsPage() {
  const { user } = useAuthStore()
  const token = typeof window !== 'undefined' ? localStorage.getItem('vidlik-accessToken') : null

  const isAdmin = user?.role === 'admin'
  const isDirector = user?.role === 'director' || user?.role === 'deputy_director'
  const canManage = isAdmin || isDirector

  // ── Data ─────────────────────────────────────────────────────────────────

  const [allDepts, setAllDepts] = useState<(RootDept | Section)[]>([])
  const [managements, setManagements] = useState<Management[]>([])
  const [allUsers, setAllUsers] = useState<OrgUser[]>([])
  const [members, setMembers] = useState<OrgUser[]>([])

  const [loading, setLoading] = useState(true)
  const [membersLoading, setMembersLoading] = useState(false)

  // ── Selection / tree ──────────────────────────────────────────────────────

  const [selected, setSelected] = useState<SelectedNode | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  // ── Modals ────────────────────────────────────────────────────────────────

  type ModalState =
    | { type: 'create-dept' }
    | { type: 'create-management'; parentDeptId: string }
    | { type: 'create-section'; parentDeptId: string; managementId?: string | null }
    | { type: 'create-user'; departmentId?: string | null }
    | { type: 'edit-dept'; id: string }
    | { type: 'edit-management'; id: string }
    | { type: 'edit-section'; id: string }
    | { type: 'edit-user'; id: string }

  const [modal, setModal] = useState<ModalState | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // ── Create Dept form ──────────────────────────────────────────────────────

  const [cf, setCf] = useState({
    // dept
    deptName: '', deptCode: '', deptDirectorId: '',
    // management
    mgmtName: '',
    // section
    sectionName: '', sectionCode: '', sectionManagerId: '', sectionClerkId: '',
    // user
    uFirstName: '', uLastName: '', uPatronymic: '', uEmail: '', uEmployeeId: '',
    uPassword: '', uRole: 'specialist' as string, uDeptId: '', uPositionTitle: '',
  })

  const setCfField = (key: keyof typeof cf, value: string) => setCf(p => ({ ...p, [key]: value }))

  // ── Load helpers ──────────────────────────────────────────────────────────

  const authHeaders = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }

  const loadDepts = useCallback(async () => {
    if (!token) return
    setLoading(true)
    const r = await fetch('/api/v1/departments', { headers: authHeaders })
    if (r.ok) setAllDepts(await r.json())
    setLoading(false)
  }, [token])

  const loadManagements = useCallback(async (departmentId?: string) => {
    if (!token) return
    const url = departmentId ? `/api/v1/managements?departmentId=${departmentId}` : '/api/v1/managements'
    const r = await fetch(url, { headers: authHeaders })
    if (r.ok) {
      const data = await r.json()
      setManagements(prev => {
        const withoutThisDept = departmentId ? prev.filter(m => m.departmentId !== departmentId) : []
        return [...withoutThisDept, ...data]
      })
    }
  }, [token])

  const loadUsers = useCallback(async () => {
    if (!token) return
    const r = await fetch('/api/v1/users?limit=500', { headers: authHeaders })
    if (r.ok) {
      const data = await r.json()
      setAllUsers(Array.isArray(data) ? data : data?.data || [])
    }
  }, [token])

  const loadMembers = useCallback(async (departmentId: string) => {
    if (!token) return
    setMembersLoading(true)
    const r = await fetch(`/api/v1/departments/${departmentId}/team`, { headers: authHeaders })
    if (r.ok) {
      const data = await r.json()
      setMembers(Array.isArray(data) ? data : data?.members || [])
    }
    setMembersLoading(false)
  }, [token])

  useEffect(() => { loadDepts(); loadUsers() }, [loadDepts, loadUsers])

  useEffect(() => {
    if (!success) return
    const t = setTimeout(() => setSuccess(''), 3000)
    return () => clearTimeout(t)
  }, [success])

  // ── Expand / select ───────────────────────────────────────────────────────

  const toggleExpand = (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation()
    setExpanded(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const selectNode = async (node: SelectedNode) => {
    setSelected(node)
    if (node.type === 'dept') {
      if (!expanded.has(node.id)) setExpanded(prev => new Set([...prev, node.id]))
      await loadManagements(node.id)
    }
    if (node.type === 'section') {
      await loadMembers(node.id)
    }
    if (node.type === 'management') {
      const mgmt = managements.find(m => m.id === node.id)
      if (mgmt) await loadManagements(mgmt.departmentId)
    }
  }

  // ── Derived data ──────────────────────────────────────────────────────────

  const rootDepts = allDepts.filter(d => !(d as Section).parentId) as RootDept[]
  const sections = allDepts.filter(d => !!(d as Section).parentId) as Section[]

  const getSections = (parentId: string, managementId?: string | null) =>
    managementId === undefined
      ? sections.filter(s => s.parentId === parentId)
      : sections.filter(s => s.parentId === parentId && s.managementId === managementId)

  const getManagements = (departmentId: string) => managements.filter(m => m.departmentId === departmentId)

  const selectedDept = selected?.type === 'dept' ? rootDepts.find(d => d.id === selected.id) : null
  const selectedMgmt = selected?.type === 'management' ? managements.find(m => m.id === selected.id) : null
  const selectedSection = selected?.type === 'section' ? sections.find(s => s.id === selected.id) : null

  // ── CRUD ──────────────────────────────────────────────────────────────────

  const withSave = async (fn: () => Promise<Response | null>) => {
    setError(''); setSaving(true)
    try {
      const r = await fn()
      if (!r) return false
      if (r.ok) {
        await loadDepts()
        setModal(null)
        setCf({ deptName: '', deptCode: '', deptDirectorId: '', mgmtName: '', sectionName: '', sectionCode: '', sectionManagerId: '', sectionClerkId: '', uFirstName: '', uLastName: '', uPatronymic: '', uEmail: '', uEmployeeId: '', uPassword: '', uRole: 'specialist', uDeptId: '', uPositionTitle: '' })
        setSuccess('Збережено')
        return true
      }
      const json = await r.json().catch(() => null)
      setError(extractApiErrorMessage(r.status, json, 'Помилка збереження'))
    } catch { setError('Мережева помилка') }
    finally { setSaving(false) }
    return false
  }

  const createDept = () => withSave(() => fetch('/api/v1/departments', {
    method: 'POST', headers: authHeaders,
    body: JSON.stringify({ name: cf.deptName, nameUk: cf.deptName, code: cf.deptCode.toUpperCase(), directorId: cf.deptDirectorId || undefined }),
  }))

  const createManagement = (parentDeptId: string) => withSave(async () => {
    const r = await fetch('/api/v1/managements', {
      method: 'POST', headers: authHeaders,
      body: JSON.stringify({ name: cf.mgmtName, nameUk: cf.mgmtName, departmentId: parentDeptId }),
    })
    if (r.ok) await loadManagements(parentDeptId)
    return r
  })

  const createSection = (parentDeptId: string, managementId?: string | null) => withSave(() => fetch('/api/v1/departments', {
    method: 'POST', headers: authHeaders,
    body: JSON.stringify({
      name: cf.sectionName, nameUk: cf.sectionName,
      code: cf.sectionCode.toUpperCase(),
      parentId: parentDeptId,
      managementId: managementId || undefined,
      managerId: cf.sectionManagerId || undefined,
      clerkId: cf.sectionClerkId || undefined,
    }),
  }))

  const createUser = () => withSave(() => fetch('/api/v1/users', {
    method: 'POST', headers: authHeaders,
    body: JSON.stringify({
      firstName: cf.uFirstName,
      lastName: cf.uLastName,
      patronymic: cf.uPatronymic || undefined,
      email: cf.uEmail,
      employeeId: cf.uEmployeeId,
      password: cf.uPassword,
      role: cf.uRole,
      departmentId: cf.uDeptId || undefined,
    }),
  }))

  const deleteItem = async (type: 'dept' | 'management' | 'section', id: string, name: string) => {
    if (!window.confirm(`Видалити "${name}"?`)) return
    const url = type === 'management' ? `/api/v1/managements/${id}` : `/api/v1/departments/${id}`
    const r = await fetch(url, { method: 'DELETE', headers: authHeaders })
    if (r.ok) {
      setSelected(null)
      await loadDepts()
      if (type === 'management') await loadManagements()
      setSuccess('Видалено')
    } else {
      const json = await r.json().catch(() => null)
      setError(extractApiErrorMessage(r.status, json, 'Помилка видалення'))
    }
  }

  const updateDeptLeader = async (deptId: string, field: 'managerId' | 'clerkId' | 'directorId', userId: string) => {
    const r = await fetch(`/api/v1/departments/${deptId}`, {
      method: 'PUT', headers: authHeaders,
      body: JSON.stringify({ [field]: userId || null }),
    })
    if (r.ok) { await loadDepts(); setSuccess('Оновлено') }
    else { const j = await r.json().catch(() => null); setError(extractApiErrorMessage(r.status, j, 'Помилка')) }
  }

  const updateMgmtHead = async (mgmtId: string, headId: string) => {
    const r = await fetch(`/api/v1/managements/${mgmtId}`, {
      method: 'PUT', headers: authHeaders,
      body: JSON.stringify({ headId: headId || null }),
    })
    if (r.ok) { await loadManagements(); setSuccess('Оновлено') }
    else { const j = await r.json().catch(() => null); setError(extractApiErrorMessage(r.status, j, 'Помилка')) }
  }

  const moveSectionToManagement = async (sectionId: string, managementId: string | null) => {
    const r = await fetch(`/api/v1/departments/${sectionId}`, {
      method: 'PUT', headers: authHeaders,
      body: JSON.stringify({ managementId: managementId || null }),
    })
    if (r.ok) { await loadDepts(); setSuccess('Переміщено') }
    else { const j = await r.json().catch(() => null); setError(extractApiErrorMessage(r.status, j, 'Помилка')) }
  }

  // ── Tree ──────────────────────────────────────────────────────────────────

  const TreeDept = ({ dept }: { dept: RootDept }) => {
    const isExpanded = expanded.has(dept.id)
    const isSelected = selected?.type === 'dept' && selected.id === dept.id
    const deptManagements = getManagements(dept.id)
    const deptSections = getSections(dept.id, null) // sections without management
    const hasSub = deptManagements.length > 0 || getSections(dept.id).length > 0

    return (
      <div>
        <div className={`flex items-center group rounded-lg transition-colors ${isSelected ? 'bg-blue-50 dark:bg-blue-950/30' : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'}`}>
          <button onClick={e => toggleExpand(dept.id, e)} className="p-1 text-muted-foreground shrink-0">
            {hasSub ? <span className="text-[9px] block" style={{ transform: isExpanded ? 'rotate(90deg)' : '', transition: 'transform .15s' }}>▶</span> : <span className="text-[9px] block opacity-0">▶</span>}
          </button>
          <button onClick={() => selectNode({ type: 'dept', id: dept.id })} className="flex-1 flex items-center gap-2 px-1 py-2 text-left min-w-0">
            <span className="text-base shrink-0">🏛</span>
            <span className={`text-[13px] truncate ${isSelected ? 'font-semibold text-blue-700 dark:text-blue-400' : 'text-foreground'}`}>{dept.nameUk}</span>
            <span className="text-[10px] text-muted-foreground ml-auto shrink-0">{dept.usersCount}</span>
          </button>
        </div>
        {isExpanded && (
          <div className="ml-4 border-l border-border/50">
            {deptManagements.map(m => <TreeManagement key={m.id} mgmt={m} parentDept={dept} />)}
            {deptSections.map(s => <TreeSection key={s.id} section={s} />)}
          </div>
        )}
      </div>
    )
  }

  const TreeManagement = ({ mgmt, parentDept }: { mgmt: Management; parentDept: RootDept }) => {
    const isExpanded = expanded.has(mgmt.id)
    const isSelected = selected?.type === 'management' && selected.id === mgmt.id
    const mgmtSections = getSections(parentDept.id, mgmt.id)
    return (
      <div>
        <div className={`flex items-center rounded-lg transition-colors ${isSelected ? 'bg-emerald-50 dark:bg-emerald-950/30' : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'}`}>
          <button onClick={e => toggleExpand(mgmt.id, e)} className="p-1 text-muted-foreground shrink-0">
            {mgmtSections.length > 0 ? <span className="text-[9px] block" style={{ transform: isExpanded ? 'rotate(90deg)' : '', transition: 'transform .15s' }}>▶</span> : <span className="text-[9px] block opacity-0">▶</span>}
          </button>
          <button onClick={() => selectNode({ type: 'management', id: mgmt.id })} className="flex-1 flex items-center gap-2 px-1 py-1.5 text-left min-w-0">
            <span className="text-sm shrink-0">📂</span>
            <span className={`text-[12px] truncate ${isSelected ? 'font-semibold text-emerald-700 dark:text-emerald-400' : 'text-foreground'}`}>{mgmt.nameUk}</span>
            <span className="text-[10px] text-muted-foreground ml-auto shrink-0">{mgmtSections.length} відд.</span>
          </button>
        </div>
        {isExpanded && (
          <div className="ml-4 border-l border-border/50">
            {mgmtSections.map(s => <TreeSection key={s.id} section={s} />)}
          </div>
        )}
      </div>
    )
  }

  const TreeSection = ({ section }: { section: Section }) => {
    const isSelected = selected?.type === 'section' && selected.id === section.id
    return (
      <div className={`flex items-center rounded-lg transition-colors ${isSelected ? 'bg-violet-50 dark:bg-violet-950/30' : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'}`}>
        <span className="w-6 shrink-0" />
        <button onClick={() => selectNode({ type: 'section', id: section.id })} className="flex-1 flex items-center gap-2 px-1 py-1.5 text-left min-w-0">
          <span className="text-sm shrink-0">📁</span>
          <span className={`text-[12px] truncate ${isSelected ? 'font-semibold text-violet-700 dark:text-violet-400' : 'text-foreground'}`}>{section.nameUk}</span>
          <span className="text-[10px] text-muted-foreground ml-auto shrink-0">{section.usersCount}</span>
        </button>
      </div>
    )
  }

  // ── Detail panel ──────────────────────────────────────────────────────────

  const DetailDept = ({ dept }: { dept: RootDept }) => {
    const deptManagements = getManagements(dept.id)
    const unmanagedSections = getSections(dept.id, null)
    const allSections = getSections(dept.id)
    return (
      <div className="space-y-5">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-2xl">🏛</span>
              <h2 className="text-xl font-bold text-foreground">{dept.nameUk}</h2>
            </div>
            <p className="text-sm text-muted-foreground mt-1">Код: {dept.code} · {dept.usersCount} співробітників</p>
          </div>
          {canManage && (
            <div className="flex gap-2 shrink-0">
              <button onClick={() => setModal({ type: 'create-management', parentDeptId: dept.id })} className="px-3 py-1.5 rounded-lg bg-emerald-500 text-white text-xs font-medium hover:bg-emerald-600 transition-colors">+ Управління</button>
              <button onClick={() => setModal({ type: 'create-section', parentDeptId: dept.id })} className="px-3 py-1.5 rounded-lg bg-violet-500 text-white text-xs font-medium hover:bg-violet-600 transition-colors">+ Відділ</button>
              <button onClick={() => setModal({ type: 'create-user', departmentId: dept.id })} className="px-3 py-1.5 rounded-lg bg-primary text-white text-xs font-medium hover:bg-primary/90 transition-colors">+ Акаунт</button>
              {isAdmin && (
                <button onClick={() => deleteItem('dept', dept.id, dept.nameUk)} className="px-3 py-1.5 rounded-lg border border-rose-200 text-rose-600 text-xs hover:bg-rose-50 transition-colors">Видалити</button>
              )}
            </div>
          )}
        </div>

        {/* Director assignment */}
        <div className="rounded-xl border border-border p-4 space-y-3">
          <h3 className="text-sm font-semibold">Керівництво департаменту</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {([
              { label: 'Директор', field: 'directorId' as const, current: dept.director?.id ?? null },
              { label: 'Керівник', field: 'managerId' as const, current: dept.manager?.id ?? null },
              { label: 'Діловод', field: 'clerkId' as const, current: dept.clerk?.id ?? null },
            ]).map(({ label, field, current }) => (
              <div key={field} className="space-y-1">
                <label className="text-xs text-muted-foreground">{label}</label>
                <select
                  disabled={!canManage}
                  value={current || ''}
                  onChange={e => updateDeptLeader(dept.id, field, e.target.value)}
                  className="w-full h-9 rounded-lg border border-border px-2 text-sm bg-background disabled:opacity-60"
                >
                  <option value="">— Не призначений —</option>
                  {allUsers.map(u => (
                    <option key={u.id} value={u.id}>{u.lastName} {u.firstName} ({ROLE_LABELS[u.role] || u.role})</option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </div>

        {/* Managements */}
        {deptManagements.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Управління ({deptManagements.length})</h3>
            {deptManagements.map(m => {
              const mSections = getSections(dept.id, m.id)
              return (
                <div key={m.id} onClick={() => selectNode({ type: 'management', id: m.id })}
                  className="flex items-center gap-3 rounded-xl border border-border px-4 py-3 hover:bg-secondary/50 cursor-pointer transition-colors">
                  <span className="text-lg">📂</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{m.nameUk}</p>
                    <p className="text-xs text-muted-foreground">{mSections.length} відділів{m.head ? ` · Керівник: ${m.head.lastName} ${m.head.firstName}` : ''}</p>
                  </div>
                  <span className="text-xs text-muted-foreground">›</span>
                </div>
              )
            })}
          </div>
        )}

        {/* Unmanaged sections */}
        {unmanagedSections.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Відділи без управління ({unmanagedSections.length})</h3>
            {unmanagedSections.map(s => (
              <div key={s.id} onClick={() => selectNode({ type: 'section', id: s.id })}
                className="flex items-center gap-3 rounded-xl border border-border px-4 py-3 hover:bg-secondary/50 cursor-pointer transition-colors">
                <span className="text-lg">📁</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{s.nameUk}</p>
                  <p className="text-xs text-muted-foreground">{s.usersCount} співробітників · {s.code}</p>
                </div>
                {canManage && deptManagements.length > 0 && (
                  <select
                    onClick={e => e.stopPropagation()}
                    value=""
                    onChange={e => e.target.value && moveSectionToManagement(s.id, e.target.value)}
                    className="h-7 rounded-lg border border-border px-2 text-xs bg-background"
                  >
                    <option value="">Перемістити в управління…</option>
                    {deptManagements.map(m => <option key={m.id} value={m.id}>{m.nameUk}</option>)}
                  </select>
                )}
                <span className="text-xs text-muted-foreground">›</span>
              </div>
            ))}
          </div>
        )}

        {allSections.length === 0 && deptManagements.length === 0 && (
          <div className="rounded-xl border border-dashed border-border py-8 text-center">
            <p className="text-sm text-muted-foreground">Немає відділів чи управлінь</p>
            {canManage && <p className="text-xs text-muted-foreground mt-1">Натисніть «+ Управління» або «+ Відділ» щоб почати</p>}
          </div>
        )}
      </div>
    )
  }

  const DetailManagement = ({ mgmt }: { mgmt: Management }) => {
    const parentDept = rootDepts.find(d => d.id === mgmt.departmentId)
    const mgmtSections = sections.filter(s => s.managementId === mgmt.id)
    const deptManagements = getManagements(mgmt.departmentId)
    return (
      <div className="space-y-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <button onClick={() => selectNode({ type: 'dept', id: mgmt.departmentId })} className="text-sm text-muted-foreground hover:text-foreground transition-colors">{parentDept?.nameUk}</button>
              <span className="text-muted-foreground">/</span>
              <span className="text-2xl">📂</span>
              <h2 className="text-xl font-bold text-foreground">{mgmt.nameUk}</h2>
            </div>
            <p className="text-sm text-muted-foreground mt-1">{mgmtSections.length} відділів в управлінні</p>
          </div>
          {canManage && (
            <div className="flex gap-2 shrink-0">
              <button onClick={() => setModal({ type: 'create-section', parentDeptId: mgmt.departmentId, managementId: mgmt.id })} className="px-3 py-1.5 rounded-lg bg-violet-500 text-white text-xs font-medium hover:bg-violet-600 transition-colors">+ Відділ</button>
              {isAdmin && (
                <button onClick={() => deleteItem('management', mgmt.id, mgmt.nameUk)} className="px-3 py-1.5 rounded-lg border border-rose-200 text-rose-600 text-xs hover:bg-rose-50 transition-colors">Видалити</button>
              )}
            </div>
          )}
        </div>

        {/* Head assignment */}
        <div className="rounded-xl border border-border p-4 space-y-2">
          <h3 className="text-sm font-semibold">Керівник управління</h3>
          <select
            disabled={!canManage}
            value={mgmt.headId || ''}
            onChange={e => updateMgmtHead(mgmt.id, e.target.value)}
            className="w-full h-9 rounded-lg border border-border px-2 text-sm bg-background disabled:opacity-60"
          >
            <option value="">— Не призначений —</option>
            {allUsers.filter(u => ['manager', 'director', 'deputy_director', 'deputy_head'].includes(u.role)).map(u => (
              <option key={u.id} value={u.id}>{u.lastName} {u.firstName} ({ROLE_LABELS[u.role] || u.role})</option>
            ))}
          </select>
        </div>

        {/* Sections in this management */}
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Відділи в управлінні</h3>
          {mgmtSections.length === 0 && (
            <div className="rounded-xl border border-dashed border-border py-6 text-center">
              <p className="text-sm text-muted-foreground">Немає відділів</p>
              {canManage && <p className="text-xs text-muted-foreground mt-1">Натисніть «+ Відділ»</p>}
            </div>
          )}
          {mgmtSections.map(s => (
            <div key={s.id} className="flex items-center gap-3 rounded-xl border border-border px-4 py-3 hover:bg-secondary/50 cursor-pointer transition-colors" onClick={() => selectNode({ type: 'section', id: s.id })}>
              <span className="text-lg">📁</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{s.nameUk}</p>
                <p className="text-xs text-muted-foreground">{s.usersCount} ос.{s.manager ? ` · ${s.manager.lastName} ${s.manager.firstName}` : ''}</p>
              </div>
              {canManage && (
                <button onClick={e => { e.stopPropagation(); moveSectionToManagement(s.id, null) }}
                  className="text-xs text-muted-foreground hover:text-rose-500 px-2 py-1 rounded transition-colors">
                  Відкріпити
                </button>
              )}
              <span className="text-xs text-muted-foreground">›</span>
            </div>
          ))}
        </div>

        {/* Unassigned sections of same dept (to assign here) */}
        {canManage && (() => {
          const unassigned = sections.filter(s => s.parentId === mgmt.departmentId && s.managementId === null)
          if (!unassigned.length) return null
          return (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Додати відділ з «Без управління»</h3>
              {unassigned.map(s => (
                <div key={s.id} className="flex items-center gap-3 rounded-xl border border-dashed border-border px-4 py-2">
                  <span className="text-sm">📁</span>
                  <span className="text-sm flex-1 text-muted-foreground">{s.nameUk}</span>
                  <button onClick={() => moveSectionToManagement(s.id, mgmt.id)} className="px-3 py-1 rounded-lg bg-emerald-50 text-emerald-700 text-xs font-medium hover:bg-emerald-100 transition-colors">Перемістити сюди</button>
                </div>
              ))}
            </div>
          )
        })()}
      </div>
    )
  }

  const DetailSection = ({ section }: { section: Section }) => {
    const parentDept = rootDepts.find(d => d.id === section.parentId)
    const parentMgmt = section.managementId ? managements.find(m => m.id === section.managementId) : null
    return (
      <div className="space-y-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              {parentDept && (
                <><button onClick={() => selectNode({ type: 'dept', id: parentDept.id })} className="text-sm text-muted-foreground hover:text-foreground">{parentDept.nameUk}</button><span className="text-muted-foreground">/</span></>
              )}
              {parentMgmt && (
                <><button onClick={() => selectNode({ type: 'management', id: parentMgmt.id })} className="text-sm text-muted-foreground hover:text-foreground">{parentMgmt.nameUk}</button><span className="text-muted-foreground">/</span></>
              )}
              <span className="text-xl">📁</span>
              <h2 className="text-xl font-bold text-foreground">{section.nameUk}</h2>
            </div>
            <p className="text-sm text-muted-foreground mt-1">Код: {section.code} · {section.usersCount} співробітників</p>
          </div>
          {canManage && (
            <div className="flex gap-2 shrink-0">
              <button onClick={() => setModal({ type: 'create-user', departmentId: section.id })} className="px-3 py-1.5 rounded-lg bg-primary text-white text-xs font-medium hover:bg-primary/90 transition-colors">+ Акаунт</button>
              {isAdmin && (
                <button onClick={() => deleteItem('section', section.id, section.nameUk)} className="px-3 py-1.5 rounded-lg border border-rose-200 text-rose-600 text-xs hover:bg-rose-50 transition-colors">Видалити</button>
              )}
            </div>
          )}
        </div>

        {/* Leader assignment */}
        <div className="rounded-xl border border-border p-4 space-y-3">
          <h3 className="text-sm font-semibold">Керівництво відділу</h3>
          <div className="grid grid-cols-2 gap-3">
            {([
              { label: 'Керівник відділу', field: 'managerId' as const, current: section.manager?.id ?? null },
              { label: 'Діловод', field: 'clerkId' as const, current: section.clerk?.id ?? null },
            ]).map(({ label, field, current }) => (
              <div key={field} className="space-y-1">
                <label className="text-xs text-muted-foreground">{label}</label>
                <select
                  disabled={!canManage}
                  value={current || ''}
                  onChange={e => updateDeptLeader(section.id, field, e.target.value)}
                  className="w-full h-9 rounded-lg border border-border px-2 text-sm bg-background disabled:opacity-60"
                >
                  <option value="">— Не призначений —</option>
                  {allUsers.map(u => (
                    <option key={u.id} value={u.id}>{u.lastName} {u.firstName} ({ROLE_LABELS[u.role] || u.role})</option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </div>

        {/* Members */}
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Співробітники</h3>
          {membersLoading && <div className="text-sm text-muted-foreground py-4 text-center">Завантаження…</div>}
          {!membersLoading && members.length === 0 && (
            <div className="rounded-xl border border-dashed border-border py-6 text-center">
              <p className="text-sm text-muted-foreground">Немає співробітників</p>
            </div>
          )}
          {members.map(m => (
            <div key={m.id} className="flex items-center gap-3 rounded-xl border border-border px-4 py-3">
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary shrink-0">
                {m.lastName[0]}{m.firstName[0]}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{m.lastName} {m.firstName} {(m as any).patronymic || ''}</p>
                <p className="text-xs text-muted-foreground">{ROLE_LABELS[m.role] || m.role}{m.position ? ` · ${m.position.titleUk || m.position.title}` : ''}</p>
              </div>
              <span className={`text-[10px] px-2 py-0.5 rounded-full ${m.isActive !== false ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400' : 'bg-rose-100 text-rose-700'}`}>
                {m.isActive !== false ? 'Активний' : 'Неактивний'}
              </span>
            </div>
          ))}
        </div>
      </div>
    )
  }

  // ── Modal ─────────────────────────────────────────────────────────────────

  const Modal = () => {
    if (!modal) return null
    const isCreateDept = modal.type === 'create-dept'
    const isCreateMgmt = modal.type === 'create-management'
    const isCreateSection = modal.type === 'create-section'
    const isCreateUser = modal.type === 'create-user'

    let title = ''
    let onSubmit = async () => {}

    if (isCreateDept) { title = 'Новий департамент'; onSubmit = createDept }
    if (isCreateMgmt) { title = 'Нове управління'; onSubmit = () => createManagement((modal as any).parentDeptId) }
    if (isCreateSection) { title = 'Новий відділ'; onSubmit = () => createSection((modal as any).parentDeptId, (modal as any).managementId) }
    if (isCreateUser) { title = 'Новий акаунт'; onSubmit = createUser }

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center">
        <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setModal(null)} />
        <div className="relative bg-card rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6 space-y-5 max-h-[90vh] overflow-y-auto">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold">{title}</h3>
            <button onClick={() => setModal(null)} className="w-8 h-8 rounded-full hover:bg-secondary flex items-center justify-center text-muted-foreground">✕</button>
          </div>

          {error && <div className="rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800 px-4 py-3 text-sm text-rose-700 dark:text-rose-400">{error}</div>}

          <div className="space-y-3">
            {/* Dept form */}
            {isCreateDept && (<>
              <Field label="Назва департаменту *" value={cf.deptName} onChange={v => setCfField('deptName', v)} />
              <Field label="Код (напр. DEP01) *" value={cf.deptCode} onChange={v => setCfField('deptCode', v)} />
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Директор</label>
                <select value={cf.deptDirectorId} onChange={e => setCfField('deptDirectorId', e.target.value)} className="w-full h-9 rounded-lg border border-border px-2 text-sm bg-background">
                  <option value="">— Не призначений —</option>
                  {allUsers.filter(u => ['director', 'admin', 'deputy_director'].includes(u.role)).map(u => (
                    <option key={u.id} value={u.id}>{u.lastName} {u.firstName}</option>
                  ))}
                </select>
              </div>
            </>)}

            {/* Management form */}
            {isCreateMgmt && (<>
              <Field label="Назва управління *" value={cf.mgmtName} onChange={v => setCfField('mgmtName', v)} placeholder="напр. Управління цифровізації" />
            </>)}

            {/* Section form */}
            {isCreateSection && (<>
              <Field label="Назва відділу *" value={cf.sectionName} onChange={v => setCfField('sectionName', v)} />
              <Field label="Код (напр. SEC01) *" value={cf.sectionCode} onChange={v => setCfField('sectionCode', v)} />
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Управління</label>
                <div className="h-9 rounded-lg border border-border px-3 flex items-center text-sm text-muted-foreground bg-secondary/30">
                  {(modal as any).managementId
                    ? managements.find(m => m.id === (modal as any).managementId)?.nameUk || 'Вибрано'
                    : 'Без управління'}
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Керівник відділу</label>
                <select value={cf.sectionManagerId} onChange={e => setCfField('sectionManagerId', e.target.value)} className="w-full h-9 rounded-lg border border-border px-2 text-sm bg-background">
                  <option value="">— Не призначений —</option>
                  {allUsers.map(u => <option key={u.id} value={u.id}>{u.lastName} {u.firstName} ({ROLE_LABELS[u.role] || u.role})</option>)}
                </select>
              </div>
            </>)}

            {/* User form */}
            {isCreateUser && (<>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Прізвище *" value={cf.uLastName} onChange={v => setCfField('uLastName', v)} />
                <Field label="Ім'я *" value={cf.uFirstName} onChange={v => setCfField('uFirstName', v)} />
              </div>
              <Field label="По батькові" value={cf.uPatronymic} onChange={v => setCfField('uPatronymic', v)} />
              <Field label="Email *" type="email" value={cf.uEmail} onChange={v => setCfField('uEmail', v)} />
              <Field label="Табельний номер *" value={cf.uEmployeeId} onChange={v => setCfField('uEmployeeId', v)} placeholder="EMP001" />
              <Field label="Пароль (мін. 12 симв.) *" type="password" value={cf.uPassword} onChange={v => setCfField('uPassword', v)} />
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Роль *</label>
                <select value={cf.uRole} onChange={e => setCfField('uRole', e.target.value)} className="w-full h-9 rounded-lg border border-border px-2 text-sm bg-background">
                  {ALL_ROLES.map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Підрозділ</label>
                <select
                  value={cf.uDeptId || (modal as any).departmentId || ''}
                  onChange={e => setCfField('uDeptId', e.target.value)}
                  className="w-full h-9 rounded-lg border border-border px-2 text-sm bg-background"
                >
                  <option value="">— Без підрозділу —</option>
                  {rootDepts.map(d => <option key={d.id} value={d.id}>🏛 {d.nameUk}</option>)}
                  {sections.map(s => {
                    const parent = rootDepts.find(d => d.id === s.parentId)
                    return <option key={s.id} value={s.id}>📁 {s.nameUk} ({parent?.nameUk || ''})</option>
                  })}
                </select>
              </div>
            </>)}
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button onClick={() => setModal(null)} className="px-4 py-2 rounded-lg border border-border text-sm hover:bg-secondary transition-colors">Скасувати</button>
            <button onClick={onSubmit} disabled={saving} className="px-5 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-60">
              {saving ? 'Збереження…' : 'Зберегти'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  const Field = ({ label, value, onChange, type = 'text', placeholder = '' }: { label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string }) => (
    <div className="space-y-1">
      <label className="text-xs text-muted-foreground">{label}</label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        className="w-full h-9 rounded-lg border border-border px-3 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/40" />
    </div>
  )

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <DashboardLayout>
      <div className="flex h-[calc(100vh-64px)] overflow-hidden">

        {/* Left: Org tree */}
        <aside className="w-72 shrink-0 border-r border-border bg-card flex flex-col overflow-hidden">
          <div className="px-4 py-3 border-b border-border flex items-center justify-between shrink-0">
            <h2 className="text-sm font-bold text-foreground">Структура організації</h2>
            {isAdmin && (
              <button onClick={() => setModal({ type: 'create-dept' })}
                className="w-7 h-7 rounded-lg bg-primary text-white text-sm flex items-center justify-center hover:bg-primary/90 transition-colors">+</button>
            )}
          </div>

          <nav className="flex-1 overflow-y-auto p-2 space-y-0.5">
            {loading && (
              <div className="text-xs text-muted-foreground text-center py-8">Завантаження…</div>
            )}
            {!loading && rootDepts.length === 0 && (
              <div className="text-xs text-muted-foreground text-center py-8">Немає підрозділів</div>
            )}
            {rootDepts.map(dept => <TreeDept key={dept.id} dept={dept} />)}
          </nav>
        </aside>

        {/* Right: Detail panel */}
        <main className="flex-1 overflow-y-auto bg-background">
          {/* Success/error toast */}
          {(success || error) && (
            <div className={`mx-6 mt-4 rounded-xl border px-4 py-3 text-sm ${
              success ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-400'
                      : 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-950/30 dark:text-rose-400'}`}>
              {success || error}
            </div>
          )}

          <div className="p-6">
            {!selected && (
              <div className="flex flex-col items-center justify-center h-80 text-center">
                <div className="text-5xl mb-4">🏛</div>
                <h2 className="text-xl font-semibold text-foreground">Оберіть підрозділ</h2>
                <p className="text-sm text-muted-foreground mt-2 max-w-sm">
                  Натисніть на департамент, управління або відділ в дереві зліва щоб переглянути деталі та керувати структурою
                </p>
                {isAdmin && (
                  <button onClick={() => setModal({ type: 'create-dept' })} className="mt-6 px-5 py-2.5 rounded-xl bg-primary text-white font-medium hover:bg-primary/90 transition-colors">
                    + Новий департамент
                  </button>
                )}
              </div>
            )}

            {selectedDept && <DetailDept dept={selectedDept} />}
            {selectedMgmt && <DetailManagement mgmt={selectedMgmt} />}
            {selectedSection && <DetailSection section={selectedSection} />}
          </div>
        </main>

        {/* Users panel — right sidebar, show when account creation context */}
        {canManage && selected && (
          <aside className="w-56 shrink-0 border-l border-border bg-card flex flex-col overflow-hidden">
            <div className="px-4 py-3 border-b border-border shrink-0">
              <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wide">Дії</h3>
            </div>
            <div className="p-3 space-y-2">
              {selected.type === 'dept' && (<>
                <SideBtn icon="📂" label="+ Управління" onClick={() => setModal({ type: 'create-management', parentDeptId: selected.id })} />
                <SideBtn icon="📁" label="+ Відділ" onClick={() => setModal({ type: 'create-section', parentDeptId: selected.id })} />
                <SideBtn icon="👤" label="+ Акаунт" onClick={() => setModal({ type: 'create-user', departmentId: selected.id })} />
              </>)}
              {selected.type === 'management' && (() => {
                const m = managements.find(mg => mg.id === selected.id)
                return m ? <>
                  <SideBtn icon="📁" label="+ Відділ в управлінні" onClick={() => setModal({ type: 'create-section', parentDeptId: m.departmentId, managementId: m.id })} />
                  <SideBtn icon="👤" label="+ Акаунт" onClick={() => setModal({ type: 'create-user' })} />
                </> : null
              })()}
              {selected.type === 'section' && (<>
                <SideBtn icon="👤" label="+ Акаунт у відділ" onClick={() => setModal({ type: 'create-user', departmentId: selected.id })} />
              </>)}
              <div className="border-t border-border my-2" />
              <SideBtn icon="👤" label="+ Будь-який акаунт" onClick={() => setModal({ type: 'create-user' })} secondary />
            </div>
          </aside>
        )}
      </div>

      <Modal />
    </DashboardLayout>
  )
}

function SideBtn({ icon, label, onClick, secondary = false }: { icon: string; label: string; onClick: () => void; secondary?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-3 py-2 rounded-xl text-xs font-medium flex items-center gap-2 transition-colors ${
        secondary ? 'text-muted-foreground hover:bg-secondary' : 'bg-primary/5 text-primary hover:bg-primary/10'
      }`}
    >
      <span>{icon}</span>
      <span>{label}</span>
    </button>
  )
}
