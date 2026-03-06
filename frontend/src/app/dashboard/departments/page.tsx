'use client'

import { useEffect, useMemo, useState } from 'react'
import { DashboardLayout } from '@/components/dashboard-layout'
import { useAuthStore } from '@/store/auth-store'
import { getRoleLabel } from '@/lib/utils'

type Department = {
  id: string
  name: string
  nameUk: string
  code: string
  usersCount: number
  manager?: { id: string; firstName: string; lastName: string } | null
  director?: { id: string; firstName: string; lastName: string } | null
}

type TeamUser = {
  id: string
  firstName: string
  lastName: string
  email: string
  role: string
}

type UserOption = {
  id: string
  firstName: string
  lastName: string
  role: string
}

export default function DepartmentsPage() {
  const { user } = useAuthStore()
  const [departments, setDepartments] = useState<Department[]>([])
  const [selectedDepartmentId, setSelectedDepartmentId] = useState<string>('')
  const [team, setTeam] = useState<TeamUser[]>([])
  const [loading, setLoading] = useState(true)
  const [newDepartmentName, setNewDepartmentName] = useState('')
  const [newDepartmentCode, setNewDepartmentCode] = useState('')
  const [newDepartmentDirectorId, setNewDepartmentDirectorId] = useState('')
  const [newDepartmentManagerId, setNewDepartmentManagerId] = useState('')
  const [usersOptions, setUsersOptions] = useState<UserOption[]>([])
  const [selectedDirectorId, setSelectedDirectorId] = useState('')
  const [selectedManagerId, setSelectedManagerId] = useState('')
  const [savingLeads, setSavingLeads] = useState(false)
  const [newUserEmail, setNewUserEmail] = useState('')
  const [newUserFirstName, setNewUserFirstName] = useState('')
  const [newUserLastName, setNewUserLastName] = useState('')
  const [newUserRole, setNewUserRole] = useState<'specialist' | 'manager' | 'director'>('specialist')
  const [templateTitlePattern, setTemplateTitlePattern] = useState('ЗВІТ')
  const [templateHeaderPattern, setTemplateHeaderPattern] = useState('Про виконання роботи {{departmentName}}\\n{{period}}')
  const [templateAiPrompt, setTemplateAiPrompt] = useState('')
  const [templateSectionsRaw, setTemplateSectionsRaw] = useState('[\n  {"key":"workDone","title":"Виконана робота","required":true},\n  {"key":"achievements","title":"Досягнення","required":false},\n  {"key":"problems","title":"Проблемні питання","required":false},\n  {"key":"nextWeekPlan","title":"План наступного періоду","required":true}\n]')
  const [savingTemplate, setSavingTemplate] = useState(false)
  const [actionError, setActionError] = useState('')
  const [actionSuccess, setActionSuccess] = useState('')
  const accessToken = typeof window !== 'undefined' ? localStorage.getItem('vidlik-accessToken') : null

  const isAdmin = user?.role === 'admin'
  const isDirector = user?.role === 'director'

  const loadDepartments = async () => {
    if (!accessToken) return
    setLoading(true)
    const resp = await fetch('/api/v1/departments', { headers: { Authorization: `Bearer ${accessToken}` } })
    if (!resp.ok) {
      setLoading(false)
      return
    }
    const data = await resp.json()
    setDepartments(data || [])

    const directorVisible = isDirector ? (data || []).filter((d: Department) => d.id === user?.department?.id) : data || []
    const defaultDeptId = isDirector
      ? (user?.department?.id && directorVisible.some((d: Department) => d.id === user?.department?.id) ? user?.department?.id : directorVisible?.[0]?.id || '')
      : (data?.[0]?.id || '')
    setSelectedDepartmentId(defaultDeptId)
    setLoading(false)
  }

  const loadUsers = async () => {
    if (!accessToken || !isAdmin) return
    const resp = await fetch('/api/v1/users?limit=500', { headers: { Authorization: `Bearer ${accessToken}` } })
    if (!resp.ok) return
    const data = await resp.json()
    setUsersOptions((data?.data || []).map((u: any) => ({
      id: u.id,
      firstName: u.firstName,
      lastName: u.lastName,
      role: u.role,
    })))
  }

  const loadTeam = async (departmentId: string) => {
    if (!accessToken || !departmentId) return
    const resp = await fetch(`/api/v1/departments/${departmentId}/team`, { headers: { Authorization: `Bearer ${accessToken}` } })
    if (!resp.ok) return
    const data = await resp.json()
    setTeam(data || [])
  }

  useEffect(() => {
    loadDepartments()
    loadUsers()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, user?.id])

  useEffect(() => {
    if (selectedDepartmentId) {
      loadTeam(selectedDepartmentId)
      loadTemplate(selectedDepartmentId)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDepartmentId, accessToken])

  const selectedDepartment = useMemo(
    () => departments.find((d) => d.id === selectedDepartmentId),
    [departments, selectedDepartmentId],
  )

  const directors = useMemo(
    () => usersOptions.filter((userOption) => userOption.role === 'director'),
    [usersOptions],
  )

  const managers = useMemo(
    () => usersOptions.filter((userOption) => userOption.role === 'manager'),
    [usersOptions],
  )

  useEffect(() => {
    if (!selectedDepartment) return
    setSelectedDirectorId(selectedDepartment.director?.id || '')
    setSelectedManagerId(selectedDepartment.manager?.id || '')
  }, [selectedDepartment])

  const canManageEmployees = isDirector || isAdmin
  const canEditTemplate = isAdmin || isDirector || user?.role === 'manager'

  const createDepartment = async () => {
    if (!isAdmin || !accessToken || !newDepartmentName.trim() || !newDepartmentCode.trim()) return
    setActionError('')
    setActionSuccess('')
    const payload = {
      name: newDepartmentName.trim(),
      nameUk: newDepartmentName.trim(),
      code: newDepartmentCode.trim().toUpperCase(),
      directorId: newDepartmentDirectorId || undefined,
      managerId: newDepartmentManagerId || undefined,
    }
    const resp = await fetch('/api/v1/departments', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })
    if (resp.ok) {
      setNewDepartmentName('')
      setNewDepartmentCode('')
      setNewDepartmentDirectorId('')
      setNewDepartmentManagerId('')
      await loadDepartments()
      setActionSuccess('Підрозділ створено')
      return
    }
    const err = await resp.json().catch(() => null)
    setActionError(err?.message || 'Не вдалося створити підрозділ')
  }

  const saveDepartmentLeads = async () => {
    if (!isAdmin || !accessToken || !selectedDepartmentId) return
    setActionError('')
    setActionSuccess('')
    setSavingLeads(true)
    const payload = {
      directorId: selectedDirectorId || null,
      managerId: selectedManagerId || null,
    }
    const resp = await fetch(`/api/v1/departments/${selectedDepartmentId}`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })
    setSavingLeads(false)
    if (resp.ok) {
      await loadDepartments()
      await loadTeam(selectedDepartmentId)
      setActionSuccess('Керівництво підрозділу оновлено')
      return
    }
    const err = await resp.json().catch(() => null)
    setActionError(err?.message || 'Не вдалося оновити керівництво підрозділу')
  }

  const addEmployee = async () => {
    if (!canManageEmployees || !accessToken || !selectedDepartmentId) return
    if (!newUserEmail.trim() || !newUserFirstName.trim() || !newUserLastName.trim()) return
    setActionError('')
    setActionSuccess('')

    const payload = {
      email: newUserEmail.trim(),
      employeeId: `EMP-${Date.now().toString().slice(-6)}-${Math.floor(Math.random() * 900 + 100)}`,
      firstName: newUserFirstName.trim(),
      lastName: newUserLastName.trim(),
      role: newUserRole,
      departmentId: selectedDepartmentId,
      password: 'ChangeMe123!',
    }

    const resp = await fetch('/api/v1/users', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })

    if (resp.ok) {
      setNewUserEmail('')
      setNewUserFirstName('')
      setNewUserLastName('')
      await loadTeam(selectedDepartmentId)
      setActionSuccess('Співробітника додано')
      return
    }
    const err = await resp.json().catch(() => null)
    setActionError(err?.message || 'Не вдалося додати співробітника')
  }

  const deleteEmployee = async (id: string) => {
    if (!canManageEmployees || !accessToken) return
    const resp = await fetch(`/api/v1/users/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (resp.ok) {
      await loadTeam(selectedDepartmentId)
      setActionSuccess('Співробітника видалено')
      return
    }
    const err = await resp.json().catch(() => null)
    setActionError(err?.message || 'Не вдалося видалити співробітника')
  }

  const loadTemplate = async (departmentId: string) => {
    if (!accessToken || !departmentId) return
    const resp = await fetch(`/api/v1/departments/${departmentId}/report-template`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (!resp.ok) return
    const data = await resp.json()
    setTemplateTitlePattern(data?.titlePattern || 'ЗВІТ')
    setTemplateHeaderPattern(data?.headerPattern || 'Про виконання роботи {{departmentName}}\\n{{period}}')
    setTemplateAiPrompt(data?.aiPrompt || '')
    setTemplateSectionsRaw(JSON.stringify(data?.sectionSchema || [], null, 2))
  }

  const saveTemplate = async () => {
    if (!accessToken || !selectedDepartmentId) return
    setSavingTemplate(true)
    let parsedSections: any = []
    try {
      parsedSections = JSON.parse(templateSectionsRaw || '[]')
    } catch {
      setActionError('JSON секцій має некоректний формат')
      setSavingTemplate(false)
      return
    }

    const resp = await fetch(`/api/v1/departments/${selectedDepartmentId}/report-template`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        titlePattern: templateTitlePattern,
        headerPattern: templateHeaderPattern,
        aiPrompt: templateAiPrompt,
        sectionSchema: parsedSections,
      }),
    })
    setSavingTemplate(false)
    if (resp.ok) {
      await loadTemplate(selectedDepartmentId)
      setActionSuccess('Шаблон звіту збережено')
      return
    }
    const err = await resp.json().catch(() => null)
    setActionError(err?.message || 'Не вдалося зберегти шаблон')
  }

  return (
    <DashboardLayout>
      <div className="max-w-7xl mx-auto space-y-6">
        {actionError && <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{actionError}</div>}
        {actionSuccess && <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{actionSuccess}</div>}
        <div>
          <h1 className="text-2xl font-semibold font-display">Підрозділи</h1>
          <p className="text-slate-500 mt-1">Керування підрозділами та співробітниками</p>
        </div>

        {isAdmin && (
          <div className="rounded-2xl border border-slate-200 bg-white p-4 grid grid-cols-1 md:grid-cols-5 gap-3">
            <input className="h-10 rounded-lg border border-slate-300 px-3 text-sm" placeholder="Назва підрозділу" value={newDepartmentName} onChange={(e) => setNewDepartmentName(e.target.value)} />
            <input className="h-10 rounded-lg border border-slate-300 px-3 text-sm" placeholder="Код (напр. IT)" value={newDepartmentCode} onChange={(e) => setNewDepartmentCode(e.target.value)} />
            <select className="h-10 rounded-lg border border-slate-300 px-3 text-sm" value={newDepartmentDirectorId} onChange={(e) => setNewDepartmentDirectorId(e.target.value)}>
              <option value="">Директор (опційно)</option>
              {directors.map((d) => (
                <option key={d.id} value={d.id}>{d.firstName} {d.lastName}</option>
              ))}
            </select>
            <select className="h-10 rounded-lg border border-slate-300 px-3 text-sm" value={newDepartmentManagerId} onChange={(e) => setNewDepartmentManagerId(e.target.value)}>
              <option value="">Керівник (опційно)</option>
              {managers.map((m) => (
                <option key={m.id} value={m.id}>{m.firstName} {m.lastName}</option>
              ))}
            </select>
            <button onClick={createDepartment} className="h-10 rounded-lg bg-primary text-white text-sm font-medium">Створити підрозділ</button>
          </div>
        )}

        {loading ? <div className="rounded-xl border border-slate-200 bg-white px-4 py-6 text-sm text-slate-500">Завантаження...</div> : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-100 text-sm font-semibold">Підрозділи</div>
              {(isDirector ? departments.filter((d) => d.id === user?.department?.id) : departments).map((department) => (
                <button
                  key={department.id}
                  onClick={() => setSelectedDepartmentId(department.id)}
                  className={`w-full text-left px-4 py-3 border-b border-slate-100 text-sm ${selectedDepartmentId === department.id ? 'bg-slate-50 font-medium' : ''}`}
                >
                  <div>{department.nameUk || department.name}</div>
                  <div className="text-xs text-slate-500 mt-1">{department.code} • {department.usersCount} осіб</div>
                  <div className="text-xs text-slate-400 mt-1">
                    Керівник: {department.manager ? `${department.manager.firstName} ${department.manager.lastName}` : '-'} • Директор: {department.director ? `${department.director.firstName} ${department.director.lastName}` : '-'}
                  </div>
                </button>
              ))}
            </div>

            <div className="lg:col-span-2 rounded-2xl border border-slate-200 bg-white overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-100 text-sm font-semibold">Команда {selectedDepartment ? `(${selectedDepartment.nameUk || selectedDepartment.name})` : ''}</div>

              {isAdmin && selectedDepartmentId && (
                <div className="p-4 grid grid-cols-1 md:grid-cols-3 gap-3 border-b border-slate-100 bg-slate-50">
                  <select className="h-10 rounded-lg border border-slate-300 px-3 text-sm" value={selectedDirectorId} onChange={(e) => setSelectedDirectorId(e.target.value)}>
                    <option value="">Директор не призначений</option>
                    {directors.map((d) => (
                      <option key={d.id} value={d.id}>{d.firstName} {d.lastName}</option>
                    ))}
                  </select>
                  <select className="h-10 rounded-lg border border-slate-300 px-3 text-sm" value={selectedManagerId} onChange={(e) => setSelectedManagerId(e.target.value)}>
                    <option value="">Керівник не призначений</option>
                    {managers.map((m) => (
                      <option key={m.id} value={m.id}>{m.firstName} {m.lastName}</option>
                    ))}
                  </select>
                  <button disabled={savingLeads} onClick={saveDepartmentLeads} className="h-10 rounded-lg border border-slate-300 text-sm font-medium disabled:opacity-60">
                    {savingLeads ? 'Збереження...' : 'Зберегти керівництво'}
                  </button>
                </div>
              )}

              {canManageEmployees && selectedDepartmentId && (
                <div className="p-4 grid grid-cols-1 md:grid-cols-4 gap-3 border-b border-slate-100">
                  <input className="h-10 rounded-lg border border-slate-300 px-3 text-sm" placeholder="Email" value={newUserEmail} onChange={(e) => setNewUserEmail(e.target.value)} />
                  <input className="h-10 rounded-lg border border-slate-300 px-3 text-sm" placeholder="Ім'я" value={newUserFirstName} onChange={(e) => setNewUserFirstName(e.target.value)} />
                  <input className="h-10 rounded-lg border border-slate-300 px-3 text-sm" placeholder="Прізвище" value={newUserLastName} onChange={(e) => setNewUserLastName(e.target.value)} />
                  <select className="h-10 rounded-lg border border-slate-300 px-3 text-sm" value={newUserRole} onChange={(e) => setNewUserRole(e.target.value as 'specialist' | 'manager' | 'director')}>
                    <option value="specialist">{getRoleLabel('specialist')}</option>
                    <option value="manager">{getRoleLabel('manager')}</option>
                    {isAdmin && <option value="director">{getRoleLabel('director')}</option>}
                  </select>
                  <button onClick={addEmployee} className="md:col-span-4 h-10 rounded-lg bg-primary text-white text-sm font-medium">Додати співробітника</button>
                </div>
              )}

              <div>
                {team.length === 0 && <div className="px-4 py-6 text-sm text-slate-500">Порожньо</div>}
                {team.map((member) => (
                  <div key={member.id} className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">{member.firstName} {member.lastName}</p>
                      <p className="text-xs text-slate-500">{member.email} • {getRoleLabel(member.role)}</p>
                    </div>
                    {canManageEmployees && member.role !== 'director' && member.role !== 'admin' && (
                      <button onClick={() => deleteEmployee(member.id)} className="text-sm text-rose-600 hover:underline">Видалити</button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {selectedDepartmentId && canEditTemplate && (
              <div className="lg:col-span-3 rounded-2xl border border-slate-200 bg-white overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-100 text-sm font-semibold">
                  Конструктор шаблону звіту ({selectedDepartment?.nameUk || selectedDepartment?.name || '-'})
                </div>
                <div className="p-4 space-y-3">
                  <input
                    className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm"
                    value={templateTitlePattern}
                    onChange={(e) => setTemplateTitlePattern(e.target.value)}
                    placeholder="Заголовок (напр. ЗВІТ)"
                  />
                  <textarea
                    rows={2}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    value={templateHeaderPattern}
                    onChange={(e) => setTemplateHeaderPattern(e.target.value)}
                    placeholder="Шапка: можна {{departmentName}}, {{period}}, {{title}}, {{author}}"
                  />
                  <textarea
                    rows={5}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    value={templateAiPrompt}
                    onChange={(e) => setTemplateAiPrompt(e.target.value)}
                    placeholder="Додатковий AI-промпт для цього підрозділу"
                  />
                  <textarea
                    rows={8}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono"
                    value={templateSectionsRaw}
                    onChange={(e) => setTemplateSectionsRaw(e.target.value)}
                    placeholder='JSON секцій'
                  />
                  <button
                    onClick={saveTemplate}
                    disabled={savingTemplate}
                    className="h-10 rounded-lg border border-slate-300 px-4 text-sm font-medium disabled:opacity-60"
                  >
                    {savingTemplate ? 'Збереження...' : 'Зберегти шаблон'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </DashboardLayout>
  )
}
