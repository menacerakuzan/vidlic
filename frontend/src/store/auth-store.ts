import { create } from 'zustand'

export interface User {
  id: string
  email: string
  employeeId: string
  firstName: string
  lastName: string
  patronymic?: string
  role: 'specialist' | 'manager' | 'clerk' | 'director' | 'deputy_head' | 'deputy_director' | 'lawyer' | 'accountant' | 'hr' | 'admin'
  scopeDepartmentIds?: string[] | null
  department?: {
    id: string
    name: string
    nameUk: string
    code: string
  }
  position?: {
    id: string
    title: string
    titleUk: string
  }
}

interface AuthState {
  user: User | null
  accessToken: string | null
  refreshToken: string | null
  isAuthenticated: boolean
  setAuth: (user: User, accessToken: string, refreshToken: string) => void
  logout: () => void
  updateUser: (user: Partial<User>) => void
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  accessToken: null,
  refreshToken: null,
  isAuthenticated: false,
  setAuth: (user, accessToken, refreshToken) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('vidlik-user', JSON.stringify(user))
      localStorage.setItem('vidlik-accessToken', accessToken)
      localStorage.setItem('vidlik-refreshToken', refreshToken)
    }
    set({
      user,
      accessToken,
      refreshToken,
      isAuthenticated: true,
    })
  },
  logout: () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('vidlik-user')
      localStorage.removeItem('vidlik-accessToken')
      localStorage.removeItem('vidlik-refreshToken')
    }
    set({
      user: null,
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,
    })
  },
  updateUser: (updates) =>
    set((state) => ({
      user: state.user ? { ...state.user, ...updates } : null,
    })),
}))

if (typeof window !== 'undefined') {
  try {
    const storedUser = localStorage.getItem('vidlik-user')
    const storedAccessToken = localStorage.getItem('vidlik-accessToken')
    const storedRefreshToken = localStorage.getItem('vidlik-refreshToken')
    
    if (storedUser && storedAccessToken) {
      useAuthStore.setState({
        user: JSON.parse(storedUser),
        accessToken: storedAccessToken,
        refreshToken: storedRefreshToken,
        isAuthenticated: true,
      })
    }
  } catch (e) {
    console.error('Failed to restore auth state:', e)
  }
}
