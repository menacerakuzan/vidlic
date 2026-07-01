import { useAuthStore } from '@/store/auth-store'

// Deduplicate concurrent refreshes: if many requests 401 at once, only one
// refresh call is made and all of them await the same promise.
let refreshPromise: Promise<string | null> | null = null

function readAccessToken(): string | null {
  const fromStore = useAuthStore.getState().accessToken
  if (fromStore) return fromStore
  if (typeof window !== 'undefined') return localStorage.getItem('vidlik-accessToken')
  return null
}

function readRefreshToken(): string | null {
  const fromStore = useAuthStore.getState().refreshToken
  if (fromStore) return fromStore
  if (typeof window !== 'undefined') return localStorage.getItem('vidlik-refreshToken')
  return null
}

async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = readRefreshToken()
  if (!refreshToken) {
    useAuthStore.getState().logout()
    return null
  }
  try {
    const res = await fetch('/api/v1/auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    })
    if (!res.ok) {
      useAuthStore.getState().logout()
      return null
    }
    const data = await res.json()
    const newAccess = data.accessToken as string
    const newRefresh = (data.refreshToken as string) ?? refreshToken
    if (typeof window !== 'undefined') {
      localStorage.setItem('vidlik-accessToken', newAccess)
      localStorage.setItem('vidlik-refreshToken', newRefresh)
    }
    useAuthStore.setState({
      accessToken: newAccess,
      refreshToken: newRefresh,
      isAuthenticated: true,
    })
    return newAccess
  } catch {
    useAuthStore.getState().logout()
    return null
  }
}

/**
 * fetch wrapper that always attaches a fresh access token and, on 401,
 * transparently refreshes the token once and retries the request.
 * Use this for every authenticated API call so sessions never silently die.
 */
export async function authFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const token = readAccessToken()
  const headers = new Headers(init.headers || {})
  if (token) headers.set('Authorization', `Bearer ${token}`)

  let res = await fetch(input, { ...init, headers })

  if (res.status === 401) {
    if (!refreshPromise) {
      refreshPromise = refreshAccessToken().finally(() => { refreshPromise = null })
    }
    const newToken = await refreshPromise
    if (newToken) {
      const retryHeaders = new Headers(init.headers || {})
      retryHeaders.set('Authorization', `Bearer ${newToken}`)
      res = await fetch(input, { ...init, headers: retryHeaders })
    } else if (typeof window !== 'undefined') {
      // Refresh failed — session is gone; send user to the login page (root).
      window.location.href = '/'
    }
  }

  return res
}
