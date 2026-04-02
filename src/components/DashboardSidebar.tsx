'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import {
  LayoutDashboard, Workflow, ShoppingCart, Database,
  RefreshCw, LogOut, Package, BookOpen, Clock, ChevronLeft, ChevronRight, CheckSquare, Building2, MessageCircle,
} from 'lucide-react'
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
  {
    label: 'Rebuy Scraper',
    desc: 'Bücher · wöchentlich · Excel',
    href: '/dashboard/rebuy',
    icon: BookOpen,
  },
  {
    label: 'Zeiterfassung',
    desc: 'Check-in · Stunden · Planung',
    href: '/dashboard/zeiterfassung',
    icon: Clock,
  },
  {
    label: 'Aufgaben',
    desc: 'To-Dos · Delegation · KPIs',
    href: '/dashboard/aufgaben',
    icon: CheckSquare,
  },
  {
    label: 'Kommunikation',
    desc: 'WhatsApp · Nachrichten · Verlauf',
    href: '/dashboard/kommunikation',
    icon: MessageCircle,
  },
  {
    label: 'Organisation',
    desc: 'Team · Hierarchie · Stammdaten',
    href: '/dashboard/organisation',
    icon: Building2,
  },
]

interface DashboardSidebarProps {
  userEmail: string | null
}

export function DashboardSidebar({ userEmail }: DashboardSidebarProps) {
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState(false)

  // Persist collapse state in localStorage
  useEffect(() => {
    const stored = localStorage.getItem('sidebar-collapsed')
    if (stored === 'true') setCollapsed(true)
  }, [])

  const toggle = () => {
    setCollapsed((prev) => {
      localStorage.setItem('sidebar-collapsed', String(!prev))
      return !prev
    })
  }

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
    <aside
      className={cn(
        'flex h-screen shrink-0 flex-col bg-[#0a1510] border-r border-white/10 transition-all duration-300 ease-in-out',
        collapsed ? 'w-16' : 'w-64'
      )}
    >
      {/* Header */}
      <div className="px-3 py-5 border-b border-white/10 flex items-center justify-between min-h-[72px]">
        {!collapsed && (
          <a
            href="/landing"
            className="text-sm font-bold text-white/90 hover:text-white transition-colors tracking-tight"
          >
            PrimeHub Dashboard
            <div className="mt-1 flex items-center gap-1.5">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-500 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500" />
              </span>
              <span className="text-[10px] text-green-400 font-medium">Live</span>
            </div>
          </a>
        )}
        {collapsed && (
          <div className="mx-auto flex items-center justify-center">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-500 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500" />
            </span>
          </div>
        )}
        <button
          onClick={toggle}
          className={cn(
            'flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-white/30 hover:bg-white/8 hover:text-white/70 transition-colors',
            collapsed && 'mx-auto'
          )}
          title={collapsed ? 'Sidebar ausklappen' : 'Sidebar einklappen'}
        >
          {collapsed ? (
            <ChevronRight className="h-4 w-4" />
          ) : (
            <ChevronLeft className="h-4 w-4" />
          )}
        </button>
      </div>

      {/* Navigation */}
      <nav className={cn('flex-1 overflow-y-auto py-4 space-y-2', collapsed ? 'px-2' : 'px-3')}>
        {!collapsed && (
          <p className="px-1 mb-3 text-[10px] font-semibold uppercase tracking-widest text-white/30">
            Navigation
          </p>
        )}
        {navItems.map((item) => {
          const isActive = pathname.startsWith(item.href)
          return (
            <Link
              key={item.href}
              href={item.href}
              title={collapsed ? item.label : undefined}
              className={cn(
                'flex items-center rounded-xl border transition-all duration-200 group',
                collapsed ? 'justify-center px-0 py-2.5' : 'gap-3 px-3 py-2.5',
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
              {!collapsed && (
                <>
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
                </>
              )}
            </Link>
          )
        })}
      </nav>

      {/* Footer */}
      <div className={cn('py-4 border-t border-white/10 space-y-3', collapsed ? 'px-2' : 'px-3')}>
        {!collapsed && <McpStatus />}
        {!collapsed && userEmail && (
          <p className="text-[11px] text-white/30 truncate px-1">{userEmail}</p>
        )}
        <button
          onClick={handleLogout}
          title={collapsed ? 'Abmelden' : undefined}
          className={cn(
            'flex w-full items-center rounded-lg px-3 py-2 text-xs text-white/40 hover:bg-white/6 hover:text-white/70 transition-colors',
            collapsed ? 'justify-center' : 'gap-2'
          )}
        >
          <LogOut className="h-3.5 w-3.5 shrink-0" />
          {!collapsed && 'Abmelden'}
        </button>
      </div>
    </aside>
  )
}
