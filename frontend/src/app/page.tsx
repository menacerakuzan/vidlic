'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/store/auth-store'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loader2, Eye, EyeOff, ShieldCheck } from 'lucide-react'
import { BrandLogo } from '@/components/brand-logo'

export default function LoginPage() {
  const router = useRouter()
  const setAuth = useAuthStore((state) => state.setAuth)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const response = await api.post<{
        accessToken: string
        refreshToken: string
        user: any
      }>('/auth/login', { email, password })

      setAuth(response.user, response.accessToken, response.refreshToken)
      router.push('/dashboard')
    } catch (err: any) {
      console.error('Login error:', err)
      setError(err.message || err.data?.error?.message || 'Невірна пошта або пароль')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen w-full lg:grid lg:grid-cols-2">
      {/* Ліва панель — айдентика ОДА (темно-синій) */}
      <div className="relative hidden flex-col justify-between overflow-hidden bg-primary p-12 text-primary-foreground lg:flex">
        {/* Декоративні плями золота/світла — не на формі, лише в брендовій зоні */}
        <div className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-accent/15 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 -left-16 h-96 w-96 rounded-full bg-accent/10 blur-3xl" />

        <div className="relative flex items-center gap-3">
          <BrandLogo className="h-11 w-11 text-accent" />
          <span className="font-display text-xl font-medium tracking-tight">ВІДЛІК</span>
        </div>

        <div className="relative max-w-md space-y-5">
          <h2 className="font-display text-4xl font-bold leading-tight tracking-tight">
            Єдина система звітності та задач
          </h2>
          <p className="text-base leading-relaxed text-primary-foreground/70">
            Формування, погодження та облік звітів підрозділів в одному захищеному просторі.
          </p>
          <div className="flex items-center gap-2 pt-2 text-sm text-primary-foreground/60">
            <ShieldCheck className="h-4 w-4 text-accent" />
            Захищений доступ за обліковим записом
          </div>
        </div>

        <p className="relative text-sm text-primary-foreground/50">
          © {new Date().getFullYear()} Відлік. Усі права захищені.
        </p>
      </div>

      {/* Права панель — форма входу на світлій поверхні */}
      <div className="flex min-h-screen items-center justify-center bg-background p-6 lg:min-h-0">
        <div className="w-full max-w-sm animate-fade-in">
          {/* Логотип для мобільної версії (ліва панель прихована) */}
          <div className="mb-8 flex flex-col items-center gap-3 lg:hidden">
            <BrandLogo className="h-12 w-12 text-primary" />
            <span className="font-display text-2xl font-medium tracking-tight text-foreground">ВІДЛІК</span>
          </div>

          <div className="mb-8">
            <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">Вхід до системи</h1>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Введіть облікові дані для продовження
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3.5 py-2.5 text-sm text-destructive">
                {error}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="email" className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Електронна пошта
              </Label>
              <Input
                id="email"
                type="email"
                placeholder="user@org.gov.ua"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Пароль
              </Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Введіть пароль"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  className="pr-11"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-1 top-1/2 -translate-y-1/2 rounded-md p-2 text-muted-foreground transition-colors hover:text-foreground"
                  aria-label={showPassword ? 'Сховати пароль' : 'Показати пароль'}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <Button type="submit" className="w-full" size="lg" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Вхід...
                </>
              ) : (
                'Увійти'
              )}
            </Button>
          </form>

          <p className="mt-8 text-center text-xs text-muted-foreground lg:hidden">
            © {new Date().getFullYear()} Відлік. Усі права захищені.
          </p>
        </div>
      </div>
    </div>
  )
}
