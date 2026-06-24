import type { Metadata } from 'next'
import localFont from 'next/font/local'
import './globals.css'
import { Providers } from '@/components/providers'

// Офіційний шрифт державних органів України — e-Ukraine (текст) та e-UkraineHead (заголовки)
const eUkraine = localFont({
  src: [
    { path: '../../public/fonts/e-Ukraine-Light.otf', weight: '300', style: 'normal' },
    { path: '../../public/fonts/e-Ukraine-Regular.otf', weight: '400', style: 'normal' },
    { path: '../../public/fonts/e-Ukraine-Medium.otf', weight: '500', style: 'normal' },
    { path: '../../public/fonts/e-Ukraine-Bold.otf', weight: '700', style: 'normal' },
  ],
  variable: '--font-e-ukraine',
  display: 'swap',
})

const eUkraineHead = localFont({
  src: [
    { path: '../../public/fonts/e-UkraineHead-Light.otf', weight: '300', style: 'normal' },
    { path: '../../public/fonts/e-UkraineHead-Regular.otf', weight: '400', style: 'normal' },
    { path: '../../public/fonts/e-UkraineHead-Medium.otf', weight: '500', style: 'normal' },
    { path: '../../public/fonts/e-UkraineHead-Bold.otf', weight: '700', style: 'normal' },
  ],
  variable: '--font-e-ukraine-head',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Відлік — Корпоративна система звітності',
  description: 'Система управління звітністю та задачами для підприємств',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="uk">
      <body className={`${eUkraine.variable} ${eUkraineHead.variable} font-sans`}>
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  )
}
