'use client'

import { useEffect, useState, useCallback } from 'react'
import type { TimeTrackingSettings } from '@/lib/zeiterfassung/types'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { ExternalLink, ShieldCheck, Copy, Pencil, Trash2, Check, X, Monitor, Smartphone } from 'lucide-react'

interface Props {
  kioskRegisterUrl: string | null
}

interface KioskDevice {
  id: string
  label: string | null
  user_agent: string | null
  registered_at: string
  last_seen_at: string
  is_active: boolean
}

function deviceIcon(userAgent: string | null) {
  if (!userAgent) return <Monitor className="w-4 h-4" />
  const ua = userAgent.toLowerCase()
  if (ua.includes('ipad') || ua.includes('iphone') || ua.includes('android') || ua.includes('mobile')) {
    return <Smartphone className="w-4 h-4" />
  }
  return <Monitor className="w-4 h-4" />
}

function deviceName(userAgent: string | null): string {
  if (!userAgent) return 'Unbekanntes Gerät'
  const ua = userAgent
  if (ua.includes('iPad')) return 'iPad'
  if (ua.includes('iPhone')) return 'iPhone'
  if (ua.includes('Android')) return 'Android-Gerät'
  if (ua.includes('Windows')) return 'Windows-PC'
  if (ua.includes('Mac')) return 'Mac'
  return 'Browser'
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('de-DE', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function KioskDeviceRow({
  device,
  onRevoke,
  onRename,
}: {
  device: KioskDevice
  onRevoke: (id: string) => void
  onRename: (id: string, label: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [labelVal, setLabelVal] = useState(device.label ?? '')

  function saveLabel() {
    onRename(device.id, labelVal.trim())
    setEditing(false)
  }

  return (
    <div className="flex items-start gap-3 py-3 border-b border-border/50 last:border-0">
      <div className="mt-0.5 text-muted-foreground">{deviceIcon(device.user_agent)}</div>
      <div className="flex-1 min-w-0 space-y-1">
        {editing ? (
          <div className="flex items-center gap-1">
            <Input
              value={labelVal}
              onChange={e => setLabelVal(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') saveLabel(); if (e.key === 'Escape') setEditing(false) }}
              className="h-7 text-sm"
              autoFocus
            />
            <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={saveLabel}>
              <Check className="w-3.5 h-3.5 text-green-400" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => setEditing(false)}>
              <X className="w-3.5 h-3.5" />
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-foreground">
              {device.label || deviceName(device.user_agent)}
            </span>
            {!device.label && (
              <span className="text-xs text-muted-foreground">({deviceName(device.user_agent)})</span>
            )}
            <button onClick={() => setEditing(true)} className="text-muted-foreground hover:text-foreground transition-colors">
              <Pencil className="w-3 h-3" />
            </button>
          </div>
        )}
        <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
          <span>Registriert: {formatDate(device.registered_at)}</span>
          <span>Zuletzt gesehen: {formatDate(device.last_seen_at)}</span>
        </div>
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 shrink-0 text-muted-foreground hover:text-red-400"
        onClick={() => onRevoke(device.id)}
        title="Gerät widerrufen"
      >
        <Trash2 className="w-3.5 h-3.5" />
      </Button>
    </div>
  )
}

export function Einstellungen({ kioskRegisterUrl }: Props) {
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

  const [devices, setDevices] = useState<KioskDevice[]>([])
  const [devicesLoading, setDevicesLoading] = useState(true)

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

  const loadDevices = useCallback(() => {
    setDevicesLoading(true)
    fetch('/api/kiosk/devices')
      .then(r => r.json())
      .then((j: { devices: KioskDevice[] }) => setDevices(j.devices ?? []))
      .finally(() => setDevicesLoading(false))
  }, [])

  useEffect(() => { loadDevices() }, [loadDevices])

  async function handleRevoke(id: string) {
    await fetch(`/api/kiosk/devices?id=${id}`, { method: 'DELETE' })
    toast.success('Gerät widerrufen')
    loadDevices()
  }

  async function handleRename(id: string, label: string) {
    await fetch(`/api/kiosk/devices?id=${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ label: label || null }),
    })
    toast.success('Gerätename gespeichert')
    loadDevices()
  }

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

  const activeDevices = devices.filter(d => d.is_active)

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

      {/* Admin-only: Geräteverwaltung */}
      {kioskRegisterUrl && (
        <Card className="border-amber-500/20">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-amber-400" />
                <CardTitle className="text-base">Autorisierte Kiosk-Geräte</CardTitle>
              </div>
              <Badge variant="outline" className="text-amber-400 border-amber-500/30">
                {activeDevices.length} {activeDevices.length === 1 ? 'Gerät' : 'Geräte'}
              </Badge>
            </div>
            <CardDescription>
              Nur registrierte Geräte können den Kiosk aufrufen. Jedes Gerät erhält ein eigenes Token — gesperrte Geräte verlieren sofort den Zugang.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">

            {/* Geräteliste */}
            {devicesLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            ) : activeDevices.length === 0 ? (
              <p className="text-sm text-muted-foreground py-2">
                Noch kein Gerät registriert.
              </p>
            ) : (
              <div>
                {activeDevices.map(device => (
                  <KioskDeviceRow
                    key={device.id}
                    device={device}
                    onRevoke={handleRevoke}
                    onRename={handleRename}
                  />
                ))}
              </div>
            )}

            {/* Registrierungs-Link */}
            <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-2 mt-2">
              <p className="text-xs font-medium text-foreground">Neues Gerät registrieren</p>
              <p className="text-xs text-muted-foreground">
                Diesen Link einmalig im Browser des neuen Geräts öffnen. Das Gerät wird sofort autorisiert und erscheint oben in der Liste.
              </p>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-xs bg-background border rounded px-2 py-1.5 text-amber-300 break-all">
                  {typeof window !== 'undefined'
                    ? `${window.location.origin}${kioskRegisterUrl}`
                    : kioskRegisterUrl}
                </code>
                <Button
                  variant="ghost"
                  size="icon"
                  className="shrink-0 h-8 w-8"
                  onClick={() => {
                    const url = typeof window !== 'undefined'
                      ? `${window.location.origin}${kioskRegisterUrl}`
                      : kioskRegisterUrl
                    navigator.clipboard.writeText(url)
                    toast.success('Link kopiert')
                  }}
                  title="Link kopieren"
                >
                  <Copy className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

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
