import type { ReactNode } from 'react'
import { Toaster } from '@/components/ui/sonner'

export const metadata = { title: 'Mitarbeiter-Portal — PrimeHub' }

export default function PortalLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      {children}
      <Toaster richColors position="top-center" />
    </div>
  )
}
