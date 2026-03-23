'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/store/auth-store'
import { Button } from '@/components/ui/button'
import { 
  LayoutDashboard, 
  FileText, 
  CheckSquare, 
  BarChart3, 
  Users, 
  Settings, 
  Bell,
  LogOut,
  Menu,
  X,
  Moon,
  Sun
} from 'lucide-react'
import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useEffect } from 'react'
import { BrandLogo } from '@/components/brand-logo'

const navigation = [
  { name: 'Дашборд', href: '/dashboard', icon: LayoutDashboard },
  { name: 'Звіти', href: '/dashboard/reports', icon: FileText },
  { name: 'Задачі', href: '/dashboard/tasks', icon: CheckSquare },
  { name: 'Аналітика', href: '/dashboard/analytics', icon: BarChart3, roles: ['manager', 'director'] },
  { name: 'Сповіщення', href: '/dashboard/notifications', icon: Bell },
  { name: 'Підрозділи', href: '/dashboard/departments', icon: Users, roles: ['manager', 'director', 'admin'] },
  { name: 'Конструктор', href: '/dashboard/layouts', icon: Settings, roles: ['admin'] },
  { name: 'Налаштування', href: '/dashboard/settings', icon: Settings, roles: ['admin'] },
]

export function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const { user, logout } = useAuthStore()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [searching, setSearching] = useState(false)
  const [searchData, setSearchData] = useState<{ reports: any[]; tasks: any[]; users: any[] }>({
    reports: [],
    tasks: [],
    users: [],
  })
  const [showOnboarding, setShowOnboarding] = useState(false)
  const [isDark, setIsDark] = useState(false)
  const accessToken = typeof window !== 'undefined' ? localStorage.getItem('vidlik-accessToken') : null

  useEffect(() => {
    let cancelled = false

    const loadUnread = async () => {
      if (!accessToken) return
      const resp = await fetch('/api/v1/notifications/unread', {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      if (!resp.ok || cancelled) return
      const data = await resp.json()
      if (!cancelled) {
        setUnreadCount(data.unreadCount || 0)
      }
    }

    loadUnread()
    const interval = setInterval(loadUnread, 45000)

    if (accessToken) {
      const stream = new EventSource(`/api/v1/notifications/stream?token=${encodeURIComponent(accessToken)}`)
      stream.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data || '{}')
          if (typeof payload?.unreadCount === 'number' && !cancelled) {
            setUnreadCount(payload.unreadCount)
          }
        } catch {
          // ignore malformed event
        }
      }
      stream.onerror = () => {
        stream.close()
      }

      return () => {
        cancelled = true
        clearInterval(interval)
        stream.close()
      }
    }

    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [accessToken, pathname])

  useEffect(() => {
    const query = searchQuery.trim()
    if (!accessToken || query.length < 2) {
      setSearchData({ reports: [], tasks: [], users: [] })
      setSearching(false)
      return
    }

    const timeout = setTimeout(async () => {
      setSearching(true)
      const resp = await fetch(`/api/v1/search/global?q=${encodeURIComponent(query)}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      if (resp.ok) {
        const data = await resp.json()
        setSearchData({
          reports: data.reports || [],
          tasks: data.tasks || [],
          users: data.users || [],
        })
      }
      setSearching(false)
      setSearchOpen(true)
    }, 250)

    return () => clearTimeout(timeout)
  }, [accessToken, searchQuery])

  useEffect(() => {
    if (!user?.id) return
    const key = `vidlik-onboarding-v1-${user.id}`
    const seen = localStorage.getItem(key)
    if (!seen) {
      setShowOnboarding(true)
    }
  }, [user?.id])

  useEffect(() => {
    const isDarkNow = document.documentElement.classList.contains('dark')
    setIsDark(isDarkNow)
  }, [])

  const filteredNav = navigation.filter(item => {
    if (!item.roles) return true
    return user && item.roles.includes(user.role)
  })

  const handleLogout = () => {
    logout()
    router.push('/')
  }

  const closeOnboarding = () => {
    if (user?.id) {
      localStorage.setItem(`vidlik-onboarding-v1-${user.id}`, '1')
    }
    setShowOnboarding(false)
  }

  const roleTitle =
    user?.role === 'admin'
      ? 'Адмін'
      : user?.role === 'director'
      ? 'Директор'
      : user?.role === 'manager'
      ? 'Керівник'
      : 'Спеціаліст'

  const toggleTheme = () => {
    const root = document.documentElement
    const next = !root.classList.contains('dark')
    root.classList.toggle('dark', next)
    localStorage.setItem('vidlik-theme', next ? 'dark' : 'light')
    setIsDark(next)
  }

  return (
    <div className="min-h-screen">
      {/* Mobile sidebar */}
      <div className="lg:hidden">
        {sidebarOpen && (
          <div className="fixed inset-0 z-50">
            <div className="fixed inset-0 bg-black/50" onClick={() => setSidebarOpen(false)} />
            <div className="fixed inset-y-0 left-0 z-50 w-64 bg-white dark:bg-slate-800 shadow-xl">
              <div className="flex items-center justify-between p-4 border-b">
                <span className="inline-flex items-center gap-3 text-2xl font-semibold tracking-wide">
                  <BrandLogo className="h-8 w-8 text-primary" />
                  ВІДЛІК
                </span>
                <button onClick={() => setSidebarOpen(false)}>
                  <X className="w-5 h-5" />
                </button>
              </div>
              <nav className="p-4 space-y-1">
                {filteredNav.map(item => (
                  <Link
                    key={item.name}
                    href={item.href}
                    onClick={() => setSidebarOpen(false)}
                    className={cn(
                      'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                      pathname === item.href
                        ? 'bg-primary text-white'
                        : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
                    )}
                  >
                    <item.icon className="w-5 h-5" />
                    {item.name}
                  </Link>
                ))}
              </nav>
            </div>
          </div>
        )}
      </div>

      {/* Desktop sidebar */}
      <div className="hidden lg:fixed lg:inset-y-0 lg:z-50 lg:flex lg:w-64 lg:flex-col">
        <div className="flex flex-col flex-1 min-h-0 bg-white/80 dark:bg-slate-900/70 backdrop-blur-xl border-r border-white/10">
          <div className="flex items-center h-16 px-6 border-b border-white/10">
            <span className="inline-flex items-center gap-3 text-2xl font-semibold font-display tracking-wide">
              <BrandLogo className="h-8 w-8 text-primary" />
              ВІДЛІК
            </span>
          </div>
          <nav className="flex-1 p-4 space-y-1">
            {filteredNav.map(item => (
              <Link
                key={item.name}
                href={item.href}
                className={cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200',
                  pathname === item.href
                    ? 'bg-primary text-white shadow-sm'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
                )}
              >
                <item.icon className="w-5 h-5" />
                {item.name}
              </Link>
            ))}
          </nav>
          <div className="p-4 border-t">
            <Button
              variant="ghost"
              className="w-full justify-start text-red-600 hover:text-red-700 hover:bg-red-50"
              onClick={handleLogout}
            >
              <LogOut className="w-5 h-5 mr-3" />
              Вийти
            </Button>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="lg:pl-64">
        {/* Header */}
        <header className="sticky top-0 z-40 flex items-center h-16 px-4 bg-white/70 dark:bg-slate-900/70 border-b border-white/10 backdrop-blur-xl shadow-sm lg:px-6">
          <button
            className="lg:hidden mr-4"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu className="w-6 h-6" />
          </button>
          <div className="flex-1 pr-3">
            <div className="relative max-w-xl">
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onFocus={() => setSearchOpen(true)}
                placeholder="Пошук: звіти, задачі, співробітники..."
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-sky-400 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
              />
              {searchOpen && (searchQuery.trim().length >= 2 || searching) && (
                <div className="absolute mt-2 w-full rounded-xl border border-slate-200 bg-white p-3 shadow-lg dark:border-slate-700 dark:bg-slate-900">
                  {searching && <p className="text-xs text-slate-500 dark:text-slate-400">Пошук...</p>}
                  {!searching && (
                    <div className="space-y-2 text-sm">
                      {searchData.reports.length > 0 && (
                        <div>
                          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Звіти</p>
                          {searchData.reports.slice(0, 4).map((item) => (
                            <Link
                              key={`report-${item.id}`}
                              href={`/dashboard/reports/${item.id}`}
                              className="block rounded px-2 py-1 hover:bg-slate-50 dark:hover:bg-slate-800"
                              onClick={() => setSearchOpen(false)}
                            >
                              {item.title}
                            </Link>
                          ))}
                        </div>
                      )}
                      {searchData.tasks.length > 0 && (
                        <div>
                          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Задачі</p>
                          {searchData.tasks.slice(0, 4).map((item) => (
                            <Link
                              key={`task-${item.id}`}
                              href="/dashboard/tasks"
                              className="block rounded px-2 py-1 hover:bg-slate-50 dark:hover:bg-slate-800"
                              onClick={() => setSearchOpen(false)}
                            >
                              {item.title}
                            </Link>
                          ))}
                        </div>
                      )}
                      {searchData.users.length > 0 && (
                        <div>
                          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Співробітники</p>
                          {searchData.users.slice(0, 4).map((item) => (
                            <p key={`user-${item.id}`} className="rounded px-2 py-1 text-slate-700 dark:text-slate-200">
                              {item.fullName} · {item.departmentName}
                            </p>
                          ))}
                        </div>
                      )}
                      {!searchData.reports.length && !searchData.tasks.length && !searchData.users.length && (
                        <p className="text-xs text-slate-500 dark:text-slate-400">Нічого не знайдено</p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={toggleTheme} title="Перемкнути тему">
              {isDark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </Button>
            <Link href="/dashboard/notifications">
              <Button variant="ghost" size="icon" className="relative">
                <Bell className="w-5 h-5" />
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-5 h-5 px-1 rounded-full bg-red-100 text-red-700 text-[10px] leading-5">
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                )}
              </Button>
            </Link>
            <div className="flex items-center gap-3">
              <div className="text-right">
                <p className="text-sm font-medium">{user?.firstName} {user?.lastName}</p>
                <p className="text-xs text-slate-500">{roleTitle} · {user?.department?.nameUk}</p>
              </div>
              <div className="w-10 h-10 bg-primary rounded-full flex items-center justify-center text-white font-medium">
                {user?.firstName?.charAt(0)}{user?.lastName?.charAt(0)}
              </div>
            </div>
          </div>
        </header>

        {/* Page content */}
        <AnimatePresence mode="wait">
          <motion.main
            key={pathname}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
            className="p-4 lg:p-6"
          >
            {children}
          </motion.main>
        </AnimatePresence>
      </div>

      {showOnboarding && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-xl rounded-2xl bg-white p-6 shadow-xl dark:bg-slate-900">
            <h2 className="text-xl font-semibold">Короткий старт</h2>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">Роль: {roleTitle}</p>
            <ul className="mt-4 list-disc space-y-2 pl-5 text-sm text-slate-700 dark:text-slate-200">
              {user?.role === 'specialist' && (
                <>
                  <li>Створюйте чернетку звіту, генеруйте AI-текст, перевіряйте чек-лист та відправляйте на погодження.</li>
                  <li>Оновлюйте статуси задач у Kanban та дотримуйтесь дедлайнів.</li>
                </>
              )}
              {user?.role === 'manager' && (
                <>
                  <li>Перевіряйте звіти підрозділу, залишайте зауваження по секціях і погоджуйте або повертайте на доопрацювання.</li>
                  <li>Керуйте задачами співробітників та контролюйте виконання в колонках Todo/In Progress/Done.</li>
                </>
              )}
              {user?.role === 'director' && (
                <>
                  <li>Проводьте фінальне погодження та переглядайте міжпідрозділову аналітику.</li>
                  <li>Використовуйте друк-версію і експорт для офіційних документів.</li>
                </>
              )}
              {user?.role === 'admin' && (
                <>
                  <li>Підтримуйте структуру підрозділів, ролі, доступи та політики безпеки.</li>
                  <li>Контролюйте аудит і системні налаштування.</li>
                </>
              )}
            </ul>
            <div className="mt-6 flex justify-end">
              <button
                onClick={closeOnboarding}
                className="rounded-lg bg-primary px-4 py-2 text-sm text-white"
              >
                Зрозуміло
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
