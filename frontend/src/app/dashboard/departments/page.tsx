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
  parentId?: string | null
  divisionTag?: string | null
  usersCount: number
  manager?: { id: string; firstName: string; lastName: string } | null
  clerk?: { id: string; firstName: string; lastName: string } | null
  director?: { id: string; firstName: string; lastName: string } | null
}

type TeamUser = {
  id: string
  firstName: string
  lastName: string
  email: string
  role: string
  department?: {
    id: string
    nameUk?: string
    code?: string
  } | null
}

type UserOption = {
  id: string
  firstName: string
  lastName: string
  role: string
  departmentId?: string | null
  scopeDepartmentIds?: string[]
}

export default function DepartmentsPage() {
  const { user } = useAuthStore()
  const [departments, setDepartments] = useState<Department[]>([])
  const [selectedDepartmentId, setSelectedDepartmentId] = useState<string>('')
  const [team, setTeam] = useState<TeamUser[]>([])
  const [loading, setLoading] = useState(true)
  const [newRootDepartmentName, setNewRootDepartmentName] = useState('')
  const [newRootDepartmentCode, setNewRootDepartmentCode] = useState('')
  const [newRootDepartmentDirectorId, setNewRootDepartmentDirectorId] = useState('')
  const [newSectionName, setNewSectionName] = useState('')
  const [newSectionCode, setNewSectionCode] = useState('')
  const [newSectionParentId, setNewSectionParentId] = useState('')
  const [newSectionManagerId, setNewSectionManagerId] = useState('')
  const [newSectionClerkId, setNewSectionClerkId] = useState('')
  const [newSectionDivisionTag, setNewSectionDivisionTag] = useState('')
  const [newManagementName, setNewManagementName] = useState('')
  const [selectedManagementTag, setSelectedManagementTag] = useState('')
  const [managementSourceTag, setManagementSourceTag] = useState('')
  const [managementDepartmentIds, setManagementDepartmentIds] = useState<string[]>([])
  const [managementDeputyIds, setManagementDeputyIds] = useState<string[]>([])
  const [savingManagement, setSavingManagement] = useState(false)
  const [editingDivisionTag, setEditingDivisionTag] = useState('')
  const [usersOptions, setUsersOptions] = useState<UserOption[]>([])
  const [selectedDirectorId, setSelectedDirectorId] = useState('')
  const [selectedManagerId, setSelectedManagerId] = useState('')
  const [selectedClerkId, setSelectedClerkId] = useState('')
  const [savingLeads, setSavingLeads] = useState(false)
  const [newUserEmail, setNewUserEmail] = useState('')
  const [newUserFirstName, setNewUserFirstName] = useState('')
  const [newUserLastName, setNewUserLastName] = useState('')
  const [newUserRole, setNewUserRole] = useState<
    'specialist' | 'manager' | 'clerk' | 'director' | 'deputy_director' | 'deputy_head' | 'lawyer' | 'accountant' | 'hr'
  >('specialist')
  const [selectedExistingUserId, setSelectedExistingUserId] = useState('')
  const [assigningExistingUser, setAssigningExistingUser] = useState(false)
  const [expandedDepartmentIds, setExpandedDepartmentIds] = useState<string[]>([])
  const [selectedDeputyDirectorIds, setSelectedDeputyDirectorIds] = useState<string[]>([])
  const [selectedDeputyHeadId, setSelectedDeputyHeadId] = useState('')
  const [savingDeputyScope, setSavingDeputyScope] = useState(false)
  const [actionError, setActionError] = useState('')
  const [actionSuccess, setActionSuccess] = useState('')
  const accessToken = typeof window !== 'undefined' ? localStorage.getItem('vidlik-accessToken') : null

  useEffect(() => {
    if (!actionSuccess) return
    const t = setTimeout(() => setActionSuccess(''), 3000)
    return () => clearTimeout(t)
  }, [actionSuccess])

  const isAdmin = user?.role === 'admin'
  const isDirector = user?.role === 'director' || user?.role === 'deputy_director'
  const isScopedReader = ['specialist', 'manager', 'clerk', 'director', 'deputy_director', 'lawyer', 'accountant', 'hr'].includes(user?.role || '')
  const visibleDepartments = useMemo(() => {
    if (!isScopedReader || !user?.department?.id) return departments
    const current = departments.find((d) => d.id === user.department?.id)
    const rootId = current?.parentId || current?.id || user.department.id
    return departments.filter((d) => d.id === rootId || d.parentId === rootId)
  }, [departments, isScopedReader, user?.department?.id])
  const rootDepartments = useMemo(
    () => visibleDepartments.filter((department) => !department.parentId),
    [visibleDepartments],
  )
  const childDepartmentsMap = useMemo(() => {
    const map = new Map<string, Department[]>()
    visibleDepartments.forEach((department) => {
      if (!department.parentId) return
      const current = map.get(department.parentId) || []
      current.push(department)
      map.set(department.parentId, current)
    })
    for (const [key, items] of map.entries()) {
      map.set(key, [...items].sort((a, b) => (a.nameUk || a.name).localeCompare((b.nameUk || b.name), 'uk')))
    }
    return map
  }, [visibleDepartments])

  // Групування дочірніх відділів по divisionTag (для відображення всередині департаменту)
  const groupChildrenByDivision = (children: Department[]): { tag: string | null; items: Department[] }[] => {
    const groups = new Map<string, Department[]>()
    for (const child of children) {
      const tag = child.divisionTag || ''
      const existing = groups.get(tag) || []
      existing.push(child)
      groups.set(tag, existing)
    }
    // Відділи без управління йдуть останніми
    const result: { tag: string | null; items: Department[] }[] = []
    for (const [tag, items] of groups.entries()) {
      if (tag) result.push({ tag, items })
    }
    result.sort((a, b) => (a.tag || '').localeCompare(b.tag || '', 'uk'))
    const untagged = groups.get('') || []
    if (untagged.length > 0) result.push({ tag: null, items: untagged })
    return result
  }
  const selectedRootDepartmentId = useMemo(() => {
    if (!selectedDepartmentId) return ''
    const current = departments.find((d) => d.id === selectedDepartmentId)
    return current?.parentId || current?.id || ''
  }, [departments, selectedDepartmentId])
  const selectedRootDepartment = useMemo(
    () => departments.find((d) => d.id === selectedRootDepartmentId),
    [departments, selectedRootDepartmentId],
  )
  const deputyDirectorCandidates = useMemo(() => {
    if (!selectedRootDepartmentId) return []
    const rootAndChildren = new Set<string>([
      selectedRootDepartmentId,
      ...(childDepartmentsMap.get(selectedRootDepartmentId) || []).map((d) => d.id),
    ])
    return usersOptions
      .filter((candidate) => {
        if (!candidate.departmentId || !rootAndChildren.has(candidate.departmentId)) return false
        return !['admin', 'director', 'deputy_head'].includes(candidate.role)
      })
      .sort((a, b) => `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`, 'uk'))
  }, [selectedRootDepartmentId, childDepartmentsMap, usersOptions])
  const managementTags = useMemo(() => {
    const children = childDepartmentsMap.get(selectedRootDepartmentId) || []
    const tags = Array.from(new Set(children.map((d) => (d.divisionTag || '').trim()).filter(Boolean)))
    return tags.sort((a, b) => a.localeCompare(b, 'uk'))
  }, [childDepartmentsMap, selectedRootDepartmentId])

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

    const scopedVisible = isScopedReader && user?.department?.id
      ? (data || []).filter((d: Department) => {
          const current = (data || []).find((item: Department) => item.id === user.department?.id)
          const rootId = current?.parentId || current?.id || user.department?.id
          return d.id === rootId || d.parentId === rootId
        })
      : data || []
    const defaultDeptId = isScopedReader
      ? (user?.department?.id && scopedVisible.some((d: Department) => d.id === user?.department?.id)
          ? user?.department?.id
          : scopedVisible?.[0]?.id || '')
      : (data?.[0]?.id || '')
    setSelectedDepartmentId(defaultDeptId)
    setLoading(false)
  }

  const loadUsers = async () => {
    if (!accessToken || (!isAdmin && !isDirector)) return
    // Director can assign people from existing accounts, not only root department members.
    const query = '/api/v1/users?limit=100'
    const resp = await fetch(query, { headers: { Authorization: `Bearer ${accessToken}` } })
    if (!resp.ok) return
    const data = await resp.json()
    setUsersOptions((data?.data || []).map((u: any) => ({
      id: u.id,
      firstName: u.firstName,
      lastName: u.lastName,
      role: u.role,
      departmentId: u.department?.id || null,
      scopeDepartmentIds: Array.isArray(u.scopeDepartmentIds) ? u.scopeDepartmentIds : [],
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
    () => usersOptions.filter((userOption) => userOption.role === 'manager' || userOption.role === 'deputy_director'),
    [usersOptions],
  )
  const clerks = useMemo(
    () => usersOptions.filter((userOption) => userOption.role === 'clerk'),
    [usersOptions],
  )
  const deputyDirectors = useMemo(
    () => usersOptions.filter((userOption) => userOption.role === 'deputy_director'),
    [usersOptions],
  )
  const deputyHeads = useMemo(
    () => usersOptions.filter((userOption) => userOption.role === 'deputy_head'),
    [usersOptions],
  )
  const transferableUsers = useMemo(() => {
    if (!selectedDepartmentId) return []
    const teamIds = new Set(team.map((member) => member.id))
    return usersOptions.filter((u) =>
      u.role !== 'admin' &&
      u.role !== 'deputy_head' &&
      u.role !== 'director' &&
      !teamIds.has(u.id) &&
      u.departmentId !== selectedDepartmentId,
    )
  }, [usersOptions, team, selectedDepartmentId])

  useEffect(() => {
    if (!selectedDepartment) return
    setSelectedManagerId(selectedDepartment.manager?.id || '')
    setSelectedClerkId(selectedDepartment.clerk?.id || '')
    setEditingDivisionTag(selectedDepartment.divisionTag || '')
  }, [selectedDepartment])

  useEffect(() => {
    if (!selectedRootDepartment) return
    setSelectedDirectorId(selectedRootDepartment.director?.id || '')
  }, [selectedRootDepartment])

  useEffect(() => {
    if (!isAdmin && !isDirector) return
    if (isDirector) {
      setNewSectionParentId(user?.department?.id || '')
      return
    }
    if (selectedRootDepartmentId) {
      setNewSectionParentId(selectedRootDepartmentId)
      return
    }
    if (rootDepartments.length > 0) {
      setNewSectionParentId(rootDepartments[0].id)
    }
  }, [isAdmin, isDirector, selectedRootDepartmentId, rootDepartments, user?.department?.id])

  useEffect(() => {
    if (!selectedRootDepartmentId) {
      setSelectedDeputyDirectorIds([])
      setSelectedDeputyHeadId('')
      return
    }
    const rootAndChildren = new Set<string>([
      selectedRootDepartmentId,
      ...(childDepartmentsMap.get(selectedRootDepartmentId) || []).map((d) => d.id),
    ])
    const scopedDeputies = usersOptions
      .filter((u) => u.role === 'deputy_director')
      .filter((d) => {
        const scope = Array.isArray(d.scopeDepartmentIds) ? d.scopeDepartmentIds : []
        return scope.some((id) => rootAndChildren.has(id))
      })
      .map((d) => d.id)
    setSelectedDeputyDirectorIds(scopedDeputies)

    const deputyHeads = usersOptions.filter((u) => u.role === 'deputy_head')
    const scopedHead = deputyHeads.find((u) => {
      const scope = Array.isArray(u.scopeDepartmentIds) ? u.scopeDepartmentIds : []
      return scope.some((id) => rootAndChildren.has(id))
    })
    setSelectedDeputyHeadId(scopedHead?.id || '')
  }, [selectedRootDepartmentId, childDepartmentsMap, usersOptions])

  useEffect(() => {
    setNewManagementName('')
    setSelectedManagementTag('')
    setManagementSourceTag('')
    setManagementDepartmentIds([])
    setManagementDeputyIds([])
  }, [selectedRootDepartmentId])

  useEffect(() => {
    if (!selectedManagementTag) return
    const children = childDepartmentsMap.get(selectedRootDepartmentId) || []
    const managementDepartments = children.filter((d) => (d.divisionTag || '').trim() === selectedManagementTag)
    const depIds = managementDepartments.map((d) => d.id)
    const depSet = new Set(depIds)
    const deputies = deputyDirectorCandidates
      .filter((candidate) => {
        const scope = Array.isArray(candidate.scopeDepartmentIds) ? candidate.scopeDepartmentIds : []
        return scope.some((id) => depSet.has(id))
      })
      .map((d) => d.id)

    setManagementSourceTag(selectedManagementTag)
    setNewManagementName(selectedManagementTag)
    setManagementDepartmentIds(depIds)
    setManagementDeputyIds(deputies)
  }, [selectedManagementTag, childDepartmentsMap, selectedRootDepartmentId, deputyDirectorCandidates])

  const canManageEmployees = isDirector || isAdmin

  const createRootDepartment = async () => {
    if (!isAdmin || !accessToken || !newRootDepartmentName.trim() || !newRootDepartmentCode.trim()) return
    setActionError('')
    setActionSuccess('')
    const payload = {
      name: newRootDepartmentName.trim(),
      nameUk: newRootDepartmentName.trim(),
      code: newRootDepartmentCode.trim().toUpperCase(),
      directorId: newRootDepartmentDirectorId || undefined,
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
      setNewRootDepartmentName('')
      setNewRootDepartmentCode('')
      setNewRootDepartmentDirectorId('')
      await loadDepartments()
      setActionSuccess('Департамент створено')
      return
    }
    const err = await resp.json().catch(() => null)
    setActionError(err?.message || 'Не вдалося створити департамент')
  }

  const createSection = async () => {
    if ((!isAdmin && !isDirector) || !accessToken || !newSectionName.trim() || !newSectionCode.trim()) return
    const parentId = isDirector ? (user?.department?.id || '') : newSectionParentId
    if (!parentId) {
      setActionError('Спочатку оберіть департамент для створення відділу')
      return
    }

    setActionError('')
    setActionSuccess('')
    const payload = {
      name: newSectionName.trim(),
      nameUk: newSectionName.trim(),
      code: newSectionCode.trim().toUpperCase(),
      parentId,
      directorId: isDirector ? user?.id : undefined,
      managerId: newSectionManagerId || undefined,
      clerkId: newSectionClerkId || undefined,
      divisionTag: newSectionDivisionTag.trim() || undefined,
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
      setNewSectionName('')
      setNewSectionCode('')
      setNewSectionManagerId('')
      setNewSectionClerkId('')
      setNewSectionDivisionTag('')
      await loadDepartments()
      setActionSuccess('Відділ створено всередині департаменту')
      return
    }
    const err = await resp.json().catch(() => null)
    setActionError(err?.message || 'Не вдалося створити відділ')
  }

  const saveDepartmentLeads = async () => {
    if ((!isAdmin && !isDirector) || !accessToken || !selectedDepartmentId) return
    setActionError('')
    setActionSuccess('')
    setSavingLeads(true)
    const payload = {
      managerId: selectedManagerId || null,
      clerkId: selectedClerkId || null,
      divisionTag: editingDivisionTag.trim() || null,
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
      setActionSuccess('Керівника відділу, діловода та управління оновлено')
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
      setActionSuccess('Співробітника деактивовано')
      return
    }
    const err = await resp.json().catch(() => null)
    setActionError(err?.message || 'Не вдалося видалити співробітника')
  }

  const resetEmployeePassword = async (id: string, fullName: string) => {
    if (!isAdmin || !accessToken) return
    const nextPassword = window.prompt(`Новий пароль для ${fullName} (мінімум 12 символів):`, '')
    if (!nextPassword) return
    if (nextPassword.length < 12) {
      setActionError('Пароль має містити щонайменше 12 символів')
      return
    }

    setActionError('')
    setActionSuccess('')
    const resp = await fetch(`/api/v1/users/${id}/password`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ password: nextPassword }),
    })

    if (resp.ok) {
      setActionSuccess('Пароль користувача змінено')
      return
    }
    const err = await resp.json().catch(() => null)
    setActionError(err?.message || 'Не вдалося змінити пароль')
  }

  const assignExistingEmployee = async () => {
    if (!canManageEmployees || !accessToken || !selectedDepartmentId || !selectedExistingUserId) return
    setActionError('')
    setActionSuccess('')
    setAssigningExistingUser(true)
    const resp = await fetch(`/api/v1/users/${selectedExistingUserId}`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ departmentId: selectedDepartmentId }),
    })
    setAssigningExistingUser(false)
    if (resp.ok) {
      setSelectedExistingUserId('')
      await loadTeam(selectedDepartmentId)
      await loadDepartments()
      await loadUsers()
      setActionSuccess('Співробітника переведено у вибраний підрозділ')
      return
    }
    const err = await resp.json().catch(() => null)
    setActionError(err?.message || 'Не вдалося перевести співробітника')
  }

  const saveDepartmentSupervision = async () => {
    if (!accessToken || !selectedRootDepartmentId || (!isAdmin && !isDirector)) return
    setActionError('')
    setActionSuccess('')
    setSavingDeputyScope(true)

    const rootChildrenIds = (childDepartmentsMap.get(selectedRootDepartmentId) || []).map((d) => d.id)
    const scopeIds = Array.from(new Set([selectedRootDepartmentId, ...rootChildrenIds]))

    const updateDirectorResp = await fetch(`/api/v1/departments/${selectedRootDepartmentId}`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        directorId: isDirector ? user?.id : (selectedDirectorId || null),
      }),
    })

    if (!updateDirectorResp.ok) {
      setSavingDeputyScope(false)
      const err = await updateDirectorResp.json().catch(() => null)
      setActionError(err?.message || 'Не вдалося оновити директора департаменту')
      return
    }

    const deputyDirectorSet = new Set(selectedDeputyDirectorIds)
    const usersById = new Map(usersOptions.map((option) => [option.id, option]))
    const deputyCandidateIds = new Set<string>([
      ...deputyDirectorCandidates.map((candidate) => candidate.id),
      ...selectedDeputyDirectorIds,
    ])
    const deputyUpdates = Array.from(deputyCandidateIds)
      .map((id) => usersById.get(id))
      .filter(Boolean)
      .map((candidate) => {
        const selected = deputyDirectorSet.has(candidate!.id)
        const currentScope = Array.isArray(candidate!.scopeDepartmentIds) ? candidate!.scopeDepartmentIds : []
        return fetch(`/api/v1/users/${candidate!.id}`, {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            role: selected ? 'deputy_director' : candidate!.role,
            departmentId: candidate!.departmentId || selectedRootDepartmentId,
            scopeDepartmentIds: selected ? scopeIds : currentScope,
          }),
        })
      })
    const deputyResults = await Promise.all(deputyUpdates)
    if (deputyResults.some((resp) => !resp.ok)) {
      setSavingDeputyScope(false)
      setActionError('Не вдалося зберегти налаштування заступників директора')
      return
    }

    if (selectedDeputyHeadId) {
      const deputyHeadResp = await fetch(`/api/v1/users/${selectedDeputyHeadId}`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          departmentId: selectedRootDepartmentId,
          scopeDepartmentIds: scopeIds,
        }),
      })
      if (!deputyHeadResp.ok) {
        setSavingDeputyScope(false)
        const err = await deputyHeadResp.json().catch(() => null)
        setActionError(err?.message || 'Не вдалося закріпити заступника голови')
        return
      }
    }
    setSavingDeputyScope(false)
    await loadUsers()
    await loadDepartments()
    setActionSuccess('Керівництво департаменту та зони курації оновлено')
  }

  const saveManagementScope = async () => {
    if (!accessToken || !selectedRootDepartmentId || (!isAdmin && !isDirector)) return
    const managementName = newManagementName.trim()
    if (!managementName) {
      setActionError('Вкажіть назву управління')
      return
    }
    if (managementDepartmentIds.length === 0) {
      setActionError('Оберіть хоча б один відділ для управління')
      return
    }

    setActionError('')
    setActionSuccess('')
    setSavingManagement(true)

    const rootChildren = childDepartmentsMap.get(selectedRootDepartmentId) || []
    const selectedSet = new Set(managementDepartmentIds)
    const sameTagChildren = rootChildren.filter((d) => (d.divisionTag || '').trim() === (managementSourceTag || managementName))

    const departmentUpdates = rootChildren
      .filter((d) => selectedSet.has(d.id) || sameTagChildren.some((st) => st.id === d.id))
      .map((dep) =>
        fetch(`/api/v1/departments/${dep.id}`, {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            divisionTag: selectedSet.has(dep.id) ? managementName : null,
          }),
        }),
      )
    const departmentResults = await Promise.all(departmentUpdates)
    if (departmentResults.some((resp) => !resp.ok)) {
      setSavingManagement(false)
      setActionError('Не вдалося оновити склад управління')
      return
    }

    const usersById = new Map(usersOptions.map((u) => [u.id, u]))
    const deputyUpdates = managementDeputyIds
      .map((id) => usersById.get(id))
      .filter(Boolean)
      .map((candidate) =>
        fetch(`/api/v1/users/${candidate!.id}`, {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            role: 'deputy_director',
            departmentId: selectedRootDepartmentId,
            scopeDepartmentIds: Array.from(new Set([selectedRootDepartmentId, ...managementDepartmentIds])),
          }),
        }),
      )
    const deputyResults = await Promise.all(deputyUpdates)
    if (deputyResults.some((resp) => !resp.ok)) {
      setSavingManagement(false)
      setActionError('Не вдалося призначити заступника(ів) директора до управління')
      return
    }

    setSavingManagement(false)
    await loadUsers()
    await loadDepartments()
    setSelectedManagementTag(managementName)
    setManagementSourceTag(managementName)
    setActionSuccess('Управління та його склад збережено')
  }

  const deleteManagement = async () => {
    if (!accessToken || !selectedRootDepartmentId || !managementSourceTag || (!isAdmin && !isDirector)) return
    const ok = window.confirm(`Видалити управління "${managementSourceTag}"?`)
    if (!ok) return

    setSavingManagement(true)
    setActionError('')
    setActionSuccess('')

    const children = childDepartmentsMap.get(selectedRootDepartmentId) || []
    const targetDepartments = children.filter((d) => (d.divisionTag || '').trim() === managementSourceTag)
    const depIds = targetDepartments.map((d) => d.id)
    const depSet = new Set(depIds)

    const depResults = await Promise.all(
      targetDepartments.map((dep) =>
        fetch(`/api/v1/departments/${dep.id}`, {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ divisionTag: null }),
        }),
      ),
    )
    if (depResults.some((r) => !r.ok)) {
      setSavingManagement(false)
      setActionError('Не вдалося видалити управління')
      return
    }

    const deputyToClean = deputyDirectorCandidates.filter((candidate) => {
      const scope = Array.isArray(candidate.scopeDepartmentIds) ? candidate.scopeDepartmentIds : []
      return scope.some((id) => depSet.has(id))
    })
    const deputyResults = await Promise.all(
      deputyToClean.map((candidate) => {
        const scope = Array.isArray(candidate.scopeDepartmentIds) ? candidate.scopeDepartmentIds : []
        const cleaned = scope.filter((id) => !depSet.has(id))
        return fetch(`/api/v1/users/${candidate.id}`, {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            scopeDepartmentIds: cleaned.length > 0 ? cleaned : [selectedRootDepartmentId],
          }),
        })
      }),
    )
    if (deputyResults.some((r) => !r.ok)) {
      setSavingManagement(false)
      setActionError('Не вдалося оновити замів директора після видалення управління')
      return
    }

    await loadUsers()
    await loadDepartments()
    setSelectedManagementTag('')
    setManagementSourceTag('')
    setNewManagementName('')
    setManagementDepartmentIds([])
    setManagementDeputyIds([])
    setSavingManagement(false)
    setActionSuccess('Управління видалено')
  }

  return (
    <DashboardLayout>
      <div className="max-w-7xl mx-auto space-y-6">
        {actionError && <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-800 dark:bg-rose-950/30 dark:text-rose-300">{actionError}</div>}
        {actionSuccess && <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300">{actionSuccess}</div>}
        <div>
          <h1 className="text-2xl font-semibold font-display">Підрозділи</h1>
          <p className="text-slate-500 mt-1">Керування підрозділами та співробітниками</p>
          {(isAdmin || isDirector) && (
            <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-300 space-y-0.5">
              <p><b>Департамент</b> — головний підрозділ з директором та заступниками.</p>
              <p><b>Відділ</b> — дочірній підрозділ у складі департаменту; має керівника (manager) та діловода (clerk).</p>
              <p><b>Управління</b> — необов'язкова мітка для групування відділів (наприклад: «Цифровізація», «Фінанси»).</p>
            </div>
          )}
        </div>

        {(isAdmin || isDirector) && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {isAdmin && (
              <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3 dark:border-slate-700 dark:bg-slate-900">
                <p className="text-sm font-semibold">Створити департамент</p>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                  <input
                    className="h-10 w-full min-w-0 rounded-lg border border-slate-300 px-3 text-sm bg-white text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                    placeholder="Назва департаменту"
                    value={newRootDepartmentName}
                    onChange={(e) => setNewRootDepartmentName(e.target.value)}
                  />
                  <input
                    className="h-10 w-full min-w-0 rounded-lg border border-slate-300 px-3 text-sm bg-white text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                    placeholder="Код (напр. DEP-IT)"
                    value={newRootDepartmentCode}
                    onChange={(e) => setNewRootDepartmentCode(e.target.value)}
                  />
                  <select
                    className="h-10 w-full min-w-0 rounded-lg border border-slate-300 px-3 text-sm bg-white text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                    value={newRootDepartmentDirectorId}
                    onChange={(e) => setNewRootDepartmentDirectorId(e.target.value)}
                  >
                    <option value="">Директор (опційно)</option>
                    {directors.map((d) => (
                      <option key={d.id} value={d.id}>{d.firstName} {d.lastName}</option>
                    ))}
                  </select>
                </div>
                <button onClick={createRootDepartment} className="h-10 rounded-lg bg-primary px-4 text-white text-sm font-medium">
                  Створити департамент
                </button>
              </div>
            )}

            <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3 dark:border-slate-700 dark:bg-slate-900">
              <p className="text-sm font-semibold">Створити відділ у департаменті</p>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {isAdmin ? (
                  <select
                    className="h-10 w-full min-w-0 rounded-lg border border-slate-300 px-3 text-sm bg-white text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                    value={newSectionParentId}
                    onChange={(e) => setNewSectionParentId(e.target.value)}
                  >
                    <option value="">Оберіть департамент</option>
                    {rootDepartments.map((dep) => (
                      <option key={dep.id} value={dep.id}>
                        {dep.nameUk || dep.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <div
                    className="h-10 w-full min-w-0 rounded-lg border border-slate-200 px-3 text-sm text-slate-500 flex items-center overflow-hidden text-ellipsis whitespace-nowrap dark:border-slate-700 dark:text-slate-400"
                    title={selectedRootDepartment?.nameUk || selectedRootDepartment?.name || user?.department?.nameUk || '—'}
                  >
                    Департамент: {selectedRootDepartment?.nameUk || selectedRootDepartment?.name || user?.department?.nameUk || '—'}
                  </div>
                )}
                <input
                  className="h-10 w-full min-w-0 rounded-lg border border-slate-300 px-3 text-sm bg-white text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                  placeholder="Назва відділу"
                  value={newSectionName}
                  onChange={(e) => setNewSectionName(e.target.value)}
                />
                <input
                  className="h-10 w-full min-w-0 rounded-lg border border-slate-300 px-3 text-sm bg-white text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                  placeholder="Код відділу"
                  value={newSectionCode}
                  onChange={(e) => setNewSectionCode(e.target.value)}
                />
                <input
                  className="h-10 w-full min-w-0 rounded-lg border border-slate-300 px-3 text-sm bg-white text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                  placeholder="Управління (напр. Цифровізація)"
                  value={newSectionDivisionTag}
                  onChange={(e) => setNewSectionDivisionTag(e.target.value)}
                />
                <select
                  className="h-10 w-full min-w-0 rounded-lg border border-slate-300 px-3 text-sm bg-white text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                  value={newSectionManagerId}
                  onChange={(e) => setNewSectionManagerId(e.target.value)}
                >
                  <option value="">Керівник (опційно)</option>
                  {managers.map((m) => (
                    <option key={m.id} value={m.id}>{m.firstName} {m.lastName}</option>
                  ))}
                </select>
                <select
                  className="h-10 w-full min-w-0 rounded-lg border border-slate-300 px-3 text-sm bg-white text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                  value={newSectionClerkId}
                  onChange={(e) => setNewSectionClerkId(e.target.value)}
                >
                  <option value="">Діловод (опційно)</option>
                  {clerks.map((c) => (
                    <option key={c.id} value={c.id}>{c.firstName} {c.lastName}</option>
                  ))}
                </select>
              </div>
              <button onClick={createSection} className="h-10 rounded-lg bg-primary px-4 text-white text-sm font-medium">
                Створити відділ
              </button>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3 dark:border-slate-700 dark:bg-slate-900">
              <p className="text-sm font-semibold">
                Управління {selectedRootDepartment ? `(${selectedRootDepartment.nameUk || selectedRootDepartment.name})` : ''}
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                <select
                  className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm bg-white text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                  value={selectedManagementTag}
                  onChange={(e) => setSelectedManagementTag(e.target.value)}
                >
                  <option value="">Нове управління</option>
                  {managementTags.map((tag) => (
                    <option key={tag} value={tag}>{tag}</option>
                  ))}
                </select>
                <button
                  onClick={() => {
                    setSelectedManagementTag('')
                    setManagementSourceTag('')
                    setNewManagementName('')
                    setManagementDepartmentIds([])
                    setManagementDeputyIds([])
                  }}
                  className="h-10 rounded-lg border border-slate-300 px-4 text-sm font-medium dark:border-slate-600"
                >
                  Очистити форму
                </button>
              </div>
              <input
                className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm bg-white text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                placeholder="Назва управління (можна перейменувати)"
                value={newManagementName}
                onChange={(e) => setNewManagementName(e.target.value)}
              />
              <div className="space-y-2">
                <p className="text-xs text-slate-500 dark:text-slate-400">Відділи, що входять в управління</p>
                <div className="grid grid-cols-1 gap-2 max-h-36 overflow-auto">
                  {(childDepartmentsMap.get(selectedRootDepartmentId) || []).map((dep) => (
                    <label key={dep.id} className="flex items-center gap-2 rounded border border-slate-200 px-3 py-2 text-sm dark:border-slate-700">
                      <input
                        type="checkbox"
                        checked={managementDepartmentIds.includes(dep.id)}
                        onChange={(e) => {
                          setManagementDepartmentIds((prev) =>
                            e.target.checked ? Array.from(new Set([...prev, dep.id])) : prev.filter((id) => id !== dep.id),
                          )
                        }}
                      />
                      <span>{dep.nameUk || dep.name}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <p className="text-xs text-slate-500 dark:text-slate-400">Заступник(и) директора для управління</p>
                <div className="grid grid-cols-1 gap-2 max-h-36 overflow-auto">
                  {deputyDirectorCandidates.map((candidate) => (
                    <label key={candidate.id} className="flex items-center gap-2 rounded border border-slate-200 px-3 py-2 text-sm dark:border-slate-700">
                      <input
                        type="checkbox"
                        checked={managementDeputyIds.includes(candidate.id)}
                        onChange={(e) => {
                          setManagementDeputyIds((prev) =>
                            e.target.checked ? Array.from(new Set([...prev, candidate.id])) : prev.filter((id) => id !== candidate.id),
                          )
                        }}
                      />
                      <span>{candidate.firstName} {candidate.lastName}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div className="flex gap-2">
                <button disabled={savingManagement} onClick={saveManagementScope} className="h-10 rounded-lg border border-slate-300 px-4 text-sm font-medium disabled:opacity-60 dark:border-slate-600">
                  {savingManagement ? 'Збереження...' : 'Зберегти управління'}
                </button>
                <button
                  disabled={savingManagement || !managementSourceTag}
                  onClick={deleteManagement}
                  className="h-10 rounded-lg border border-rose-300 px-4 text-sm font-medium text-rose-700 disabled:opacity-60"
                >
                  Видалити управління
                </button>
              </div>
            </div>
          </div>
        )}

        {loading ? <div className="rounded-xl border border-slate-200 bg-white px-4 py-6 text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">Завантаження...</div> : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden dark:border-slate-700 dark:bg-slate-900">
              <div className="px-4 py-3 border-b border-slate-100 text-sm font-semibold dark:border-slate-700">Підрозділи</div>
              {rootDepartments.map((department) => {
                const children = childDepartmentsMap.get(department.id) || []
                const expanded = expandedDepartmentIds.includes(department.id)
                return (
                  <div key={department.id} className="border-b border-slate-100 dark:border-slate-700">
                    <button
                      onClick={() => {
                        setSelectedDepartmentId(department.id)
                        setExpandedDepartmentIds((prev) =>
                          prev.includes(department.id) ? prev.filter((id) => id !== department.id) : [...prev, department.id],
                        )
                      }}
                      className={`w-full text-left px-4 py-3 text-sm ${selectedDepartmentId === department.id ? 'bg-slate-50 dark:bg-slate-800 font-medium' : ''}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span>{department.nameUk || department.name}</span>
                        <span className="text-xs text-slate-400">{expanded ? '▾' : '▸'}</span>
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                        {department.code} • {department.usersCount} осіб • Департамент
                      </div>
                    </button>
                    {expanded && children.length > 0 && (
                      <div className="bg-slate-50/70 dark:bg-slate-800/40">
                        {groupChildrenByDivision(children).map(({ tag, items }) => (
                          <div key={tag ?? '__untagged__'}>
                            {tag && (
                              <div className="px-4 py-1 text-xs font-semibold text-slate-400 uppercase tracking-wide border-t border-slate-100 dark:border-slate-700 dark:text-slate-500">
                                {tag}
                              </div>
                            )}
                            {items.map((child) => (
                              <button
                                key={child.id}
                                onClick={() => setSelectedDepartmentId(child.id)}
                                className={`w-full text-left px-8 py-2.5 text-sm border-t border-slate-100 dark:border-slate-700 ${
                                  selectedDepartmentId === child.id ? 'bg-slate-100 dark:bg-slate-800 font-medium' : ''
                                }`}
                              >
                                <div>{child.nameUk || child.name}</div>
                                <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                                  {child.code} • {child.usersCount} осіб{child.divisionTag ? ` • ${child.divisionTag}` : ''}
                                </div>
                              </button>
                            ))}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            <div className="lg:col-span-2 rounded-2xl border border-slate-200 bg-white overflow-hidden dark:border-slate-700 dark:bg-slate-900">
              <div className="px-4 py-3 border-b border-slate-100 text-sm font-semibold dark:border-slate-700">Команда {selectedDepartment ? `(${selectedDepartment.nameUk || selectedDepartment.name})` : ''}</div>

              {(isAdmin || isDirector) && selectedDepartmentId && (
                <div className="p-4 space-y-3 border-b border-slate-100 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/60">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <select className="h-10 rounded-lg border border-slate-300 px-3 text-sm bg-white text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100" value={selectedManagerId} onChange={(e) => setSelectedManagerId(e.target.value)}>
                      <option value="">Керівник не призначений</option>
                      {managers.map((m) => (
                        <option key={m.id} value={m.id}>{m.firstName} {m.lastName}</option>
                      ))}
                    </select>
                    <select className="h-10 rounded-lg border border-slate-300 px-3 text-sm bg-white text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100" value={selectedClerkId} onChange={(e) => setSelectedClerkId(e.target.value)}>
                      <option value="">Діловод не призначений</option>
                      {clerks.map((c) => (
                        <option key={c.id} value={c.id}>{c.firstName} {c.lastName}</option>
                      ))}
                    </select>
                    <input
                      className="h-10 rounded-lg border border-slate-300 px-3 text-sm bg-white text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                      placeholder="Управління (напр. Цифровізація)"
                      value={editingDivisionTag}
                      onChange={(e) => setEditingDivisionTag(e.target.value)}
                    />
                  </div>
                  <button disabled={savingLeads} onClick={saveDepartmentLeads} className="h-10 rounded-lg border border-slate-300 px-4 text-sm font-medium disabled:opacity-60 dark:border-slate-600">
                    {savingLeads ? 'Збереження...' : 'Зберегти відділ'}
                  </button>
                </div>
              )}

              {(isAdmin || isDirector) && (
                <div className="p-4 border-b border-slate-100 bg-slate-50/70 dark:border-slate-700 dark:bg-slate-800/40 space-y-3">
                  <p className="text-sm font-semibold">
                    Керівництво департаменту {selectedRootDepartment ? `(${selectedRootDepartment.nameUk || selectedRootDepartment.name})` : ''}
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <select
                      className="h-10 rounded-lg border border-slate-300 px-3 text-sm bg-white text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                      value={selectedDirectorId}
                      onChange={(e) => setSelectedDirectorId(e.target.value)}
                    >
                      <option value="">Директор не призначений</option>
                      {directors.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.firstName} {d.lastName}
                        </option>
                      ))}
                    </select>
                    <select
                      className="h-10 rounded-lg border border-slate-300 px-3 text-sm bg-white text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                      value={selectedDeputyHeadId}
                      onChange={(e) => setSelectedDeputyHeadId(e.target.value)}
                    >
                      <option value="">Заступник голови не призначений</option>
                      {deputyHeads.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.firstName} {d.lastName}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Заступники директора департаменту
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      {deputyDirectorCandidates.map((depDir) => (
                        <label key={depDir.id} className="flex items-center gap-2 rounded border border-slate-200 px-3 py-2 text-sm dark:border-slate-700">
                          <input
                            type="checkbox"
                            checked={selectedDeputyDirectorIds.includes(depDir.id)}
                            onChange={(e) => {
                              setSelectedDeputyDirectorIds((prev) =>
                                e.target.checked ? Array.from(new Set([...prev, depDir.id])) : prev.filter((id) => id !== depDir.id),
                              )
                            }}
                          />
                          <span>{depDir.firstName} {depDir.lastName} ({getRoleLabel(depDir.role)})</span>
                        </label>
                      ))}
                    </div>
                  </div>
                  <button
                    onClick={saveDepartmentSupervision}
                    disabled={savingDeputyScope || !selectedRootDepartmentId}
                    className="h-10 rounded-lg border border-slate-300 px-4 text-sm font-medium disabled:opacity-60 dark:border-slate-600"
                  >
                    {savingDeputyScope ? 'Збереження...' : 'Зберегти керівництво департаменту'}
                  </button>
                </div>
              )}

              {isAdmin && selectedDepartmentId && (
                <div className="p-4 border-b border-slate-100 dark:border-slate-700 space-y-3">
                  <p className="text-sm font-semibold">Адміністрування акаунтів</p>
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                  <input className="h-10 rounded-lg border border-slate-300 px-3 text-sm bg-white text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100" placeholder="Email" value={newUserEmail} onChange={(e) => setNewUserEmail(e.target.value)} />
                  <input className="h-10 rounded-lg border border-slate-300 px-3 text-sm bg-white text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100" placeholder="Ім'я" value={newUserFirstName} onChange={(e) => setNewUserFirstName(e.target.value)} />
                  <input className="h-10 rounded-lg border border-slate-300 px-3 text-sm bg-white text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100" placeholder="Прізвище" value={newUserLastName} onChange={(e) => setNewUserLastName(e.target.value)} />
                  <select
                    className="h-10 rounded-lg border border-slate-300 px-3 text-sm bg-white text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                    value={newUserRole}
                    onChange={(e) =>
                      setNewUserRole(
                        e.target.value as 'specialist' | 'manager' | 'clerk' | 'director' | 'deputy_director' | 'deputy_head' | 'lawyer' | 'accountant' | 'hr',
                      )
                    }
                  >
                    <option value="specialist">{getRoleLabel('specialist')}</option>
                    <option value="manager">{getRoleLabel('manager')}</option>
                    <option value="clerk">{getRoleLabel('clerk')}</option>
                    <option value="lawyer">{getRoleLabel('lawyer')}</option>
                    <option value="accountant">{getRoleLabel('accountant')}</option>
                    <option value="hr">{getRoleLabel('hr')}</option>
                    {isAdmin && <option value="deputy_director">{getRoleLabel('deputy_director')}</option>}
                    {isAdmin && <option value="deputy_head">{getRoleLabel('deputy_head')}</option>}
                    {isAdmin && <option value="director">{getRoleLabel('director')}</option>}
                  </select>
                  <button onClick={addEmployee} className="md:col-span-4 h-10 rounded-lg bg-primary text-white text-sm font-medium">Додати співробітника</button>
                  </div>
                </div>
              )}

              {canManageEmployees && selectedDepartmentId && (
                <div className="p-4 grid grid-cols-1 md:grid-cols-4 gap-3 border-b border-slate-100 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/60">
                  <select
                    className="md:col-span-3 h-10 rounded-lg border border-slate-300 px-3 text-sm bg-white text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                    value={selectedExistingUserId}
                    onChange={(e) => setSelectedExistingUserId(e.target.value)}
                  >
                    <option value="">Додати існуючого співробітника до цього підрозділу</option>
                    {transferableUsers.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.firstName} {u.lastName} ({getRoleLabel(u.role)})
                      </option>
                    ))}
                  </select>
                  <button
                    disabled={assigningExistingUser || !selectedExistingUserId}
                    onClick={assignExistingEmployee}
                    className="h-10 rounded-lg border border-slate-300 text-sm font-medium disabled:opacity-60 dark:border-slate-600"
                  >
                    {assigningExistingUser ? 'Перенесення...' : 'Додати в підрозділ'}
                  </button>
                </div>
              )}

              <div>
                {team.length === 0 && (
                  <div className="px-4 py-6 text-sm text-slate-500 dark:text-slate-400">
                    <p className="font-medium mb-1">У цьому підрозділі ще немає співробітників.</p>
                    {canManageEmployees && (
                      <p>Скористайтеся формою вище, щоб додати нового або перевести існуючого.</p>
                    )}
                  </div>
                )}
                {team.map((member) => (
                  <div key={member.id} className="px-4 py-3 border-b border-slate-100 flex items-center justify-between dark:border-slate-700">
                    <div>
                      <p className="text-sm font-medium">{member.firstName} {member.lastName}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">{member.email} • {getRoleLabel(member.role)}</p>
                      {member.department && (
                        <p className="text-xs text-slate-400 dark:text-slate-500">
                          Підрозділ: {member.department.nameUk || member.department.code || member.department.id}
                        </p>
                      )}
                    </div>
                    {canManageEmployees && member.role !== 'director' && member.role !== 'deputy_head' && member.role !== 'admin' && (
                      <div className="flex items-center gap-3">
                        {isAdmin && (
                          <button
                            onClick={() => resetEmployeePassword(member.id, `${member.firstName} ${member.lastName}`)}
                            className="text-sm text-amber-600 hover:underline"
                          >
                            Змінити пароль
                          </button>
                        )}
                        <button onClick={() => deleteEmployee(member.id)} className="text-sm text-rose-600 hover:underline">Видалити</button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

          </div>
        )}
      </div>
    </DashboardLayout>
  )
}
