'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, Workflow, ShoppingCart, Database, RefreshCw, LogOut, Package } from 'lucide-react'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import { createClient } from '@/lib/supabase/client'
import { McpStatus } from '@/components/McpStatus'
import { cn } from '@/lib/utils'

const navItems = [
  {
    label: 'Workflow Hub',
    desc: 'Upload & Verarbeitung',
    href: '/dashboard/workflow-hub',
    icon: LayoutDashboard,
  },
  {
    label: 'Workflow Monitor',
    desc: 'N8N Status & Steuerung',
    href: '/dashboard/workflows',
    icon: Workflow,
  },
  {
    label: 'Bestellungen',
    desc: 'Google Drive Sync',
    href: '/dashboard/orders',
    icon: ShoppingCart,
  },
  {
    label: 'Preisdatenbank',
    desc: 'SKU, ASIN & EAN',
    href: '/dashboard/prices',
    icon: Database,
  },
  {
    label: 'Repricer',
    desc: 'Automatische Preise',
    href: '/dashboard/repricer',
    icon: RefreshCw,
  },
  {
    label: 'Lieferantenlisten',
    desc: 'Blank · A43-Kulturgut · Avus',
    href: '/dashboard/lieferantenlisten',
    icon: Package,
  },
]

interface DashboardSidebarProps {
  userEmail: string | null
}

export function DashboardSidebar({ userEmail }: DashboardSidebarProps) {
  const pathname = usePathname()

  const handleLogout = async () => {
    try {
      const supabase = createClient()
      await supabase.auth.signOut()
    } catch {
      // sign out failed, redirect anyway
    } finally {
      window.location.href = '/'
    }
  }

  return (
    <aside className="flex h-screen w-64 shrink-0 flex-col bg-[#0a1510] border-r border-white/10">
      {/* Header */}
      <div className="px-4 py-5 border-b border-white/10">
        <a
          href="/landing"
          className="text-sm font-bold text-white/90 hover:text-white transition-colors tracking-tight"
        >
          PrimeHub Dashboard
        </a>
        <div className="mt-1 flex items-center gap-1.5">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-500 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500" />
          </span>
          <span className="text-[10px] text-green-400 font-medium">Live</span>
        </div>
      </div>

      {/* Navigation Tiles */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-2">
        <p className="px-1 mb-3 text-[10px] font-semibold uppercase tracking-widest text-white/30">
          Navigation
        </p>
        {navItems.map((item) => {
          const isActive = pathname.startsWith(item.href)
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 rounded-xl border px-3 py-2.5 transition-all duration-200 group',
                isActive
                  ? 'border-green-500/40 bg-green-500/10 text-white shadow-[0_0_12px_rgba(0,94,48,0.3)]'
                  : 'border-white/8 bg-white/4 text-white/60 hover:bg-white/8 hover:border-white/15 hover:text-white/90'
              )}
            >
              <div
                className={cn(
                  'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors',
                  isActive
                    ? 'bg-green-500/20'
                    : 'bg-white/8 group-hover:bg-white/12'
                )}
              >
                <item.icon
                  className={cn(
                    'h-4 w-4',
                    isActive ? 'text-green-400' : 'text-white/50 group-hover:text-white/80'
                  )}
                />
              </div>
              <div className="min-w-0">
                <p className={cn(
                  'text-sm font-medium leading-none',
                  isActive ? 'text-white' : 'text-white/70 group-hover:text-white/90'
                )}>
                  {item.label}
                </p>
                <p className="mt-0.5 text-[11px] text-white/35 truncate">{item.desc}</p>
              </div>
              {isActive && (
                <div className="ml-auto h-1.5 w-1.5 shrink-0 rounded-full bg-green-400" />
              )}
            </Link>
          )
        })}
      </nav>

      {/* Footer */}
      <div className="px-3 py-4 border-t border-white/10 space-y-3">
        <McpStatus />
        {userEmail && (
          <p className="text-[11px] text-white/30 truncate px-1">{userEmail}</p>
        )}
        <button
          onClick={handleLogout}
          className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs text-white/40 hover:bg-white/6 hover:text-white/70 transition-colors"
        >
          <LogOut className="h-3.5 w-3.5" />
          Abmelden
        </button>
      </div>
    </aside>
  )
}
