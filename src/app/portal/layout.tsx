import type { ReactNode } from 'react'
import type { Metadata, Viewport } from 'next'
import { Toaster } from '@/components/ui/sonner'
import { PWAInit } from '@/components/zeiterfassung/portal/PWAInit'

export const metadata: Metadata = {
  title: 'PrimeHub App',
  description: 'Mitarbeiter-Portal der PrimeHub GbR — Arbeitszeit-Übersicht und Wochenplanung.',
  manifest: '/manifest.webmanifest',
  applicationName: 'PrimeHub App',
  appleWebApp: {
    capable: true,
    title: 'PrimeHub',
    statusBarStyle: 'black-translucent',
  },
  icons: {
    icon: [
      { url: '/icons/app-icon.svg', type: 'image/svg+xml' },
    ],
    apple: [
      { url: '/icons/app-icon.svg' },
    ],
  },
  formatDetection: {
    telephone: false,
  },
}

export const viewport: Viewport = {
  themeColor: '#0a1a10',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover',
}

export default function PortalLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      {children}
      <Toaster richColors position="top-center" />
      <PWAInit />
    </div>
  )
}
