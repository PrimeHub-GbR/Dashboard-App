'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import {
  LogOut, ChevronLeft, ChevronRight, Search,
} from 'lucide-react'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { createClient } from '@/lib/supabase/client'
import { McpStatus } from '@/components/McpStatus'
import { CommandPalette } from '@/components/CommandPalette'
import { homeItem, visibleNavGroups, type NavItem, type NavGroup } from '@/lib/nav-config'
import { cn } from '@/lib/utils'

interface DashboardSidebarProps {
  userEmail: string | null
  /** user_roles.role: 'admin' | 'manager' | 'staff' | null */
  role?: string | null
}

export function DashboardSidebar({ userEmail, role = null }: DashboardSidebarProps) {
  const pathname = usePathname()
  const navGroups = visibleNavGroups(role)
  const [collapsed, setCollapsed] = useState(false)
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({})
  const [cmdOpen, setCmdOpen] = useState(false)

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

  const toggleGroup = (label: string) => {
    setOpenGroups((prev) => ({ ...prev, [label]: !prev[label] }))
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

  // Aktiv-Erkennung: Übersicht exakt, alle anderen per Prefix
  const isActive = (href: string) =>
    href === '/dashboard' ? pathname === '/dashboard' : pathname.startsWith(href)
  const groupHasActive = (group: NavGroup) => group.items.some((i) => isActive(i.href))

  // Einzelner Navigations-Link (innerhalb einer aufgeklappten Gruppe / im Popover)
  const ItemLink = ({ item }: { item: NavItem }) => {
    const active = isActive(item.href)
    return (
      <Link
        href={item.href}
        className={cn(
          'flex items-center gap-3 rounded-lg border px-2 py-2 transition-all duration-200 group',
          active
            ? 'border-green-500/40 bg-green-500/10 text-white shadow-[0_0_12px_rgba(0,94,48,0.3)]'
            : 'border-transparent text-white/60 hover:bg-white/8 hover:border-white/15 hover:text-white/90'
        )}
      >
        <div
          className={cn(
            'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors',
            active ? 'bg-green-500/20' : 'bg-white/8 group-hover:bg-white/12'
          )}
        >
          <item.icon
            className={cn('h-4 w-4', active ? 'text-green-400' : 'text-white/50 group-hover:text-white/80')}
          />
        </div>
        <div className="min-w-0">
          <p className={cn('text-sm font-medium leading-none', active ? 'text-white' : 'text-white/70 group-hover:text-white/90')}>
            {item.label}
          </p>
          <p className="mt-0.5 text-[11px] text-white/35 truncate">{item.desc}</p>
        </div>
        {active && <div className="ml-auto h-1.5 w-1.5 shrink-0 rounded-full bg-green-400" />}
      </Link>
    )
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
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </button>
      </div>

      {/* Suche */}
      <div className={cn('pt-4', collapsed ? 'px-2' : 'px-3')}>
        <button
          onClick={() => setCmdOpen(true)}
          title={collapsed ? 'Suchen (⌘K)' : undefined}
          className={cn(
            'flex w-full items-center rounded-lg border border-white/8 bg-white/4 text-white/50 hover:bg-white/8 hover:text-white/80 transition-colors',
            collapsed ? 'justify-center px-0 py-2.5' : 'gap-2 px-3 py-2'
          )}
        >
          <Search className="h-4 w-4 shrink-0" />
          {!collapsed && (
            <>
              <span className="flex-1 text-left text-sm">Suchen…</span>
              <kbd className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-medium text-white/50">⌘K</kbd>
            </>
          )}
        </button>
      </div>

      {/* Navigation */}
      <nav className={cn('flex-1 overflow-y-auto py-4 space-y-1.5', collapsed ? 'px-2' : 'px-3')}>
        {/* Übersicht (Standalone) */}
        {collapsed ? (
          <Link
            href={homeItem.href}
            title={homeItem.label}
            className={cn(
              'flex items-center justify-center rounded-xl border px-0 py-2.5 transition-all duration-200',
              isActive(homeItem.href)
                ? 'border-green-500/40 bg-green-500/10 shadow-[0_0_12px_rgba(0,94,48,0.3)]'
                : 'border-white/8 bg-white/4 hover:bg-white/8 hover:border-white/15'
            )}
          >
            <homeItem.icon className={cn('h-4 w-4', isActive(homeItem.href) ? 'text-green-400' : 'text-white/50')} />
          </Link>
        ) : (
          <ItemLink item={homeItem} />
        )}

        {/* Gruppen */}
        {navGroups.map((group) => {
          const active = groupHasActive(group)

          // Rail-Modus: Gruppen-Icon + Popover mit den Items
          if (collapsed) {
            return (
              <Popover key={group.label}>
                <PopoverTrigger asChild>
                  <button
                    title={group.label}
                    className={cn(
                      'relative flex w-full items-center justify-center rounded-xl border px-0 py-2.5 transition-all duration-200',
                      active
                        ? 'border-green-500/40 bg-green-500/10'
                        : 'border-white/8 bg-white/4 hover:bg-white/8 hover:border-white/15'
                    )}
                  >
                    <group.icon className={cn('h-4 w-4', active ? 'text-green-400' : 'text-white/50')} />
                    {active && (
                      <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-green-400" />
                    )}
                  </button>
                </PopoverTrigger>
                <PopoverContent side="right" align="start" className="w-64 border-white/10 bg-[#0a1510] p-2 text-white">
                  <p className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-white/30">
                    {group.label}
                  </p>
                  <div className="space-y-1">
                    {group.items.map((item) => (
                      <ItemLink key={item.href} item={item} />
                    ))}
                  </div>
                </PopoverContent>
              </Popover>
            )
          }

          // Expandiert: aufklappbare Gruppe
          const isOpen = openGroups[group.label] ?? false
          return (
            <Collapsible key={group.label} open={isOpen} onOpenChange={() => toggleGroup(group.label)}>
              <CollapsibleTrigger asChild>
                <button
                  className={cn(
                    'flex w-full items-center gap-2 rounded-lg px-2 py-2 text-white/50 hover:bg-white/6 hover:text-white/80 transition-colors',
                    active && 'text-white/80'
                  )}
                >
                  <group.icon className="h-4 w-4 shrink-0" />
                  <span className="flex-1 text-left text-[11px] font-semibold uppercase tracking-widest">
                    {group.label}
                  </span>
                  {active && !isOpen && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-green-400" />}
                  <ChevronRight
                    className={cn('h-3.5 w-3.5 shrink-0 transition-transform duration-200', isOpen && 'rotate-90')}
                  />
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-1 pt-1 pl-2">
                {group.items.map((item) => (
                  <ItemLink key={item.href} item={item} />
                ))}
              </CollapsibleContent>
            </Collapsible>
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

      <CommandPalette open={cmdOpen} onOpenChange={setCmdOpen} role={role} />
    </aside>
  )
}
