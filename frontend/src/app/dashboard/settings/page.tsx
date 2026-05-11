'use client'

import { useEffect, useState } from 'react'
import { DashboardLayout } from '@/components/dashboard-layout'
import { useAuthStore } from '@/store/auth-store'
import { extractApiErrorMessage } from '@/lib/error-message'

export default function SettingsPage() {
  const { user } = useAuthStore()
  const [isDark, setIsDark] = useState(false)

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [savingPassword, setSavingPassword] = useState(false)
  const [passwordError, setPasswordError] = useState('')
  const [passwordSuccess, setPasswordSuccess] = useState('')

  const accessToken = typeof window !== 'undefined' ? localStorage.getItem('vidlik-accessToken') : null

  useEffect(() => {
    setIsDark(document.documentElement.classList.contains('dark'))
  }, [])

  useEffect(() => {
    if (!passwordSuccess) return
    const t = setTimeout(() => setPasswordSuccess(''), 3000)
    return () => clearTimeout(t)
  }, [passwordSuccess])

  const setTheme = (nextDark: boolean) => {
    const root = document.documentElement
    root.classList.toggle('dark', nextDark)
    localStorage.setItem('vidlik-theme', nextDark ? 'dark' : 'light')
    setIsDark(nextDark)
  }

  const changePassword = async () => {
    setPasswordError('')
    if (!newPassword || newPassword.length < 8) {
      setPasswordError('Новий пароль має містити щонайменше 8 символів')
      return
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('Паролі не збігаються')
      return
    }
    setSavingPassword(true)
    const resp = await fetch('/api/v1/users/me/password', {
      method: 'PUT',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: newPassword }),
    })
    setSavingPassword(false)
    if (resp.ok) {
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setPasswordSuccess('Пароль змінено успішно')
      return
    }
    const err = await resp.json().catch(() => null)
    setPasswordError(extractApiErrorMessage(resp.status, err, 'Не вдалося змінити пароль'))
  }

  return (
    <DashboardLayout>
      <div className="max-w-3xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-semibold font-display">Налаштування</h1>
          <p className="text-slate-500 mt-1">Параметри облікового запису та інтерфейсу</p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white dark:bg-slate-900 dark:border-slate-700 p-4 space-y-3">
          <p className="text-sm font-semibold">Змінити пароль</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">Мінімум 8 символів</p>
          {passwordError && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-800 dark:bg-rose-950/30 dark:text-rose-300">
              {passwordError}
            </div>
          )}
          {passwordSuccess && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300">
              {passwordSuccess}
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <input
              type="password"
              placeholder="Новий пароль"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="h-10 rounded-lg border border-slate-300 px-3 text-sm bg-white text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
            />
            <input
              type="password"
              placeholder="Підтвердити пароль"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="h-10 rounded-lg border border-slate-300 px-3 text-sm bg-white text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
            />
            <button
              onClick={changePassword}
              disabled={savingPassword || !newPassword || !confirmPassword}
              className="h-10 rounded-lg bg-primary px-4 text-sm font-medium text-white disabled:opacity-60"
            >
              {savingPassword ? 'Збереження...' : 'Змінити пароль'}
            </button>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white dark:bg-slate-900 dark:border-slate-700 p-4">
          <p className="text-sm font-semibold">Тема інтерфейсу</p>
          <p className="mt-1 text-xs text-slate-500">Оберіть світлу або темну тему для всієї системи.</p>
          <div className="mt-3 flex gap-2">
            <button
              onClick={() => setTheme(false)}
              className={`rounded-lg px-3 py-2 text-sm border ${!isDark ? 'bg-primary text-white border-primary' : 'bg-white dark:bg-slate-800 border-slate-300 text-slate-700 dark:text-slate-200'}`}
            >
              Світла
            </button>
            <button
              onClick={() => setTheme(true)}
              className={`rounded-lg px-3 py-2 text-sm border ${isDark ? 'bg-primary text-white border-primary' : 'bg-white dark:bg-slate-800 border-slate-300 text-slate-700 dark:text-slate-200'}`}
            >
              Темна
            </button>
          </div>
        </div>

        {user && (
          <div className="rounded-2xl border border-slate-200 bg-white dark:bg-slate-900 dark:border-slate-700 p-4">
            <p className="text-sm font-semibold">Обліковий запис</p>
            <div className="mt-2 space-y-1 text-sm text-slate-600 dark:text-slate-300">
              <p><span className="font-medium">Ім'я:</span> {user.firstName} {user.lastName}</p>
              <p><span className="font-medium">Email:</span> {user.email}</p>
              <p><span className="font-medium">Роль:</span> {user.role}</p>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  )
}
