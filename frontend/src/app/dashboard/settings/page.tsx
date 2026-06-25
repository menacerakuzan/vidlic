'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { DashboardLayout } from '@/components/dashboard-layout'
import { useAuthStore } from '@/store/auth-store'

// ── Types ─────────────────────────────────────────────────────────────────────

type DigestSettings = {
  frequency: 'daily' | 'weekly'
  hour: number
  minute: number
  weekdays: string
  isActive: boolean
}

type FlowStep = {
  order: number
  role: 'manager' | 'clerk' | 'director' | 'deputy_director'
}

const APPROVAL_ROLES: { value: FlowStep['role']; label: string; hint: string }[] = [
  { value: 'manager', label: 'Керівник відділу', hint: 'Перший рівень — підписує начальник підрозділу' },
  { value: 'clerk', label: 'Діловод', hint: 'Перевіряє оформлення та реєструє документ' },
  { value: 'director', label: 'Директор', hint: 'Фінальне затвердження на рівні департаменту' },
  { value: 'deputy_director', label: 'Заступник директора', hint: 'Погодження на рівні заступника' },
]

const SOUND_OPTIONS = [
  { value: 'none', label: 'Без звуку' },
  { value: '/sounds/notification.mp3', label: 'Стандартний' },
]

const HOURS = Array.from({ length: 24 }, (_, i) => i)
const WEEKDAY_LABELS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Нд']

// ── Helpers ───────────────────────────────────────────────────────────────────

function pad(n: number) {
  return String(n).padStart(2, '0')
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const { user } = useAuthStore()
  const isAdmin = user?.role === 'admin' || user?.role === 'director'
  const accessToken = typeof window !== 'undefined' ? localStorage.getItem('vidlik-accessToken') : null

  // UI preferences
  const [isDark, setIsDark] = useState(false)
  const [notificationSound, setNotificationSound] = useState('none')
  const audioRef = useRef<HTMLAudioElement | null>(null)

  // Digest settings
  const [digest, setDigest] = useState<DigestSettings>({
    frequency: 'daily',
    hour: 8,
    minute: 0,
    weekdays: '1,2,3,4,5',
    isActive: false,
  })
  const [digestSaving, setDigestSaving] = useState(false)
  const [digestMsg, setDigestMsg] = useState('')

  // Approval flow (admin only)
  const [flowSteps, setFlowSteps] = useState<FlowStep[]>([])
  const [flowLoading, setFlowLoading] = useState(false)
  const [flowSaving, setFlowSaving] = useState(false)
  const [flowMsg, setFlowMsg] = useState('')

  // ── Load initial state ──────────────────────────────────────────────────────

  useEffect(() => {
    setIsDark(document.documentElement.classList.contains('dark'))
    setNotificationSound(localStorage.getItem('vidlik-notification-sound') || 'none')
  }, [])

  useEffect(() => {
    if (!accessToken) return
    fetch('/api/v1/analytics/digest-settings', {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
      .then((r) => r.json())
      .then((data) => {
        if (data?.frequency) setDigest(data)
      })
      .catch(() => {})
  }, [accessToken])

  const loadFlow = useCallback(async () => {
    if (!isAdmin || !accessToken) return
    setFlowLoading(true)
    try {
      const r = await fetch('/api/v1/approvals/flows/report', {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      const data = await r.json()
      if (Array.isArray(data?.steps) && data.steps.length > 0) {
        setFlowSteps(data.steps.map((s: any) => ({ order: s.order, role: s.role })))
      } else {
        // Default flow if not configured yet
        setFlowSteps([
          { order: 1, role: 'manager' },
          { order: 2, role: 'clerk' },
          { order: 3, role: 'director' },
        ])
      }
    } catch {
      /* ignore */
    } finally {
      setFlowLoading(false)
    }
  }, [isAdmin, accessToken])

  useEffect(() => {
    loadFlow()
  }, [loadFlow])

  // ── Handlers ────────────────────────────────────────────────────────────────

  const setTheme = (dark: boolean) => {
    document.documentElement.classList.toggle('dark', dark)
    localStorage.setItem('vidlik-theme', dark ? 'dark' : 'light')
    setIsDark(dark)
  }

  const handleSoundChange = (value: string) => {
    setNotificationSound(value)
    localStorage.setItem('vidlik-notification-sound', value)
    if (value !== 'none') {
      if (audioRef.current) { audioRef.current.pause(); audioRef.current.currentTime = 0 }
      const a = new Audio(value)
      audioRef.current = a
      a.play().catch(() => {})
    }
  }

  const saveDigest = async () => {
    if (!accessToken) return
    setDigestSaving(true)
    setDigestMsg('')
    const r = await fetch('/api/v1/analytics/digest-settings', {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(digest),
    })
    setDigestSaving(false)
    setDigestMsg(r.ok ? 'Збережено' : 'Помилка збереження')
    if (r.ok) setTimeout(() => setDigestMsg(''), 2500)
  }

  const toggleWeekday = (day: number) => {
    const current = digest.weekdays.split(',').filter(Boolean).map(Number)
    const next = current.includes(day) ? current.filter((d) => d !== day) : [...current, day].sort()
    setDigest((p) => ({ ...p, weekdays: next.join(',') }))
  }

  // Flow step management
  const addFlowStep = (role: FlowStep['role']) => {
    if (flowSteps.some((s) => s.role === role)) return
    const next = [...flowSteps, { order: flowSteps.length + 1, role }]
    setFlowSteps(next.map((s, i) => ({ ...s, order: i + 1 })))
  }

  const removeFlowStep = (role: FlowStep['role']) => {
    const next = flowSteps.filter((s) => s.role !== role)
    setFlowSteps(next.map((s, i) => ({ ...s, order: i + 1 })))
  }

  const moveFlowStep = (role: FlowStep['role'], dir: -1 | 1) => {
    const idx = flowSteps.findIndex((s) => s.role === role)
    if (idx + dir < 0 || idx + dir >= flowSteps.length) return
    const next = [...flowSteps]
    ;[next[idx], next[idx + dir]] = [next[idx + dir], next[idx]]
    setFlowSteps(next.map((s, i) => ({ ...s, order: i + 1 })))
  }

  const saveFlow = async () => {
    if (!accessToken || flowSteps.length === 0) return
    setFlowSaving(true)
    setFlowMsg('')
    const r = await fetch('/api/v1/approvals/flows/report', {
      method: 'PUT',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ steps: flowSteps }),
    })
    setFlowSaving(false)
    setFlowMsg(r.ok ? 'Маршрут збережено. Нові звіти використовуватимуть цей порядок.' : 'Помилка збереження')
    if (r.ok) setTimeout(() => setFlowMsg(''), 4000)
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <DashboardLayout>
      <div className="max-w-3xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-semibold font-display">Налаштування</h1>
          <p className="text-muted-foreground mt-1">Параметри інтерфейсу, сповіщень та системи</p>
        </div>

        {/* ── Зовнішній вигляд ── */}
        <Section title="Зовнішній вигляд">
          <p className="text-xs text-muted-foreground mb-3">Оберіть тему інтерфейсу</p>
          <div className="flex gap-2">
            <ThemeButton label="Світла" active={!isDark} onClick={() => setTheme(false)} />
            <ThemeButton label="Темна" active={isDark} onClick={() => setTheme(true)} />
          </div>
        </Section>

        {/* ── Сповіщення ── */}
        <Section title="Сповіщення">
          <div className="space-y-4">
            <div>
              <p className="text-xs text-muted-foreground mb-2">Звук при отриманні сповіщення</p>
              <div className="flex gap-2">
                {SOUND_OPTIONS.map((opt) => (
                  <ThemeButton
                    key={opt.value}
                    label={opt.label}
                    active={notificationSound === opt.value}
                    onClick={() => handleSoundChange(opt.value)}
                  />
                ))}
              </div>
            </div>

            <div className="pt-3 border-t border-border">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="text-sm font-medium">Щоденний дайджест</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Зведення по задачах та погодженнях у вибраний час</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={digest.isActive}
                    onChange={(e) => setDigest((p) => ({ ...p, isActive: e.target.checked }))}
                    className="sr-only peer"
                  />
                  <div className="w-10 h-6 bg-muted rounded-full peer peer-checked:bg-primary transition-colors" />
                  <div className="absolute left-1 top-1 w-4 h-4 bg-white rounded-full transition-transform peer-checked:translate-x-4" />
                </label>
              </div>

              {digest.isActive && (
                <div className="space-y-3 pt-1">
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground w-20">Час відправки</span>
                    <select
                      value={digest.hour}
                      onChange={(e) => setDigest((p) => ({ ...p, hour: Number(e.target.value) }))}
                      className="h-8 rounded-lg border border-border bg-card px-2 text-sm text-foreground"
                    >
                      {HOURS.map((h) => (
                        <option key={h} value={h}>{pad(h)}:00</option>
                      ))}
                    </select>
                    <select
                      value={digest.frequency}
                      onChange={(e) => setDigest((p) => ({ ...p, frequency: e.target.value as 'daily' | 'weekly' }))}
                      className="h-8 rounded-lg border border-border bg-card px-2 text-sm text-foreground"
                    >
                      <option value="daily">Щодня</option>
                      <option value="weekly">Щотижня</option>
                    </select>
                  </div>

                  {digest.frequency === 'weekly' && (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground w-20">Дні тижня</span>
                      <div className="flex gap-1">
                        {WEEKDAY_LABELS.map((label, i) => {
                          const day = i + 1
                          const active = digest.weekdays.split(',').map(Number).includes(day)
                          return (
                            <button
                              key={day}
                              onClick={() => toggleWeekday(day)}
                              className={`w-8 h-8 rounded-lg text-xs font-medium border transition-colors ${
                                active
                                  ? 'bg-primary text-white border-primary'
                                  : 'bg-card border-border text-muted-foreground hover:border-primary/40'
                              }`}
                            >
                              {label}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  <div className="flex items-center gap-3 pt-1">
                    <button
                      onClick={saveDigest}
                      disabled={digestSaving}
                      className="rounded-lg bg-primary px-4 py-1.5 text-sm font-medium text-white disabled:opacity-60"
                    >
                      {digestSaving ? 'Збереження...' : 'Зберегти'}
                    </button>
                    {digestMsg && (
                      <span className="text-xs text-emerald-600">{digestMsg}</span>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </Section>

        {/* ── Адміністрування (тільки admin) ── */}
        {isAdmin && (
          <Section title="Маршрут погодження звітів" badge="Адмін">
            <p className="text-xs text-muted-foreground mb-4">
              Визначте порядок ролей, через які проходить кожен звіт перед затвердженням.
              Директори і адміністратори завжди затверджують власні звіти автоматично.
            </p>

            {flowLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-12 rounded-lg bg-muted animate-pulse" />
                ))}
              </div>
            ) : (
              <div className="space-y-2">
                {flowSteps.map((step, idx) => {
                  const meta = APPROVAL_ROLES.find((r) => r.value === step.role)
                  return (
                    <div
                      key={step.role}
                      className="flex items-center gap-3 rounded-xl border border-border bg-secondary px-4 py-3"
                    >
                      <span className="w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center shrink-0">
                        {step.order}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground">{meta?.label}</p>
                        <p className="text-xs text-muted-foreground">{meta?.hint}</p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={() => moveFlowStep(step.role, -1)}
                          disabled={idx === 0}
                          className="w-7 h-7 rounded-lg border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:border-primary/40 disabled:opacity-30 text-xs"
                          title="Вище"
                        >
                          ↑
                        </button>
                        <button
                          onClick={() => moveFlowStep(step.role, 1)}
                          disabled={idx === flowSteps.length - 1}
                          className="w-7 h-7 rounded-lg border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:border-primary/40 disabled:opacity-30 text-xs"
                          title="Нижче"
                        >
                          ↓
                        </button>
                        <button
                          onClick={() => removeFlowStep(step.role)}
                          className="w-7 h-7 rounded-lg border border-border flex items-center justify-center text-destructive/70 hover:text-destructive hover:border-destructive/40 text-xs ml-1"
                          title="Видалити крок"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  )
                })}

                {flowSteps.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    Маршрут порожній — звіти будуть авто-затверджені
                  </p>
                )}

                {/* Add step */}
                {APPROVAL_ROLES.filter((r) => !flowSteps.some((s) => s.role === r.value)).length > 0 && (
                  <div className="flex gap-2 pt-1 flex-wrap">
                    {APPROVAL_ROLES.filter((r) => !flowSteps.some((s) => s.role === r.value)).map((r) => (
                      <button
                        key={r.value}
                        onClick={() => addFlowStep(r.value)}
                        className="rounded-lg border border-dashed border-border px-3 py-1.5 text-xs text-muted-foreground hover:text-primary hover:border-primary/50 transition-colors"
                      >
                        + {r.label}
                      </button>
                    ))}
                  </div>
                )}

                <div className="flex items-center gap-3 pt-2 border-t border-border">
                  <button
                    onClick={saveFlow}
                    disabled={flowSaving || flowSteps.length === 0}
                    className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
                  >
                    {flowSaving ? 'Збереження...' : 'Зберегти маршрут'}
                  </button>
                  {flowMsg && (
                    <span className={`text-xs ${flowMsg.startsWith('Помилка') ? 'text-destructive' : 'text-emerald-600'}`}>
                      {flowMsg}
                    </span>
                  )}
                </div>
              </div>
            )}
          </Section>
        )}
      </div>
    </DashboardLayout>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Section({
  title,
  badge,
  children,
}: {
  title: string
  badge?: string
  children: React.ReactNode
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5 space-y-1">
      <div className="flex items-center gap-2 mb-3">
        <p className="text-sm font-semibold text-foreground">{title}</p>
        {badge && (
          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary uppercase tracking-wide">
            {badge}
          </span>
        )}
      </div>
      {children}
    </div>
  )
}

function ThemeButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-lg px-4 py-2 text-sm border transition-colors ${
        active
          ? 'bg-primary text-white border-primary'
          : 'bg-card border-border text-foreground/80 hover:border-primary/40'
      }`}
    >
      {label}
    </button>
  )
}
