'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/store/auth-store'
import { Button } from '@/components/ui/button'
import {
  LayoutDashboard,
  FileText,
  FileClock,
  CalendarDays,
  ListTodo,
  BarChart2,
  Archive,
  PlusSquare,
  Bell,
  Building2,
  Layers,
  Settings,
  UserCircle,
  LogOut,
  Menu,
  X,
  Moon,
  Sun,
  FolderOpen,
} from 'lucide-react'
import React, { useState, useEffect, useRef } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { BrandLogo } from '@/components/brand-logo'

type NavItem = {
  name: string
  href: string
  icon: React.ElementType
  roles?: string[]
}

type NavGroup = {
  label: string
  items: NavItem[]
}

const navGroups: NavGroup[] = [
  {
    label: '',
    items: [
      { name: 'Дашборд', href: '/dashboard', icon: LayoutDashboard },
    ],
  },
  {
    label: 'Звітність',
    items: [
      { name: 'Звіти', href: '/dashboard/reports', icon: FileText },
      { name: 'Денний звіт', href: '/dashboard/reports/daily', icon: FileClock },
      { name: 'Заходи', href: '/dashboard/activities', icon: CalendarDays },
    ],
  },
  {
    label: 'Задачі',
    items: [
      { name: 'Нова задача', href: '/dashboard/tasks/create', icon: PlusSquare },
      { name: 'Список задач', href: '/dashboard/tasks/list', icon: ListTodo },
      { name: 'Навантаження', href: '/dashboard/tasks/workload', icon: BarChart2 },
      { name: 'Архів', href: '/dashboard/tasks/archive', icon: Archive },
    ],
  },
  {
    label: 'Інше',
    items: [
      { name: 'Сповіщення', href: '/dashboard/notifications', icon: Bell },
      { name: 'Підрозділи', href: '/dashboard/departments', icon: Building2, roles: ['specialist', 'manager', 'director', 'deputy_director', 'deputy_head', 'admin', 'clerk', 'lawyer', 'accountant', 'hr'] },
      { name: 'Мої файли', href: '/dashboard/deputy-files', icon: FolderOpen, roles: ['deputy_head'] },
      { name: 'Конструктор', href: '/dashboard/layouts', icon: Layers, roles: ['admin'] },
      { name: 'Налаштування', href: '/dashboard/settings', icon: Settings },
    ],
  },
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
  const [fontSize, setFontSize] = useState<'normal' | 'large' | 'xlarge'>('large')
  const prevUnreadCount = useRef<number | null>(null)
  const accessToken = typeof window !== 'undefined' ? localStorage.getItem('vidlik-accessToken') : null

  const playNotificationSound = () => {
    if (typeof window === 'undefined') return
    const sound = localStorage.getItem('vidlik-notification-sound')
    if (!sound || sound === 'none') return
    const audio = new Audio(sound)
    audio.volume = 0.7
    audio.play().catch(() => {})
  }

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
        const newCount = data.unreadCount || 0
        if (prevUnreadCount.current !== null && newCount > prevUnreadCount.current) {
          playNotificationSound()
        }
        prevUnreadCount.current = newCount
        setUnreadCount(newCount)
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
            const newCount = payload.unreadCount
            if (prevUnreadCount.current !== null && newCount > prevUnreadCount.current) {
              playNotificationSound()
            }
            prevUnreadCount.current = newCount
            setUnreadCount(newCount)
          }
        } catch {
          // ignore malformed event
        }
      }
      let retryTimeout: ReturnType<typeof setTimeout>
      stream.onerror = () => {
        stream.close()
        if (!cancelled) {
          retryTimeout = setTimeout(() => {
            if (!cancelled) loadUnread()
          }, 5000)
        }
      }

      return () => {
        cancelled = true
        clearInterval(interval)
        clearTimeout(retryTimeout)
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

  useEffect(() => {
    const saved = localStorage.getItem('vidlik-font-size') as 'normal' | 'large' | 'xlarge' | null
    if (saved) setFontSize(saved)
  }, [])

  useEffect(() => {
    const root = document.documentElement
    root.removeAttribute('data-font-size')
    if (fontSize !== 'normal') root.setAttribute('data-font-size', fontSize)
    localStorage.setItem('vidlik-font-size', fontSize)
  }, [fontSize])

  const cycleFontSize = () => {
    setFontSize(prev => prev === 'normal' ? 'large' : prev === 'large' ? 'xlarge' : 'normal')
  }

  const fontSizeLabel = fontSize === 'normal' ? 'A' : fontSize === 'large' ? 'A+' : 'A++'

  const filteredGroups = navGroups
    .map(group => ({
      ...group,
      items: group.items.filter(item => !item.roles || (user && item.roles.includes(user.role))),
    }))
    .filter(group => group.items.length > 0)

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
      : user?.role === 'deputy_head'
      ? 'Заступник голови'
      : user?.role === 'deputy_director'
      ? 'Заступник директора'
      : user?.role === 'director'
      ? 'Директор'
      : user?.role === 'clerk'
      ? 'Діловод'
      : user?.role === 'manager'
      ? 'Керівник'
      : user?.role === 'lawyer'
      ? 'Юрист'
      : user?.role === 'accountant'
      ? 'Бухгалтер'
      : user?.role === 'hr'
      ? 'Кадровик'
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
            <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={() => setSidebarOpen(false)} />
            <div className="fixed inset-y-0 left-0 z-50 flex w-64 flex-col bg-card shadow-xl">
              <div className="flex items-center justify-between border-b border-border p-4">
                <span className="inline-flex items-center gap-2.5 font-display text-xl font-medium tracking-tight">
                  <BrandLogo className="h-9 w-9 text-primary" />
                  ВІДЛІК
                </span>
                <button onClick={() => setSidebarOpen(false)} className="rounded-md p-1 text-muted-foreground hover:bg-secondary">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <nav className="flex-1 space-y-4 overflow-y-auto p-3">
                {filteredGroups.map(group => (
                  <div key={group.label || '_top'}>
                    {group.label && (
                      <p className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                        {group.label}
                      </p>
                    )}
                    <div className="space-y-0.5">
                      {group.items.map(item => (
                        <Link
                          key={item.name}
                          href={item.href}
                          onClick={() => setSidebarOpen(false)}
                          className={cn(
                            'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                            pathname === item.href
                              ? 'bg-primary/10 text-primary'
                              : 'text-foreground/70 hover:bg-secondary hover:text-foreground'
                          )}
                        >
                          <item.icon className="w-[18px] h-[18px] shrink-0" />
                          {item.name}
                        </Link>
                      ))}
                    </div>
                  </div>
                ))}
              </nav>
            </div>
          </div>
        )}
      </div>

      {/* Desktop sidebar */}
      <div className="hidden lg:fixed lg:inset-y-0 lg:z-50 lg:flex lg:w-64 lg:flex-col">
        <div className="flex flex-col flex-1 min-h-0 bg-card border-r border-border">
          <div className="flex items-center h-16 px-6 border-b border-border">
            <span className="inline-flex items-center gap-2.5 font-display text-xl font-medium tracking-tight">
              <BrandLogo className="h-9 w-9 text-primary" />
              ВІДЛІК
            </span>
          </div>
          <nav className="flex-1 overflow-y-auto p-3 space-y-4">
            {filteredGroups.map(group => (
              <div key={group.label || '_top'}>
                {group.label && (
                  <p className="px-3 mb-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                    {group.label}
                  </p>
                )}
                <div className="space-y-0.5">
                  {group.items.map(item => {
                    const active = pathname === item.href
                    return (
                      <Link
                        key={item.name}
                        href={item.href}
                        className={cn(
                          'relative flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors duration-150',
                          active
                            ? 'bg-primary/10 text-primary'
                            : 'text-foreground/70 hover:bg-secondary hover:text-foreground'
                        )}
                      >
                        {active && <span className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-primary" />}
                        <item.icon className="w-[18px] h-[18px] shrink-0" />
                        {item.name}
                      </Link>
                    )
                  })}
                </div>
              </div>
            ))}
          </nav>
          <div className="p-3 border-t border-border space-y-0.5">
            <Link
              href="/dashboard/profile"
              className={cn(
                'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors duration-150',
                pathname === '/dashboard/profile'
                  ? 'bg-primary/10 text-primary'
                  : 'text-foreground/70 hover:bg-secondary hover:text-foreground'
              )}
            >
              <UserCircle className="w-[18px] h-[18px] shrink-0" />
              Мій профіль
            </Link>
            <button
              onClick={handleLogout}
              className="flex w-full items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-destructive hover:bg-destructive/10 transition-colors duration-150"
            >
              <LogOut className="w-[18px] h-[18px] shrink-0" />
              Вийти
            </button>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="lg:pl-64">
        {/* Header */}
        <header className="sticky top-0 z-40 flex items-center h-16 px-4 bg-card/85 border-b border-border backdrop-blur-xl lg:px-6">
          <button
            className="lg:hidden mr-4 text-foreground"
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
                className="w-full rounded-lg border-[1.5px] border-border bg-card px-4 py-2 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground/60 focus:border-accent focus:ring-[3px] focus:ring-accent/25"
              />
              {searchOpen && (searchQuery.trim().length >= 2 || searching) && (
                <div className="absolute mt-2 w-full rounded-xl border border-border bg-card p-3 shadow-lg">
                  {searching && <p className="text-xs text-muted-foreground">Пошук...</p>}
                  {!searching && (
                    <div className="space-y-2 text-sm">
                      {searchData.reports.length > 0 && (
                        <div>
                          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Звіти</p>
                          {searchData.reports.slice(0, 4).map((item) => (
                            <Link
                              key={`report-${item.id}`}
                              href={`/dashboard/reports/${item.id}`}
                              className="block rounded-md px-2 py-1.5 text-foreground hover:bg-secondary"
                              onClick={() => setSearchOpen(false)}
                            >
                              {item.title}
                            </Link>
                          ))}
                        </div>
                      )}
                      {searchData.tasks.length > 0 && (
                        <div>
                          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Задачі</p>
                          {searchData.tasks.slice(0, 4).map((item) => (
                            <Link
                              key={`task-${item.id}`}
                              href={`/dashboard/tasks?taskId=${item.id}`}
                              className="block rounded-md px-2 py-1.5 text-foreground hover:bg-secondary"
                              onClick={() => setSearchOpen(false)}
                            >
                              {item.title}
                            </Link>
                          ))}
                        </div>
                      )}
                      {searchData.users.length > 0 && (
                        <div>
                          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Співробітники</p>
                          {searchData.users.slice(0, 4).map((item) => (
                            <p key={`user-${item.id}`} className="rounded-md px-2 py-1.5 text-foreground">
                              {item.fullName} · {item.departmentName}
                            </p>
                          ))}
                        </div>
                      )}
                      {!searchData.reports.length && !searchData.tasks.length && !searchData.users.length && (
                        <p className="text-xs text-muted-foreground">Нічого не знайдено</p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={cycleFontSize}
              title="Розмір шрифту"
              className="flex h-9 w-9 items-center justify-center rounded-lg text-sm font-semibold text-foreground/70 hover:bg-secondary hover:text-foreground transition-colors"
            >
              {fontSizeLabel}
            </button>
            <Button variant="ghost" size="icon" onClick={toggleTheme} title="Перемкнути тему">
              {isDark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </Button>
            <Link href="/dashboard/notifications">
              <Button variant="ghost" size="icon" className="relative">
                <Bell className="w-5 h-5" />
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 flex min-w-5 h-5 items-center justify-center px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] font-medium leading-none">
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                )}
              </Button>
            </Link>
            <div className="flex items-center gap-3">
              <div className="hidden text-right sm:block">
                <p className="text-sm font-medium text-foreground">{user?.firstName} {user?.lastName}</p>
                <p className="text-xs text-muted-foreground">{roleTitle} · {user?.department?.nameUk}</p>
              </div>
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary font-medium text-primary-foreground">
                {user?.firstName?.charAt(0)}{user?.lastName?.charAt(0)}
              </div>
            </div>
          </div>
        </header>

        {/* Page content */}
        <AnimatePresence mode="wait">
          <motion.main
            key={pathname}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15, ease: [0.4, 0, 0.2, 1] }}
            className="p-4 lg:p-6"
          >
            {children}
          </motion.main>
        </AnimatePresence>
      </div>

      {showOnboarding && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-xl rounded-2xl bg-card p-6 shadow-2xl">
            <h2 className="font-display text-xl font-bold tracking-tight text-foreground">Короткий старт</h2>
            <p className="mt-1 text-sm text-muted-foreground">Ваша роль: <span className="font-medium text-foreground">{roleTitle}</span></p>
            <ul className="mt-4 space-y-2.5 text-sm text-foreground/80">
              {(user?.role === 'specialist' || user?.role === 'lawyer' || user?.role === 'accountant' || user?.role === 'hr') && (
                <>
                  <li className="flex gap-2"><span className="text-accent">•</span> Створюйте чернетку звіту, генеруйте AI-текст, перевіряйте чек-лист та відправляйте на погодження.</li>
                  <li className="flex gap-2"><span className="text-accent">•</span> Оновлюйте статуси своїх задач та дотримуйтесь дедлайнів.</li>
                </>
              )}
              {user?.role === 'manager' && (
                <>
                  <li className="flex gap-2"><span className="text-accent">•</span> Перевіряйте звіти підрозділу, залишайте зауваження по секціях і погоджуйте або повертайте на доопрацювання.</li>
                  <li className="flex gap-2"><span className="text-accent">•</span> Керуйте задачами співробітників та контролюйте виконання.</li>
                </>
              )}
              {user?.role === 'clerk' && (
                <>
                  <li className="flex gap-2"><span className="text-accent">•</span> Опрацьовуйте звіти від керівників відділів, узгоджуйте та формуйте консолідовану картину для директора.</li>
                  <li className="flex gap-2"><span className="text-accent">•</span> Використовуйте AI-резюме, щоб швидко прибрати дублікати та підготувати зведений матеріал.</li>
                </>
              )}
              {(user?.role === 'director' || user?.role === 'deputy_director') && (
                <>
                  <li className="flex gap-2"><span className="text-accent">•</span> Проводьте фінальне погодження та переглядайте міжпідрозділову аналітику.</li>
                  <li className="flex gap-2"><span className="text-accent">•</span> Використовуйте друк-версію і експорт для офіційних документів.</li>
                </>
              )}
              {user?.role === 'deputy_head' && (
                <>
                  <li className="flex gap-2"><span className="text-accent">•</span> Маєте оглядовий доступ до звітів і задач усіх підрозділів.</li>
                  <li className="flex gap-2"><span className="text-accent">•</span> Контролюйте загальну картину виконання та аналітику.</li>
                </>
              )}
              {user?.role === 'admin' && (
                <>
                  <li className="flex gap-2"><span className="text-accent">•</span> Підтримуйте структуру підрозділів, ролі, доступи та політики безпеки.</li>
                  <li className="flex gap-2"><span className="text-accent">•</span> Контролюйте аудит і системні налаштування.</li>
                </>
              )}
            </ul>
            <div className="mt-6 flex justify-end">
              <Button onClick={closeOnboarding}>Зрозуміло</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
