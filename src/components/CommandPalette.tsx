'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { ExternalLink } from 'lucide-react'
import {
  CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from '@/components/ui/command'
import { homeItem, visibleNavGroups, type NavItem } from '@/lib/nav-config'

interface CommandPaletteProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** user_roles.role: 'admin' | 'manager' | 'staff' | null */
  role?: string | null
}

export function CommandPalette({ open, onOpenChange, role = null }: CommandPaletteProps) {
  const router = useRouter()
  const navGroups = visibleNavGroups(role)

  // Globaler ⌘K / Strg+K Shortcut
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        onOpenChange(!open)
      }
    }
    document.addEventListener('keydown', down)
    return () => document.removeEventListener('keydown', down)
  }, [open, onOpenChange])

  const go = (item: NavItem) => {
    onOpenChange(false)
    // Externe App: neuer Tab ohne Zugriff auf dieses Fenster
    if (item.external) {
      window.open(item.href, '_blank', 'noopener,noreferrer')
      return
    }
    router.push(item.href)
  }

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder="Seite suchen…" />
      <CommandList>
        <CommandEmpty>Nichts gefunden.</CommandEmpty>
        <CommandGroup heading="Allgemein">
          <CommandItem
            value={homeItem.label}
            onSelect={() => go(homeItem)}
          >
            <homeItem.icon className="mr-2 h-4 w-4" />
            <span>{homeItem.label}</span>
          </CommandItem>
        </CommandGroup>
        {navGroups.map((group) => (
          <CommandGroup key={group.label} heading={group.label}>
            {group.items.map((item) => (
              <CommandItem
                key={item.href}
                value={`${item.label} ${item.desc}`}
                onSelect={() => go(item)}
              >
                <item.icon className="mr-2 h-4 w-4" />
                <span>{item.label}</span>
                <span className="ml-2 text-xs text-muted-foreground">{item.desc}</span>
                {item.external && (
                  <ExternalLink aria-label="öffnet in neuem Tab" className="ml-auto h-3.5 w-3.5 text-muted-foreground" />
                )}
              </CommandItem>
            ))}
          </CommandGroup>
        ))}
      </CommandList>
    </CommandDialog>
  )
}
