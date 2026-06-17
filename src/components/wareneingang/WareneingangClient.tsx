'use client'

import { useState, useEffect, useCallback } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  Package, Truck, CheckCircle2, FileText, Loader2, RefreshCw, PackageCheck, AlertTriangle, ExternalLink,
} from 'lucide-react'

type Status = 'bestellt' | 'unterwegs' | 'empfangen'

interface Wareneingang {
  id: string
  supplier: string
  kind: 'palette' | 'paket'
  shop: string | null
  ab_nummer: string | null
  ab_datum: string | null
  ls_nummer: string | null
  ls_datum: string | null
  paletten_erwartet: number | null
  nettogewicht_kg: number | null
  order_number: string | null
  bestellt_am: string | null
  tracking_number: string | null
  carrier: string | null
  carrier_code: string | null
  tracking_url: string | null
  tracking_status: string | null
  tracking_status_code: string | null
  eta_date: string | null
  eta_text: string | null
  tracking_last_event_at: string | null
  status: Status
  ab_pdf_path: string | null
  ls_pdf_path: string | null
  empfangen_von: string | null
  empfangen_von_name: string | null
  empfangen_am: string | null
  paletten_geprueft: number | null
  schaden: boolean
  notiz: string | null
  avisiert_fuer: string | null
  created_at: string
}

const SUPPLIER_LABEL: Record<string, string> = {
  blank: 'BuchVertrieb Blank',
}

function merchantLabel(w: Wareneingang): string {
  return w.shop || SUPPLIER_LABEL[w.supplier] || w.supplier
}

const TRACKING_META: Record<string, { label: string; className: string }> = {
  pending: { label: 'Angelegt', className: 'bg-muted text-muted-foreground' },
  info_received: { label: 'Versand angekündigt', className: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' },
  in_transit: { label: 'Unterwegs', className: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' },
  out_for_delivery: { label: 'In Zustellung', className: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300' },
  delivered: { label: 'Zugestellt', className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' },
  exception: { label: 'Problem', className: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300' },
  expired: { label: 'Abgelaufen', className: 'bg-muted text-muted-foreground' },
}

const STATUS_META: Record<Status, { label: string; className: string; icon: typeof Package }> = {
  bestellt: {
    label: 'Bestellt',
    className: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
    icon: Package,
  },
  unterwegs: {
    label: 'Paket unterwegs',
    className: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
    icon: Truck,
  },
  empfangen: {
    label: 'Empfangen',
    className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
    icon: CheckCircle2,
  },
}

function fmtDate(d: string | null): string {
  if (!d) return '—'
  const date = new Date(d)
  if (Number.isNaN(date.getTime())) return d
  return date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function fmtDateTime(d: string | null): string {
  if (!d) return '—'
  const date = new Date(d)
  if (Number.isNaN(date.getTime())) return d
  return date.toLocaleString('de-DE', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

export function WareneingangClient() {
  const [rows, setRows] = useState<Wareneingang[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [filter, setFilter] = useState<'alle' | Status>('alle')
  const [empfangTarget, setEmpfangTarget] = useState<Wareneingang | null>(null)

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true)
    try {
      const res = await fetch('/api/wareneingang')
      if (!res.ok) throw new Error('Laden fehlgeschlagen')
      const json = await res.json()
      setRows(json.rows ?? [])
    } catch {
      toast.error('Wareneingänge konnten nicht geladen werden')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const visible = filter === 'alle' ? rows : rows.filter((r) => r.status === filter)
  const counts = {
    alle: rows.length,
    bestellt: rows.filter((r) => r.status === 'bestellt').length,
    unterwegs: rows.filter((r) => r.status === 'unterwegs').length,
    empfangen: rows.filter((r) => r.status === 'empfangen').length,
  }

  async function openBeleg(id: string, type: 'ab' | 'ls') {
    try {
      const res = await fetch(`/api/wareneingang/${id}/beleg?type=${type}`)
      if (!res.ok) throw new Error()
      const { url } = await res.json()
      window.open(url, '_blank', 'noopener')
    } catch {
      toast.error('Beleg konnte nicht geöffnet werden')
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <Tabs value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
          <TabsList>
            <TabsTrigger value="alle">Alle ({counts.alle})</TabsTrigger>
            <TabsTrigger value="bestellt">Bestellt ({counts.bestellt})</TabsTrigger>
            <TabsTrigger value="unterwegs">Unterwegs ({counts.unterwegs})</TabsTrigger>
            <TabsTrigger value="empfangen">Empfangen ({counts.empfangen})</TabsTrigger>
          </TabsList>
        </Tabs>
        <Button variant="outline" size="sm" onClick={() => load(true)} disabled={refreshing}>
          <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          Aktualisieren
        </Button>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => <Skeleton key={i} className="h-28 w-full rounded-xl" />)}
        </div>
      ) : visible.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Package className="mx-auto mb-3 h-10 w-10 opacity-40" />
            <p>Keine Lieferungen in dieser Ansicht.</p>
            <p className="text-xs mt-1">
              Lieferungen (Paletten & Pakete) erscheinen automatisch, sobald die Bestell- oder Versandmails eingehen.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {visible.map((row) => {
            const meta = STATUS_META[row.status]
            const Icon = meta.icon
            return (
              <Card key={row.id} className="overflow-hidden">
                <CardContent className="p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <Badge className={`${meta.className} border-0 font-medium gap-1`}>
                          <Icon className="h-3.5 w-3.5" />
                          {meta.label}
                        </Badge>
                        <span className="text-sm font-medium text-foreground">
                          {merchantLabel(row)}
                        </span>
                        <Badge variant="outline" className="text-[10px] font-normal">
                          {row.kind === 'paket' ? 'Paket' : 'Palette'}
                        </Badge>
                        {row.kind === 'paket' && row.tracking_status_code && (
                          <Badge className={`${(TRACKING_META[row.tracking_status_code] ?? TRACKING_META.in_transit).className} border-0 font-medium`}>
                            {row.tracking_status || (TRACKING_META[row.tracking_status_code] ?? TRACKING_META.in_transit).label}
                          </Badge>
                        )}
                      </div>

                      {row.kind === 'paket' ? (
                        <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted-foreground">
                          {row.order_number && (
                            <span>Bestellnr.: <span className="text-foreground">{row.order_number}</span></span>
                          )}
                          <span>
                            Sendung: <span className="text-foreground">{row.tracking_number ?? '—'}</span>
                            {row.carrier ? ` · ${row.carrier}` : ''}
                          </span>
                          {(row.eta_date || row.eta_text) && (
                            <span>
                              Voraussichtlich: <span className="text-foreground">{row.eta_text || fmtDate(row.eta_date)}</span>
                            </span>
                          )}
                          {row.tracking_last_event_at && (
                            <span>Letztes Update: {fmtDateTime(row.tracking_last_event_at)}</span>
                          )}
                        </div>
                      ) : (
                        <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted-foreground">
                          <span>AB-Nr.: <span className="text-foreground">{row.ab_nummer ?? '—'}</span> ({fmtDate(row.ab_datum)})</span>
                          <span>Lieferschein: <span className="text-foreground">{row.ls_nummer ?? '—'}</span> ({fmtDate(row.ls_datum)})</span>
                          <span>
                            Paletten: <span className="text-foreground">{row.paletten_erwartet ?? '?'}</span>
                            {row.nettogewicht_kg ? ` · ${row.nettogewicht_kg} kg` : ''}
                          </span>
                          {row.avisiert_fuer && (
                            <span>Avisiert: <span className="text-foreground">{fmtDateTime(row.avisiert_fuer)}</span></span>
                          )}
                        </div>
                      )}

                      {row.status === 'empfangen' && (
                        <div className="flex flex-wrap gap-x-5 gap-y-1 pt-1 text-xs text-muted-foreground">
                          <span>
                            Empfangen von <span className="text-foreground">{row.empfangen_von_name ?? 'Mitarbeiter'}</span>{' '}
                            am {fmtDateTime(row.empfangen_am)}
                          </span>
                          {row.paletten_geprueft != null && (
                            <span>Geprüft: <span className="text-foreground">{row.paletten_geprueft}{row.kind === 'palette' ? ' Paletten' : ''}</span></span>
                          )}
                          {row.schaden && (
                            <span className="inline-flex items-center gap-1 text-red-600 dark:text-red-400">
                              <AlertTriangle className="h-3.5 w-3.5" /> Schaden gemeldet
                            </span>
                          )}
                        </div>
                      )}
                      {row.status === 'empfangen' && row.notiz && (
                        <p className="text-xs text-muted-foreground pt-0.5">Notiz: {row.notiz}</p>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {row.tracking_url && (
                        <Button variant="ghost" size="sm" asChild>
                          <a href={row.tracking_url} target="_blank" rel="noopener noreferrer">
                            <ExternalLink className="h-4 w-4" /> Sendung verfolgen
                          </a>
                        </Button>
                      )}
                      {row.ab_pdf_path && (
                        <Button variant="ghost" size="sm" onClick={() => openBeleg(row.id, 'ab')}>
                          <FileText className="h-4 w-4" /> AB-PDF
                        </Button>
                      )}
                      {row.ls_pdf_path && (
                        <Button variant="ghost" size="sm" onClick={() => openBeleg(row.id, 'ls')}>
                          <FileText className="h-4 w-4" /> Lieferschein
                        </Button>
                      )}
                      {row.status !== 'empfangen' && (
                        <Button size="sm" onClick={() => setEmpfangTarget(row)}>
                          <PackageCheck className="h-4 w-4" /> Empfang bestätigen
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      <EmpfangDialog
        target={empfangTarget}
        onClose={() => setEmpfangTarget(null)}
        onDone={() => { setEmpfangTarget(null); load(true) }}
      />
    </div>
  )
}

function EmpfangDialog({
  target, onClose, onDone,
}: {
  target: Wareneingang | null
  onClose: () => void
  onDone: () => void
}) {
  const [palettenGeprueft, setPalettenGeprueft] = useState('')
  const [schaden, setSchaden] = useState(false)
  const [notiz, setNotiz] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (target) {
      setPalettenGeprueft(target.paletten_erwartet != null ? String(target.paletten_erwartet) : '')
      setSchaden(false)
      setNotiz('')
    }
  }, [target])

  async function submit() {
    if (!target) return
    setSaving(true)
    try {
      const res = await fetch(`/api/wareneingang/${target.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mark_empfangen: true,
          paletten_geprueft: palettenGeprueft.trim() === '' ? null : Number(palettenGeprueft),
          schaden,
          notiz: notiz.trim() === '' ? null : notiz.trim(),
        }),
      })
      if (!res.ok) throw new Error()
      toast.success('Wareneingang als empfangen bestätigt')
      onDone()
    } catch {
      toast.error('Bestätigung fehlgeschlagen')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={!!target} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Empfang bestätigen</DialogTitle>
          <DialogDescription>
            {target && (
              <>Lieferung {SUPPLIER_LABEL[target.supplier] ?? target.supplier}
              {target.ab_nummer ? ` · AB ${target.ab_nummer}` : ''}
              {target.paletten_erwartet != null ? ` · erwartet: ${target.paletten_erwartet} Paletten` : ''}</>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="paletten">Tatsächlich angenommene Paletten</Label>
            <Input
              id="paletten"
              type="number"
              min={0}
              value={palettenGeprueft}
              onChange={(e) => setPalettenGeprueft(e.target.value)}
              placeholder="z. B. 2"
            />
          </div>

          <div className="flex items-center gap-2">
            <Checkbox id="schaden" checked={schaden} onCheckedChange={(c) => setSchaden(c === true)} />
            <Label htmlFor="schaden" className="font-normal cursor-pointer">
              Schaden / Abweichung feststellen
            </Label>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="notiz">Notiz (optional)</Label>
            <Textarea
              id="notiz"
              value={notiz}
              onChange={(e) => setNotiz(e.target.value)}
              placeholder="Anmerkungen zur Annahme, Schäden, fehlende Paletten …"
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Abbrechen</Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <PackageCheck className="h-4 w-4" />}
            Empfang bestätigen
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
