'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { Trash2, Play, Loader2, CheckCircle2, AlertCircle, Plus, X } from 'lucide-react'
import { toast } from 'sonner'
import type { BuchpreischeckSeller } from '@/hooks/useBuchpreisbindung'

const INTERVAL_OPTIONS = [
  { value: 10, label: 'Alle 10 Minuten' },
  { value: 30, label: 'Alle 30 Minuten' },
  { value: 60, label: 'Stündlich' },
  { value: 120, label: 'Alle 2 Stunden' },
  { value: 360, label: 'Alle 6 Stunden' },
  { value: 720, label: 'Alle 12 Stunden' },
  { value: 1440, label: 'Täglich' },
]

const WEEKDAYS = [
  { key: 'mon', label: 'Mo' },
  { key: 'tue', label: 'Di' },
  { key: 'wed', label: 'Mi' },
  { key: 'thu', label: 'Do' },
  { key: 'fri', label: 'Fr' },
  { key: 'sat', label: 'Sa' },
  { key: 'sun', label: 'So' },
]

interface Props {
  sellers: BuchpreischeckSeller[]
  onAddSeller: (payload: { amazon_seller_id: string; seller_name?: string; interval_minutes: number; active_weekdays: string[] }) => Promise<BuchpreischeckSeller>
  onUpdateSeller: (id: string, updates: Partial<BuchpreischeckSeller>) => Promise<BuchpreischeckSeller>
  onDeleteSeller: (id: string) => Promise<void>
  onRunSeller: (sellerId: string) => Promise<void>
  selectedSellerId: string | null
  onSelectSeller: (id: string) => void
}

export function SellerConfigSection({ sellers, onAddSeller, onUpdateSeller, onDeleteSeller, onRunSeller, selectedSellerId, onSelectSeller }: Props) {
  const [showAddForm, setShowAddForm] = useState(false)
  const [sellerId, setSellerId] = useState('')
  const [verifyState, setVerifyState] = useState<'idle' | 'loading' | 'found' | 'notfound' | 'error'>('idle')
  const [verifiedName, setVerifiedName] = useState<string | null>(null)
  const [interval, setInterval] = useState(60)
  const [weekdays, setWeekdays] = useState<string[]>(['mon','tue','wed','thu','fri'])
  const [isSaving, setIsSaving] = useState(false)
  const [runningId, setRunningId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  async function handleVerify() {
    setVerifyState('loading')
    setVerifiedName(null)
    try {
      const res = await fetch('/api/buchpreisbindung/sellers/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ seller_id: sellerId.trim() }),
      })
      const data = await res.json()
      if (!res.ok) {
        setVerifyState('error')
        toast.error(data.error ?? 'Fehler bei der Verifizierung')
        return
      }
      if (data.exists === null) {
        setVerifyState('error')
        toast.info(data.message)
        return
      }
      if (data.exists) {
        setVerifyState('found')
        setVerifiedName(data.seller_name)
      } else {
        setVerifyState('notfound')
      }
    } catch {
      setVerifyState('error')
      toast.error('Netzwerkfehler')
    }
  }

  async function handleAdd() {
    if (!sellerId.trim()) return
    setIsSaving(true)
    try {
      await onAddSeller({
        amazon_seller_id: sellerId.trim().toUpperCase(),
        seller_name: verifiedName ?? undefined,
        interval_minutes: interval,
        active_weekdays: weekdays,
      })
      toast.success('Händler hinzugefügt')
      setSellerId('')
      setVerifyState('idle')
      setVerifiedName(null)
      setInterval(60)
      setWeekdays(['mon','tue','wed','thu','fri'])
      setShowAddForm(false)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Fehler')
    } finally {
      setIsSaving(false)
    }
  }

  async function handleToggleActive(seller: BuchpreischeckSeller) {
    try {
      await onUpdateSeller(seller.id, { is_active: !seller.is_active })
      toast.success(seller.is_active ? 'Automatische Prüfung deaktiviert' : 'Automatische Prüfung aktiviert')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Fehler')
    }
  }

  async function handleDelete(id: string) {
    setDeletingId(id)
    try {
      await onDeleteSeller(id)
      toast.success('Händler entfernt')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Fehler')
    } finally {
      setDeletingId(null)
    }
  }

  async function handleRun(sellerId: string) {
    setRunningId(sellerId)
    try {
      await onRunSeller(sellerId)
      toast.success('Prüfung gestartet')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Fehler')
    } finally {
      setRunningId(null)
    }
  }

  function toggleWeekday(day: string) {
    setWeekdays(prev =>
      prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]
    )
  }

  function formatInterval(minutes: number) {
    return INTERVAL_OPTIONS.find(o => o.value === minutes)?.label ?? `${minutes} Min`
  }

  function formatWeekdays(days: string[]) {
    const all = WEEKDAYS.map(d => d.key)
    if (days.length === 7) return 'täglich'
    const labels = WEEKDAYS.filter(d => days.includes(d.key)).map(d => d.label)
    return labels.join(', ')
  }

  function formatNextRun(ts: string | null) {
    if (!ts) return '—'
    return new Date(ts).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })
  }

  const isSellerIdValid = /^A[A-Z0-9]{13}$/.test(sellerId.trim().toUpperCase())

  return (
    <Card className="bg-[#0f1e14] border-white/10">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-white text-base">Händler konfigurieren</CardTitle>
          {!showAddForm && (
            <Button size="sm" variant="outline" className="border-green-500/30 text-green-400 hover:bg-green-500/10" onClick={() => setShowAddForm(true)}>
              <Plus className="h-4 w-4 mr-1" />
              Händler hinzufügen
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {showAddForm && (
          <div className="rounded-xl border border-white/10 bg-white/4 p-4 space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-white/80">Neuen Händler hinzufügen</p>
              <button onClick={() => { setShowAddForm(false); setVerifyState('idle'); setSellerId('') }} className="text-white/30 hover:text-white/60">
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Seller ID + Verify */}
            <div className="space-y-2">
              <Label className="text-white/60 text-xs">Amazon Seller-ID</Label>
              <div className="flex gap-2">
                <Input
                  value={sellerId}
                  onChange={e => { setSellerId(e.target.value.toUpperCase()); setVerifyState('idle') }}
                  placeholder="z.B. A1EXAMPLE23456"
                  className="bg-white/5 border-white/15 text-white placeholder:text-white/25 font-mono"
                  maxLength={14}
                />
                <Button
                  onClick={handleVerify}
                  disabled={!isSellerIdValid || verifyState === 'loading'}
                  variant="outline"
                  className="shrink-0 border-white/15 text-white/70 hover:bg-white/8"
                >
                  {verifyState === 'loading' ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : 'Prüfen'}
                </Button>
              </div>
              {verifyState === 'found' && (
                <p className="text-xs text-green-400 flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3" />
                  Händler gefunden{verifiedName ? `: ${verifiedName}` : ''}
                </p>
              )}
              {verifyState === 'notfound' && (
                <p className="text-xs text-red-400 flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" />
                  Kein Händler mit dieser ID auf amazon.de gefunden
                </p>
              )}
            </div>

            {/* Interval */}
            <div className="space-y-2">
              <Label className="text-white/60 text-xs">Prüfintervall</Label>
              <Select value={String(interval)} onValueChange={v => setInterval(Number(v))}>
                <SelectTrigger className="bg-white/5 border-white/15 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {INTERVAL_OPTIONS.map(o => (
                    <SelectItem key={o.value} value={String(o.value)}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Weekdays */}
            <div className="space-y-2">
              <Label className="text-white/60 text-xs">Wochentage</Label>
              <div className="flex gap-2 flex-wrap">
                {WEEKDAYS.map(day => (
                  <label key={day.key} className="flex items-center gap-1.5 cursor-pointer">
                    <Checkbox
                      checked={weekdays.includes(day.key)}
                      onCheckedChange={() => toggleWeekday(day.key)}
                      className="border-white/20"
                    />
                    <span className="text-sm text-white/70">{day.label}</span>
                  </label>
                ))}
              </div>
            </div>

            <Button
              onClick={handleAdd}
              disabled={!isSellerIdValid || weekdays.length === 0 || isSaving}
              className="w-full bg-green-600 hover:bg-green-700 text-white"
            >
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Händler speichern
            </Button>
          </div>
        )}

        {/* Seller List */}
        {sellers.length === 0 && !showAddForm && (
          <p className="text-sm text-white/40 text-center py-6">
            Noch kein Händler konfiguriert. Klicke auf &quot;Händler hinzufügen&quot;.
          </p>
        )}

        {sellers.map(seller => (
          <div
            key={seller.id}
            onClick={() => onSelectSeller(seller.id)}
            className={`rounded-xl border p-3 cursor-pointer transition-all ${
              selectedSellerId === seller.id
                ? 'border-green-500/40 bg-green-500/8'
                : 'border-white/8 bg-white/3 hover:border-white/15 hover:bg-white/5'
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium text-white font-mono">{seller.amazon_seller_id}</span>
                  {seller.seller_name && (
                    <span className="text-xs text-white/50">— {seller.seller_name}</span>
                  )}
                  <Badge
                    variant="outline"
                    className={seller.is_active
                      ? 'border-green-500/30 text-green-400 text-[10px]'
                      : 'border-white/15 text-white/35 text-[10px]'}
                  >
                    {seller.is_active ? 'Aktiv' : 'Inaktiv'}
                  </Badge>
                </div>
                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
                  <span className="text-[11px] text-white/40">{formatInterval(seller.interval_minutes)}</span>
                  <span className="text-[11px] text-white/40">{formatWeekdays(seller.active_weekdays)}</span>
                  {seller.last_run_at && (
                    <span className="text-[11px] text-white/30">
                      Letzter Run: {new Date(seller.last_run_at).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })}
                    </span>
                  )}
                  {seller.next_run_at && seller.is_active && (
                    <span className="text-[11px] text-white/30">
                      Nächster Run: {formatNextRun(seller.next_run_at)}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7 text-green-400/70 hover:text-green-400 hover:bg-green-500/10"
                  title="Jetzt prüfen"
                  disabled={runningId === seller.id}
                  onClick={e => { e.stopPropagation(); handleRun(seller.id) }}
                >
                  {runningId === seller.id
                    ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    : <Play className="h-3.5 w-3.5" />}
                </Button>
                <Switch
                  checked={seller.is_active}
                  onCheckedChange={() => handleToggleActive(seller)}
                  onClick={e => e.stopPropagation()}
                  className="data-[state=checked]:bg-green-600 scale-75"
                />
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7 text-white/30 hover:text-red-400 hover:bg-red-500/10"
                  title="Händler entfernen"
                  disabled={deletingId === seller.id}
                  onClick={e => { e.stopPropagation(); handleDelete(seller.id) }}
                >
                  {deletingId === seller.id
                    ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    : <Trash2 className="h-3.5 w-3.5" />}
                </Button>
              </div>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
