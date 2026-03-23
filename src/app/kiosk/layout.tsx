import type { ReactNode } from 'react'
import { Toaster } from '@/components/ui/sonner'

export const metadata = { title: 'Zeiterfassung — Check-in' }

// Vollbild-Layout für iPad-Kiosk — kein Sidebar, kein Header
export default function KioskLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-[#0a1510] flex items-center justify-center">
      {children}
      <Toaster richColors position="top-center" />
    </div>
  )
}
