'use client'

import { useEffect, useState } from 'react'
import { DashboardLayout } from '@/components/dashboard-layout'

export default function SettingsPage() {
  const [isDark, setIsDark] = useState(false)

  useEffect(() => {
    setIsDark(document.documentElement.classList.contains('dark'))
  }, [])

  const setTheme = (nextDark: boolean) => {
    const root = document.documentElement
    root.classList.toggle('dark', nextDark)
    localStorage.setItem('vidlik-theme', nextDark ? 'dark' : 'light')
    setIsDark(nextDark)
  }

  return (
    <DashboardLayout>
      <div className="max-w-3xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-semibold font-display">Налаштування</h1>
          <p className="text-slate-500 mt-1">Загальні параметри інтерфейсу</p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white dark:bg-slate-900 p-4">
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
      </div>
    </DashboardLayout>
  )
}
