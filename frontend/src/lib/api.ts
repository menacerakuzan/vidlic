// Use relative path with frontend proxy so that /api/v1/* is proxied to the backend during dev
const API_URL = '/api/v1'

class ApiError extends Error {
  status: number
  data: any

  constructor(message: string, status: number, data?: any) {
    super(message)
    this.status = status
    this.data = data
  }
}

async function refreshAccessToken(refreshToken: string): Promise<string> {
  const res = await fetch(`${API_URL}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  })

  if (!res.ok) {
    throw new Error('Failed to refresh token')
  }

  const data = await res.json()
  return data.accessToken
}

export const api = {
  async get<T>(endpoint: string, accessToken?: string): Promise<T> {
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    }

    if (accessToken) {
      headers['Authorization'] = `Bearer ${accessToken}`
    }

    const res = await fetch(`${API_URL}${endpoint}`, { headers })

    if (!res.ok) {
      const error = await res.json().catch(() => ({}))
      throw new ApiError(error.error?.message || 'Request failed', res.status, error)
    }

    return res.json()
  },

  async post<T>(endpoint: string, data?: any, accessToken?: string): Promise<T> {
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    }

    if (accessToken) {
      headers['Authorization'] = `Bearer ${accessToken}`
    }

    const res = await fetch(`${API_URL}${endpoint}`, {
      method: 'POST',
      headers,
      body: data ? JSON.stringify(data) : undefined,
    })

    if (!res.ok) {
      const error = await res.json().catch(() => ({}))
      throw new ApiError(error.error?.message || 'Request failed', res.status, error)
    }

    return res.json()
  },

  async put<T>(endpoint: string, data?: any, accessToken?: string): Promise<T> {
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    }

    if (accessToken) {
      headers['Authorization'] = `Bearer ${accessToken}`
    }

    const res = await fetch(`${API_URL}${endpoint}`, {
      method: 'PUT',
      headers,
      body: data ? JSON.stringify(data) : undefined,
    })

    if (!res.ok) {
      const error = await res.json().catch(() => ({}))
      throw new ApiError(error.error?.message || 'Request failed', res.status, error)
    }

    return res.json()
  },

  async delete<T>(endpoint: string, accessToken?: string): Promise<T> {
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    }

    if (accessToken) {
      headers['Authorization'] = `Bearer ${accessToken}`
    }

    const res = await fetch(`${API_URL}${endpoint}`, {
      method: 'DELETE',
      headers,
    })

    if (!res.ok) {
      const error = await res.json().catch(() => ({}))
      throw new ApiError(error.error?.message || 'Request failed', res.status, error)
    }

    return res.json()
  },
}
