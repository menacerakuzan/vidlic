'use client'

import { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState } from 'react'
import { useEffect } from 'react'

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000,
            refetchOnWindowFocus: false,
          },
        },
      })
  )

  useEffect(() => {
    const root = document.documentElement
    const stored = localStorage.getItem('vidlik-theme')
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    const useDark = stored ? stored === 'dark' : prefersDark
    root.classList.toggle('dark', useDark)
  }, [])

  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  )
}
