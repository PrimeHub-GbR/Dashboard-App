'use client'

import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import { LogOut, BarChart3, CalendarRange } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface PortalSession {
  id: string
  name: string
  color: string
  loginAt: number
}

const SESSION_TTL = 8 * 60 * 60 * 1000

export function PortalHeader() {
  const router = useRouter()
  const pathname = usePathname()
  const [session, setSession] = useState<PortalSession | null>(null)

  useEffect(() => {
    const stored = sessionStorage.getItem('portal_session')
    if (!stored) { router.replace('/portal'); return }
    try {
      const s = JSON.parse(stored) as PortalSession
      if (Date.now() - s.loginAt > SESSION_TTL) {
        sessionStorage.removeItem('portal_session')
        router.replace('/portal')
        return
      }
      setSession(s)
    } catch {
      router.replace('/portal')
    }
  }, [router])

  function logout() {
    sessionStorage.removeItem('portal_session')
    router.replace('/portal')
  }

  if (!session) return null

  const isDashboard = pathname === '/portal/dashboard'
  const isPlanung = pathname === '/portal/planung'

  return (
    <div className="sticky top-0 z-10 bg-background border-b">
      {/* Identitäts-Zeile */}
      <div className="px-4 py-3 flex items-center gap-3">
        <div
          className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold text-white shrink-0"
          style={{ backgroundColor: session.color }}
        >
          {session.name.charAt(0).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm truncate">{session.name}</p>
          <p className="text-xs text-muted-foreground">Mitarbeiter-Portal</p>
        </div>
        <Button variant="ghost" size="sm" onClick={logout} className="gap-1.5 text-muted-foreground">
          <LogOut className="w-4 h-4" />
          Abmelden
        </Button>
      </div>

      {/* Tabs */}
      <div className="px-2 pb-2 flex gap-1">
        <Link
          href="/portal/dashboard"
          className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition-colors ${
            isDashboard
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:bg-muted'
          }`}
        >
          <BarChart3 className="w-4 h-4" />
          Übersicht
        </Link>
        <Link
          href="/portal/planung"
          className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition-colors ${
            isPlanung
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:bg-muted'
          }`}
        >
          <CalendarRange className="w-4 h-4" />
          Wochenplanung
        </Link>
      </div>
    </div>
  )
}
