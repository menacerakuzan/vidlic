'use client'

import { useEffect, useState } from 'react'
import { DashboardLayout } from '@/components/dashboard-layout'
import { useAuthStore } from '@/store/auth-store'
import { extractApiErrorMessage } from '@/lib/error-message'

type ProfileData = {
  id: string
  firstName: string
  lastName: string
  patronymic?: string | null
  email: string
  employeeId: string
  role: string
  isActive: boolean
  department?: { id: string; name?: string; nameUk?: string } | null
  position?: { id: string; title?: string; titleUk?: string } | null
  createdAt: string
}

const roleLabel: Record<string, string> = {
  admin: 'Адміністратор',
  director: 'Директор',
  deputy_director: 'Заступник директора',
  manager: 'Керівник',
  deputy_head: 'Заступник керівника',
  employee: 'Співробітник',
}

export default function ProfilePage() {
  const { user } = useAuthStore()
  const [profile, setProfile] = useState<ProfileData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [oldPassword, setOldPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [changingPassword, setChangingPassword] = useState(false)
  const [passwordError, setPasswordError] = useState('')
  const [passwordSuccess, setPasswordSuccess] = useState(false)

  const accessToken = typeof window !== 'undefined' ? localStorage.getItem('vidlik-accessToken') : null

  useEffect(() => {
    if (!accessToken || !user?.id) return
    setLoading(true)
    fetch(`/api/v1/users/${user.id}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
      .then((r) => r.json())
      .then((data) => {
        setProfile(data)
        setLoading(false)
      })
      .catch(() => {
        setError('Не вдалося завантажити профіль')
        setLoading(false)
      })
  }, [accessToken, user?.id])

  const changePassword = async () => {
    setPasswordError('')
    setPasswordSuccess(false)

    if (!newPassword || newPassword.length < 8) {
      setPasswordError('Мінімум 8 символів')
      return
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('Паролі не збігаються')
      return
    }

    setChangingPassword(true)
    const resp = await fetch('/api/v1/users/me/password', {
      method: 'PUT',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: newPassword }),
    })
    setChangingPassword(false)

    if (resp.ok) {
      setOldPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setPasswordSuccess(true)
      setTimeout(() => setPasswordSuccess(false), 3000)
      return
    }

    const err = await resp.json().catch(() => null)
    setPasswordError(extractApiErrorMessage(resp.status, err, 'Не вдалося змінити пароль'))
  }

  return (
    <DashboardLayout>
      <div className="max-w-2xl mx-auto space-y-6 p-4">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Мій профіль</h1>

        {loading && (
          <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-6">
            <p className="text-sm text-slate-500">Завантаження...</p>
          </div>
        )}

        {error && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 dark:border-rose-800/40 dark:bg-rose-950/20 p-4">
            <p className="text-sm text-rose-700 dark:text-rose-300">{error}</p>
          </div>
        )}

        {profile && (
          <>
            {/* Info card */}
            <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 overflow-hidden">
              <div className="px-6 py-5 border-b border-slate-100 dark:border-slate-700">
                <div className="flex items-center gap-4">
                  <div className="h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <span className="text-xl font-bold text-primary">
                      {profile.firstName.charAt(0)}{profile.lastName.charAt(0)}
                    </span>
                  </div>
                  <div>
                    <p className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                      {profile.lastName} {profile.firstName} {profile.patronymic || ''}
                    </p>
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                      {roleLabel[profile.role] || profile.role}
                    </p>
                  </div>
                </div>
              </div>

              <div className="px-6 py-5 space-y-3">
                <Row label="Email" value={profile.email} />
                <Row label="Табельний номер" value={profile.employeeId} />
                <Row
                  label="Підрозділ"
                  value={profile.department?.nameUk || profile.department?.name || '—'}
                />
                <Row
                  label="Посада"
                  value={profile.position?.titleUk || profile.position?.title || '—'}
                />
                <Row
                  label="Статус"
                  value={profile.isActive ? 'Активний' : 'Деактивований'}
                  valueClass={profile.isActive ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}
                />
                <Row
                  label="Дата реєстрації"
                  value={new Date(profile.createdAt).toLocaleDateString('uk-UA', {
                    day: '2-digit', month: 'long', year: 'numeric',
                  })}
                />
              </div>
            </div>

            {/* Change password */}
            <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-700">
                <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">Змінити пароль</p>
              </div>
              <div className="px-6 py-5 space-y-3">
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Новий пароль</label>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Мінімум 8 символів"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white text-slate-900 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Підтвердіть пароль</label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Повторіть пароль"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white text-slate-900 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
                  />
                </div>

                {passwordError && (
                  <p className="text-xs text-rose-600 dark:text-rose-400">{passwordError}</p>
                )}
                {passwordSuccess && (
                  <p className="text-xs text-emerald-600 dark:text-emerald-400">Пароль успішно змінено</p>
                )}

                <button
                  onClick={changePassword}
                  disabled={changingPassword || !newPassword || !confirmPassword}
                  className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
                >
                  {changingPassword ? 'Збереження...' : 'Зберегти пароль'}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </DashboardLayout>
  )
}

function Row({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="flex items-start gap-3">
      <span className="w-40 shrink-0 text-xs text-slate-500 dark:text-slate-400 pt-0.5">{label}</span>
      <span className={`text-sm text-slate-800 dark:text-slate-200 ${valueClass || ''}`}>{value}</span>
    </div>
  )
}
