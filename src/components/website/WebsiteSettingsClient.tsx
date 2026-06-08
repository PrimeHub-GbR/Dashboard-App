'use client'

import { useEffect, useState } from 'react'
import { Globe, ExternalLink, FileText, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'

export function WebsiteSettingsClient({ canToggle }: { canToggle: boolean }) {
  const [enabled, setEnabled] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetch('/api/site-settings')
      .then((r) => r.json())
      .then((d) => setEnabled(Boolean(d.landing_enabled)))
      .catch(() => toast.error('Status konnte nicht geladen werden'))
      .finally(() => setLoading(false))
  }, [])

  async function toggle(next: boolean) {
    setSaving(true)
    setEnabled(next) // optimistisch
    try {
      const res = await fetch('/api/site-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ landing_enabled: next }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => null)
        throw new Error(d?.error || 'Fehler')
      }
      toast.success(next ? 'Website ist jetzt online' : 'Website ist jetzt offline')
    } catch (e) {
      setEnabled(!next) // revert
      toast.error(e instanceof Error ? e.message : 'Konnte nicht gespeichert werden')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-5">
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
                sichtbar ist. Im ausgeschalteten Zustand ist die Seite nicht erreichbar.
              </CardDescription>
            </div>
            {loading ? (
              <Skeleton className="h-6 w-16" />
            ) : (
              <Badge variant={enabled ? 'default' : 'secondary'} className={enabled ? 'bg-emerald-600 hover:bg-emerald-600' : ''}>
                {enabled ? 'Online' : 'Offline'}
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Skeleton className="h-12 w-full" />
          ) : (
            <div className="flex items-center justify-between rounded-lg border p-4">
              <div className="flex items-center gap-3">
                {saving && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                <span className="text-sm font-medium">
                  Website {enabled ? 'aktiviert' : 'deaktiviert'}
                </span>
              </div>
              <Switch
                checked={enabled}
                onCheckedChange={toggle}
                disabled={!canToggle || saving}
                aria-label="Website an/aus"
              />
            </div>
          )}
          {!canToggle && (
            <p className="mt-3 text-xs text-muted-foreground">
              Nur Admins können die Website an- und ausschalten.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Vorschau & Inhalte</CardTitle>
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
        </CardContent>
      </Card>
    </div>
  )
}
