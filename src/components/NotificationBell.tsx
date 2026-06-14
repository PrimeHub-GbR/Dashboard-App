'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  Bell, BellRing, Check, Loader2, AlertTriangle, Clock, TrendingUp, UserCog, ArrowRight, CheckCircle2, CalendarX,
} from 'lucide-react'
import {
  Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { AppNotification, NotificationSource } from '@/lib/notifications/types'

const SOURCE_META: Record<NotificationSource, { icon: typeof Bell; tint: string; actionLabel: string; ackLabel: string }> = {
  zeit_stale: { icon: AlertTriangle, tint: 'text-red-500', actionLabel: 'Eintrag korrigieren', ackLabel: 'Zur Kenntnis' },
  zeit_review: { icon: Clock, tint: 'text-amber-500', actionLabel: 'Prüfen', ackLabel: 'Kontrolle OK' },
  overtime: { icon: TrendingUp, tint: 'text-sky-500', actionLabel: 'Ansehen', ackLabel: 'Zur Kenntnis' },
  profile: { icon: UserCog, tint: 'text-muted-foreground', actionLabel: 'Ansehen', ackLabel: 'Zur Kenntnis' },
  task_done: { icon: CheckCircle2, tint: 'text-green-600', actionLabel: 'Zur Aufgabe', ackLabel: 'Zur Kenntnis' },
  unplanned: { icon: CalendarX, tint: 'text-amber-500', actionLabel: 'Ansehen', ackLabel: 'Zur Kenntnis' },
}

const SEVERITY_ACCENT: Record<AppNotification['severity'], string> = {
  critical: 'border-l-red-500',
  warning: 'border-l-amber-500',
  info: 'border-l-sky-500',
}

export function NotificationBell() {
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<AppNotification[]>([])
  const [unread, setUnread] = useState(0)
  const [loading, setLoading] = useState(false)
  const [hidden, setHidden] = useState(false)
  const [ackBusy, setAckBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/notifications', { cache: 'no-store' })
      if (res.status === 401 || res.status === 403) {
        setHidden(true)
        return
      }
      if (!res.ok) return
      const json = await res.json() as { notifications: AppNotification[]; unread: number }
      setItems(json.notifications)
      setUnread(json.unread)
    } finally {
      setLoading(false)
    }
  }, [])

  // Polling alle 60 s + beim Öffnen + bei Fenster-Fokus
  useEffect(() => {
    load()
    const t = setInterval(load, 60_000)
    const onFocus = () => load()
    window.addEventListener('focus', onFocus)
    return () => { clearInterval(t); window.removeEventListener('focus', onFocus) }
  }, [load])

  useEffect(() => {
    if (open) load()
  }, [open, load])

  async function acknowledge(key: string) {
    setAckBusy(key)
    try {
      const res = await fetch('/api/notifications/ack', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key }),
      })
      if (!res.ok) return
      await load()
    } finally {
      setAckBusy(null)
    }
  }

  function navigate(link: string) {
    // Volle Navigation, damit Deep-Link-Effekte (Tab/Eintrag öffnen) beim Mount greifen
    window.location.href = link
  }

  if (hidden) return null

  const hasUnread = unread > 0

  return (
    <div className="fixed top-6 right-6 z-50">
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <button
            aria-label={`Benachrichtigungen${hasUnread ? ` (${unread} ungelesen)` : ''}`}
            className={cn(
              'relative flex h-16 w-16 items-center justify-center rounded-full border-2 shadow-xl transition-colors',
              hasUnread
                ? 'border-amber-300 bg-amber-500 text-black hover:bg-amber-400'
                : 'border-emerald-400 bg-emerald-600 text-white hover:bg-emerald-500'
            )}
          >
            {hasUnread ? <BellRing className="h-8 w-8" /> : <Bell className="h-8 w-8" />}
            {hasUnread && (
              <span className="absolute -top-1.5 -right-1.5 flex h-7 min-w-7 items-center justify-center rounded-full bg-red-600 px-1.5 text-sm font-bold text-white ring-2 ring-background">
                {unread > 99 ? '99+' : unread}
              </span>
            )}
            {hasUnread && (
              <span className="absolute inset-0 -z-10 animate-ping rounded-full bg-amber-500 opacity-40" />
            )}
          </button>
        </SheetTrigger>

        <SheetContent side="right" className="w-full sm:max-w-md">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <Bell className="h-4 w-4" />
              Benachrichtigungen
              {hasUnread && (
                <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1.5 text-[11px] font-bold text-white">
                  {unread}
                </span>
              )}
            </SheetTitle>
            <SheetDescription>
              Offene Meldungen müssen aktiv bestätigt werden. Zeit-Probleme erledigen sich
              automatisch, sobald der Eintrag korrigiert ist.
            </SheetDescription>
          </SheetHeader>

          <div className="mt-6 space-y-3 overflow-y-auto max-h-[calc(100vh-170px)] pr-1">
            {loading && items.length === 0 ? (
              <div className="flex items-center justify-center py-12 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" />
              </div>
            ) : items.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-12">
                Keine Benachrichtigungen 🎉
              </p>
            ) : (
              items.map((n) => {
                const meta = SOURCE_META[n.source]
                const Icon = meta.icon
                const time = new Date(n.created_at).toLocaleString('de-DE', {
                  day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
                })
                return (
                  <div
                    key={n.key}
                    className={cn(
                      'rounded-xl border border-l-4 p-3 transition-colors',
                      n.acknowledged
                        ? 'border-l-border bg-muted/30 opacity-60'
                        : cn('bg-card', SEVERITY_ACCENT[n.severity])
                    )}
                  >
                    <div className="flex items-start gap-2.5">
                      <div className="mt-0.5 shrink-0">
                        {n.employee ? (
                          <div
                            className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold text-white"
                            style={{ backgroundColor: n.employee.color }}
                          >
                            {n.employee.name.charAt(0).toUpperCase()}
                          </div>
                        ) : (
                          <Icon className={cn('h-7 w-7', meta.tint)} />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <Icon className={cn('h-3.5 w-3.5 shrink-0', meta.tint)} />
                          <p className="text-sm font-semibold leading-tight">{n.title}</p>
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground break-words">{n.body}</p>
                        <p className="mt-1 text-[10px] text-muted-foreground/70">{time}</p>
                      </div>
                      {n.acknowledged && (
                        <span className="inline-flex items-center gap-1 text-[10px] text-emerald-600 shrink-0">
                          <Check className="h-3 w-3" />
                          {n.acknowledgedBy ? `von ${n.acknowledgedBy}` : 'erledigt'}
                        </span>
                      )}
                    </div>

                    {!n.acknowledged && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {n.link && (
                          <Button
                            size="sm"
                            className="h-7 gap-1.5 text-xs"
                            onClick={() => navigate(n.link!)}
                          >
                            {meta.actionLabel}
                            <ArrowRight className="h-3 w-3" />
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={ackBusy === n.key}
                          onClick={() => acknowledge(n.key)}
                          className="h-7 gap-1.5 text-xs"
                        >
                          {ackBusy === n.key ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <Check className="h-3 w-3" />
                          )}
                          {meta.ackLabel}
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
    </div>
  )
}
