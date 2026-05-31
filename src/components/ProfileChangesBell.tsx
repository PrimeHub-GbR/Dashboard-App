'use client'

import { useCallback, useEffect, useState } from 'react'
import { Bell, BellRing, Check, Loader2 } from 'lucide-react'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface ProfileChange {
  id: string
  employee_id: string
  field_name: 'email' | 'phone' | 'home_address'
  old_value: string | null
  new_value: string | null
  changed_at: string
  acknowledged_at: string | null
  employees: { name: string; color: string } | null
}

const FIELD_LABELS: Record<string, string> = {
  email: 'E-Mail',
  phone: 'Telefon',
  home_address: 'Adresse',
}

interface ProfileChangesBellProps {
  collapsed: boolean
}

export function ProfileChangesBell({ collapsed }: ProfileChangesBellProps) {
  const [open, setOpen] = useState(false)
  const [changes, setChanges] = useState<ProfileChange[]>([])
  const [unack, setUnack] = useState(0)
  const [loading, setLoading] = useState(false)
  const [ackBusy, setAckBusy] = useState<string | null>(null)

  const load = useCallback(async (onlyUnack = false) => {
    setLoading(true)
    try {
      const res = await fetch(
        `/api/organisation/profile-changes${onlyUnack ? '?only=unacknowledged' : ''}`,
        { cache: 'no-store' }
      )
      if (!res.ok) return
      const json = await res.json() as { changes: ProfileChange[]; unacknowledged_count: number }
      setChanges(json.changes)
      setUnack(json.unacknowledged_count)
    } finally {
      setLoading(false)
    }
  }, [])

  // Periodisches Polling fuer Badge-Count (alle 60 s, leichtgewichtig)
  useEffect(() => {
    load(false)
    const t = setInterval(() => load(false), 60_000)
    return () => clearInterval(t)
  }, [load])

  // Beim Oeffnen frisch laden
  useEffect(() => {
    if (open) load(false)
  }, [open, load])

  async function acknowledge(id: string) {
    setAckBusy(id)
    try {
      const res = await fetch(`/api/organisation/profile-changes/${id}/acknowledge`, {
        method: 'POST',
      })
      if (!res.ok) return
      // optimistisch updaten
      setChanges((prev) =>
        prev.map((c) =>
          c.id === id ? { ...c, acknowledged_at: new Date().toISOString() } : c
        )
      )
      setUnack((u) => Math.max(0, u - 1))
    } finally {
      setAckBusy(null)
    }
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button
          title={collapsed ? `Profil-Aenderungen${unack > 0 ? ` (${unack})` : ''}` : undefined}
          className={cn(
            'flex w-full items-center rounded-lg px-3 py-2 text-xs transition-colors relative',
            unack > 0
              ? 'text-amber-300 hover:bg-amber-500/10'
              : 'text-white/40 hover:bg-white/6 hover:text-white/70',
            collapsed ? 'justify-center' : 'gap-2'
          )}
        >
          {unack > 0 ? (
            <BellRing className="h-3.5 w-3.5 shrink-0" />
          ) : (
            <Bell className="h-3.5 w-3.5 shrink-0" />
          )}
          {!collapsed && (
            <>
              <span>Profil-Aenderungen</span>
              {unack > 0 && (
                <span className="ml-auto inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-amber-500 text-[10px] font-bold text-black">
                  {unack > 99 ? '99+' : unack}
                </span>
              )}
            </>
          )}
          {collapsed && unack > 0 && (
            <span className="absolute -top-1 -right-1 inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full bg-amber-500 text-[9px] font-bold text-black">
              {unack > 99 ? '99+' : unack}
            </span>
          )}
        </button>
      </SheetTrigger>
      <SheetContent side="right" className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Profil-Aenderungen</SheetTitle>
          <SheetDescription>
            Mitarbeitende haben Kontaktdaten in der App geaendert.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-3 overflow-y-auto max-h-[calc(100vh-160px)] pr-1">
          {loading && changes.length === 0 ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : changes.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-12">
              Keine Aenderungen.
            </p>
          ) : (
            changes.map((c) => {
              const acked = c.acknowledged_at != null
              const empName = c.employees?.name ?? 'Unbekannt'
              const empColor = c.employees?.color ?? '#22c55e'
              const date = new Date(c.changed_at).toLocaleString('de-DE', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })
              return (
                <div
                  key={c.id}
                  className={cn(
                    'rounded-xl border p-3 transition-colors',
                    acked ? 'border-border bg-muted/30 opacity-70' : 'border-amber-200 bg-amber-50/40 dark:border-amber-700/40 dark:bg-amber-950/20'
                  )}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <div
                      className="h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0"
                      style={{ backgroundColor: empColor }}
                    >
                      {empName.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold truncate">{empName}</p>
                      <p className="text-[11px] text-muted-foreground">{date}</p>
                    </div>
                    {acked && (
                      <span className="text-[10px] text-muted-foreground inline-flex items-center gap-1">
                        <Check className="h-3 w-3" />
                        gelesen
                      </span>
                    )}
                  </div>

                  <div className="text-sm space-y-1 pl-9">
                    <p>
                      <span className="text-muted-foreground">{FIELD_LABELS[c.field_name]}</span>{' '}
                      geaendert.
                    </p>
                    <p className="text-xs">
                      <span className="text-muted-foreground">Vorher: </span>
                      <span className="line-through opacity-70">{c.old_value ?? '—'}</span>
                    </p>
                    <p className="text-xs">
                      <span className="text-muted-foreground">Neu: </span>
                      <span className="font-medium">{c.new_value ?? '—'}</span>
                    </p>
                  </div>

                  {!acked && (
                    <div className="mt-3 pl-9">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={ackBusy === c.id}
                        onClick={() => acknowledge(c.id)}
                        className="h-7 text-xs gap-1.5"
                      >
                        {ackBusy === c.id ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Check className="h-3 w-3" />
                        )}
                        Gelesen
                      </Button>
                    </div>
                  )}
                </div>
              )
            })
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
