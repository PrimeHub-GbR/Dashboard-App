import type { ReactNode } from 'react'

// Minimales Layout für Kiosk — kein Sidebar, kein Header
export default function KioskLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-[#0a1510] flex items-center justify-center">
      {children}
    </div>
  )
}
