'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import {
  LogOut, ChevronLeft, ChevronRight, Search, Menu, ExternalLink,
} from 'lucide-react'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
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
  // Mobil (< md): Navigation als Schublade statt fester Sidebar
  const [mobileOpen, setMobileOpen] = useState(false)
  const closeMobile = () => setMobileOpen(false)

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

  // Aktiv-Erkennung: Übersicht exakt, alle anderen per Prefix.
  // Externe Apps (absolute URL) sind nie aktiv.
  const isActive = (item: NavItem) =>
    !item.external &&
    (item.href === '/dashboard' ? pathname === '/dashboard' : pathname.startsWith(item.href))
  const groupHasActive = (group: NavGroup) => group.items.some((i) => isActive(i))

  // Einzelner Navigations-Link (innerhalb einer aufgeklappten Gruppe / im Popover)
  const ItemLink = ({ item }: { item: NavItem }) => {
    const active = isActive(item)
    const className = cn(
      'flex items-center gap-3 rounded-lg border px-2 py-2 transition-all duration-200 group',
      active
        ? 'border-green-500/40 bg-green-500/10 text-white shadow-[0_0_12px_rgba(0,94,48,0.3)]'
        : 'border-transparent text-white/60 hover:bg-white/8 hover:border-white/15 hover:text-white/90'
    )
    const content = (
      <>
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
        {item.external && (
          <>
            <ExternalLink
              aria-hidden="true"
              className="ml-auto h-3.5 w-3.5 shrink-0 text-white/35 group-hover:text-white/70"
            />
            <span className="sr-only">(öffnet in neuem Tab)</span>
          </>
        )}
      </>
    )

    // Externe App: normaler Link in neuem Tab, kein Next-Routing
    if (item.external) {
      return (
        <a
          href={item.href}
          target="_blank"
          rel="noopener noreferrer"
          onClick={closeMobile}
          title={`${item.label} – öffnet in neuem Tab`}
          className={className}
        >
          {content}
        </a>
      )
    }

    return (
      <Link href={item.href} onClick={closeMobile} className={className}>
        {content}
      </Link>
    )
  }

  // Inhalt der Sidebar — Desktop (einklappbar) und Mobil-Schublade (immer ausgeklappt)
  const renderContent = (rail: boolean, mobile: boolean) => (
    <>
      {/* Header */}
      <div className="px-3 py-5 border-b border-white/10 flex items-center justify-between min-h-[72px]">
        {!rail && (
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
        {rail && (
          <div className="mx-auto flex items-center justify-center">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-500 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500" />
            </span>
          </div>
        )}
        {!mobile && (
        <button
          onClick={toggle}
          className={cn(
            'flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-white/30 hover:bg-white/8 hover:text-white/70 transition-colors',
            rail && 'mx-auto'
          )}
          title={rail ? 'Sidebar ausklappen' : 'Sidebar einklappen'}
        >
          {rail ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </button>
        )}
      </div>

      {/* Suche */}
      <div className={cn('pt-4', rail ? 'px-2' : 'px-3')}>
        <button
          onClick={() => {
            closeMobile()
            setCmdOpen(true)
          }}
          title={rail ? 'Suchen (⌘K)' : undefined}
          className={cn(
            'flex w-full items-center rounded-lg border border-white/8 bg-white/4 text-white/50 hover:bg-white/8 hover:text-white/80 transition-colors',
            rail ? 'justify-center px-0 py-2.5' : 'gap-2 px-3 py-2'
          )}
        >
          <Search className="h-4 w-4 shrink-0" />
          {!rail && (
            <>
              <span className="flex-1 text-left text-sm">Suchen…</span>
              <kbd className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-medium text-white/50">⌘K</kbd>
            </>
          )}
        </button>
      </div>

      {/* Navigation */}
      <nav className={cn('flex-1 overflow-y-auto py-4 space-y-1.5', rail ? 'px-2' : 'px-3')}>
        {/* Übersicht (Standalone) */}
        {rail ? (
          <Link
            href={homeItem.href}
            title={homeItem.label}
            onClick={closeMobile}
            className={cn(
              'flex items-center justify-center rounded-xl border px-0 py-2.5 transition-all duration-200',
              isActive(homeItem)
                ? 'border-green-500/40 bg-green-500/10 shadow-[0_0_12px_rgba(0,94,48,0.3)]'
                : 'border-white/8 bg-white/4 hover:bg-white/8 hover:border-white/15'
            )}
          >
            <homeItem.icon className={cn('h-4 w-4', isActive(homeItem) ? 'text-green-400' : 'text-white/50')} />
          </Link>
        ) : (
          <ItemLink item={homeItem} />
        )}

        {/* Gruppen */}
        {navGroups.map((group) => {
          const active = groupHasActive(group)

          // Rail-Modus: Gruppen-Icon + Popover mit den Items
          if (rail) {
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
      <div className={cn('py-4 border-t border-white/10 space-y-3', rail ? 'px-2' : 'px-3')}>
        {!rail && <McpStatus />}
        {!rail && userEmail && (
          <p className="text-[11px] text-white/30 truncate px-1">{userEmail}</p>
        )}
        <button
          onClick={handleLogout}
          title={rail ? 'Abmelden' : undefined}
          className={cn(
            'flex w-full items-center rounded-lg px-3 py-2 text-xs text-white/40 hover:bg-white/6 hover:text-white/70 transition-colors',
            rail ? 'justify-center' : 'gap-2'
          )}
        >
          <LogOut className="h-3.5 w-3.5 shrink-0" />
          {!rail && 'Abmelden'}
        </button>
      </div>

    </>
  )

  return (
    <>
      {/* Mobil: Kopfleiste mit Menue-Knopf */}
      <div className="fixed inset-x-0 top-0 z-40 flex h-14 items-center gap-3 border-b border-white/10 bg-[#0a1510] px-3 md:hidden">
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetTrigger asChild>
            <button
              className="flex h-9 w-9 items-center justify-center rounded-md text-white/70 hover:bg-white/8 hover:text-white transition-colors"
              aria-label="Navigation öffnen"
            >
              <Menu className="h-5 w-5" />
            </button>
          </SheetTrigger>
          <SheetContent
            side="left"
            className="flex w-72 flex-col gap-0 border-white/10 bg-[#0a1510] p-0 text-white [&>button]:text-white/60"
          >
            <SheetTitle className="sr-only">Navigation</SheetTitle>
            {renderContent(false, true)}
          </SheetContent>
        </Sheet>
        <span className="text-sm font-bold tracking-tight text-white/90">PrimeHub Dashboard</span>
      </div>

      {/* Desktop/Tablet: feste Sidebar */}
      <aside
        className={cn(
          'hidden h-screen shrink-0 flex-col bg-[#0a1510] border-r border-white/10 transition-all duration-300 ease-in-out md:flex',
          collapsed ? 'w-16' : 'w-64'
        )}
      >
        {renderContent(collapsed, false)}
      </aside>

      <CommandPalette open={cmdOpen} onOpenChange={setCmdOpen} role={role} />
    </>
  )
}
