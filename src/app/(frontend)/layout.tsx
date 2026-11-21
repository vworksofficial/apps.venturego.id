import React from 'react'
import type { Metadata, Viewport } from 'next'
import { Google_Sans, Plus_Jakarta_Sans } from 'next/font/google'
import '@fontsource-variable/inter'
import './styles.css'
import { ServiceWorkerRegister } from './_components/service-worker-register'

const plusJakartaSans = Plus_Jakarta_Sans({
  subsets: ['latin'],
  variable: '--font-plus-jakarta',
  display: 'swap',
})

// Font khas aplikasi Google; Plus Jakarta Sans menjadi cadangan.
const googleSans = Google_Sans({
  subsets: ['latin'],
  variable: '--font-google-sans',
  display: 'swap',
})

const title = 'VentureGo VSV'
const description = 'Pengajuan pembiayaan syariah Wakalah bil Ujrah untuk siswa VSV'

export const viewport: Viewport = {
  themeColor: '#0b57d0',
  width: 'device-width',
  initialScale: 1,
}

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'),
  title,
  description,
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'VentureGo',
  },
  icons: {
    icon: [
      { url: '/favicon.svg', type: 'image/svg+xml' },
      { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
    ],
    shortcut: '/favicon.ico',
    apple: '/apple-touch-icon.png',
  },
  manifest: '/manifest.webmanifest',
  openGraph: {
    title,
    description,
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      className={`${plusJakartaSans.variable} ${googleSans.variable}`}
      lang="id"
      suppressHydrationWarning
    >
      <body className="min-h-screen bg-white text-slate-950 antialiased" suppressHydrationWarning>
        <ServiceWorkerRegister />
        <div id="root" tabIndex={-1}>
          {children}
        </div>
      </body>
    </html>
  )
}
