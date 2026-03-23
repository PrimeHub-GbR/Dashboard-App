'use client'

import { useEffect, useState } from 'react'
import type { TimeTrackingSettings } from '@/lib/zeiterfassung/types'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from 'sonner'
import { ExternalLink } from 'lucide-react'

export function Einstellungen() {
  const [settings, setSettings] = useState<TimeTrackingSettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    overtime_threshold_hours: 10,
    break_trigger_hours: 6,
    n8n_webhook_url: '',
    notification_enabled: false,
    kiosk_pin_length: 4,
  })

  useEffect(() => {
    fetch('/api/zeiterfassung/settings')
      .then(r => r.json())
      .then((json: { settings: TimeTrackingSettings }) => {
        setSettings(json.settings)
        setForm({
          overtime_threshold_hours: json.settings.overtime_threshold_hours,
          break_trigger_hours: json.settings.break_trigger_hours,
          n8n_webhook_url: json.settings.n8n_webhook_url ?? '',
          notification_enabled: json.settings.notification_enabled,
          kiosk_pin_length: json.settings.kiosk_pin_length,
        })
      })
      .finally(() => setLoading(false))
  }, [])

  async function handleSave() {
    setSaving(true)
    try {
      const body = {
        ...form,
        n8n_webhook_url: form.n8n_webhook_url.trim() || null,
      }
      const res = await fetch('/api/zeiterfassung/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error('Fehler')
      toast.success('Einstellungen gespeichert')
    } catch {
      toast.error('Speichern fehlgeschlagen')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-lg">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Pausenregeln (ArbZG § 4)</CardTitle>
          <CardDescription>
            Pausen werden automatisch beim Ausstempeln berechnet: bis 6h keine Pause, 6–9h = 30 Min., über 9h = 45 Min.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>ArbZG-Warnung ab (Stunden eingestempelt)</Label>
            <Input
              type="number"
              value={form.break_trigger_hours}
              onChange={(e) => setForm(f => ({ ...f, break_trigger_hours: Number(e.target.value) }))}
              min={1}
              max={12}
              step={0.5}
            />
            <p className="text-xs text-muted-foreground">
              Kiosk zeigt Hinweis wenn Mitarbeiter länger als {form.break_trigger_hours}h eingestempelt ist.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Überstundenwarnungen</CardTitle>
          <CardDescription>
            Warnung via N8N (Telegram oder Email) wenn die monatlichen Überstunden den Schwellwert überschreiten.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <Label>Warnungen aktiviert</Label>
            <Switch
              checked={form.notification_enabled}
              onCheckedChange={(v) => setForm(f => ({ ...f, notification_enabled: v }))}
            />
          </div>
          <div className="space-y-2">
            <Label>Schwellwert Überstunden (Stunden/Monat)</Label>
            <Input
              type="number"
              value={form.overtime_threshold_hours}
              onChange={(e) => setForm(f => ({ ...f, overtime_threshold_hours: Number(e.target.value) }))}
              min={0}
              max={500}
              step={0.5}
              disabled={!form.notification_enabled}
            />
          </div>
          <div className="space-y-2">
            <Label>N8N Webhook-URL</Label>
            <Input
              value={form.n8n_webhook_url}
              onChange={(e) => setForm(f => ({ ...f, n8n_webhook_url: e.target.value }))}
              placeholder="https://n8n.primehubgbr.com/webhook/..."
              disabled={!form.notification_enabled}
            />
            <p className="text-xs text-muted-foreground">
              Der N8N-Workflow muss manuell angelegt werden.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Kiosk</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>PIN-Länge</Label>
            <Input
              type="number"
              value={form.kiosk_pin_length}
              onChange={(e) => setForm(f => ({ ...f, kiosk_pin_length: Number(e.target.value) }))}
              min={4}
              max={8}
            />
          </div>
          <div className="pt-2">
            <Button variant="outline" size="sm" asChild>
              <a href="/kiosk" target="_blank" className="gap-2">
                <ExternalLink className="w-4 h-4" />
                Kiosk-Ansicht öffnen
              </a>
            </Button>
            <p className="text-xs text-muted-foreground mt-1">
              Für iPad: Browser im Vollbild-Modus öffnen (Guided Access).
            </p>
          </div>
        </CardContent>
      </Card>

      <Button onClick={handleSave} disabled={saving}>
        {saving ? 'Speichert…' : 'Einstellungen speichern'}
      </Button>

      {settings && (
        <p className="text-xs text-muted-foreground">
          Zuletzt aktualisiert: {new Date(settings.updated_at).toLocaleString('de-DE')}
        </p>
      )}
    </div>
  )
}
