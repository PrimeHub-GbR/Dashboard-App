'use client'

import { useEffect, useState } from 'react'
import { Globe, ExternalLink, FileText, Loader2, Timer, RotateCcw } from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

type Settings = {
  landing_enabled: boolean
  auto_disable_enabled: boolean
  auto_disable_days: number
  auto_disable_at: string | null
}

const DAY_PRESETS = [3, 5, 7, 14]

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('de-DE', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

function relativeDays(iso: string) {
  const diff = new Date(iso).getTime() - Date.now()
  if (diff <= 0) return 'abgelaufen'
  const days = Math.floor(diff / (24 * 60 * 60 * 1000))
  const hours = Math.floor((diff % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000))
  if (days >= 1) return `in ${days} Tag${days === 1 ? '' : 'en'}`
  return `in ${hours} Std.`
}

export function WebsiteSettingsClient({ canToggle }: { canToggle: boolean }) {
  const [s, setS] = useState<Settings | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetch('/api/site-settings')
      .then((r) => r.json())
      .then((d: Settings) => setS(d))
      .catch(() => toast.error('Status konnte nicht geladen werden'))
      .finally(() => setLoading(false))
  }, [])

  async function patch(body: Record<string, unknown>, successMsg?: string) {
    if (!canToggle) return
    setSaving(true)
    try {
      const res = await fetch('/api/site-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d?.error || 'Fehler')
      setS(d as Settings)
      if (successMsg) toast.success(successMsg)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Konnte nicht gespeichert werden')
    } finally {
      setSaving(false)
    }
  }

  if (loading || !s) {
    return (
      <div className="space-y-5">
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    )
  }

  const deadlinePassed = !!s.auto_disable_at && new Date(s.auto_disable_at).getTime() <= Date.now()
  const online = s.landing_enabled && !deadlinePassed

  return (
    <div className="space-y-5">
      {/* Status + Hauptschalter */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <CardTitle className="flex items-center gap-2">
                <Globe className="h-5 w-5 text-primary" />
                Öffentliche Firmen-Website
              </CardTitle>
              <CardDescription>
                Steuert, ob die Landingpage unter <span className="font-medium">primehubgbr.com</span> öffentlich
                sichtbar ist.
              </CardDescription>
            </div>
            <Badge variant={online ? 'default' : 'secondary'} className={online ? 'bg-emerald-600 hover:bg-emerald-600' : ''}>
              {online ? 'Online' : deadlinePassed ? 'Offline (Frist abgelaufen)' : 'Offline'}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div className="flex items-center gap-3">
              {saving && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
              <span className="text-sm font-medium">Website {s.landing_enabled ? 'aktiviert' : 'deaktiviert'}</span>
            </div>
            <Switch
              checked={s.landing_enabled}
              onCheckedChange={(v) => patch({ landing_enabled: v }, v ? 'Website ist jetzt online' : 'Website ist jetzt offline')}
              disabled={!canToggle || saving}
              aria-label="Website an/aus"
            />
          </div>
          {!canToggle && (
            <p className="mt-3 text-xs text-muted-foreground">Nur Admins können die Website steuern.</p>
          )}
        </CardContent>
      </Card>

      {/* Auto-Deaktivierung */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <CardTitle className="flex items-center gap-2 text-base">
                <Timer className="h-5 w-5 text-primary" />
                Automatische Deaktivierung
              </CardTitle>
              <CardDescription>
                Sicherheitsnetz: Die Website schaltet sich nach Ablauf der Frist selbst ab — auch wenn du es vergisst.
              </CardDescription>
            </div>
            <Switch
              checked={s.auto_disable_enabled}
              onCheckedChange={(v) => patch({ auto_disable_enabled: v }, v ? 'Automatik aktiviert' : 'Automatik deaktiviert')}
              disabled={!canToggle || saving}
              aria-label="Automatik an/aus"
            />
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Frist (Tage) */}
          <div>
            <p className="mb-2 text-sm font-medium">Frist</p>
            <div className="flex flex-wrap gap-2">
              {DAY_PRESETS.map((d) => (
                <Button
                  key={d}
                  variant={s.auto_disable_days === d ? 'default' : 'outline'}
                  size="sm"
                  disabled={!canToggle || saving || !s.auto_disable_enabled}
                  onClick={() => patch({ auto_disable_days: d }, `Frist auf ${d} Tage gesetzt`)}
                >
                  {d} Tage
                </Button>
              ))}
            </div>
          </div>

          {/* Aktuelle Frist + Verlängern */}
          {s.auto_disable_enabled && s.landing_enabled && s.auto_disable_at && (
            <div className={cn(
              'flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between',
              deadlinePassed && 'border-destructive/40 bg-destructive/5',
            )}>
              <div className="text-sm">
                <span className="text-muted-foreground">Deaktiviert sich automatisch am</span>
                <br />
                <span className="font-medium">{formatDate(s.auto_disable_at)} Uhr</span>{' '}
                <span className={cn('text-muted-foreground', deadlinePassed && 'text-destructive')}>
                  ({relativeDays(s.auto_disable_at)})
                </span>
              </div>
              <Button
                variant="outline"
                size="sm"
                disabled={!canToggle || saving}
                onClick={() => patch({ extend: true }, `Frist verlängert: +${s.auto_disable_days} Tage`)}
                className="shrink-0"
              >
                <RotateCcw className="mr-1.5 h-4 w-4" /> Frist verlängern (+{s.auto_disable_days} Tage)
              </Button>
            </div>
          )}

          {s.auto_disable_enabled && !s.landing_enabled && (
            <p className="text-xs text-muted-foreground">
              Die Frist startet automatisch, sobald du die Website online stellst.
            </p>
          )}
          {!s.auto_disable_enabled && (
            <p className="text-xs text-muted-foreground">
              Automatik aus — die Website bleibt online, bis du sie manuell deaktivierst.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Vorschau */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Vorschau &amp; Inhalte</CardTitle>
          <CardDescription>
            Die Vorschau funktioniert unabhängig vom Schalter — so kannst du die Seite prüfen, bevor du sie online stellst.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Button variant="outline" size="sm" asChild>
            <a href="/site" target="_blank" rel="noopener noreferrer">
              <ExternalLink className="mr-1.5 h-4 w-4" /> Landingpage ansehen
            </a>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <a href="/impressum" target="_blank" rel="noopener noreferrer">
              <FileText className="mr-1.5 h-4 w-4" /> Impressum ansehen
            </a>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <a href="/datenschutz" target="_blank" rel="noopener noreferrer">
              <FileText className="mr-1.5 h-4 w-4" /> Datenschutz ansehen
            </a>
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
