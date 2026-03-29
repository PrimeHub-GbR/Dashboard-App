'use client'

import { useRef, useState, useEffect } from 'react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'sonner'
import { RotateCcw } from 'lucide-react'
import type { OrgMember, OrgPosition, UserRole, WeekSchedule } from './types'
import { POSITION_LABELS } from './types'
import { PdfUploadField } from './AddMemberDialog'

const COLORS = ['#22c55e','#3b82f6','#f59e0b','#ef4444','#8b5cf6','#ec4899','#06b6d4','#84cc16']
const WEEKDAYS = [
  { key: 'mon', label: 'Mo' }, { key: 'tue', label: 'Di' }, { key: 'wed', label: 'Mi' },
  { key: 'thu', label: 'Do' }, { key: 'fri', label: 'Fr' }, { key: 'sat', label: 'Sa' },
  { key: 'sun', label: 'So' },
] as const

type WeekKey = typeof WEEKDAYS[number]['key']

const DEFAULT_SCHEDULE: WeekSchedule = { mon: 8, tue: 8, wed: 8, thu: 8, fri: 8, sat: 0, sun: 0 }

interface EditMemberDialogProps {
  member: OrgMember | null
  open: boolean
  onOpenChange: (open: boolean) => void
  userRole: UserRole
  availableParents?: OrgMember[]
  onSaved: () => void
}

export function EditMemberDialog({
  member, open, onOpenChange, userRole, availableParents, onSaved,
}: EditMemberDialogProps) {
  const [form, setForm] = useState({
    name:                   '',
    position:               'mitarbeiter' as OrgPosition,
    reports_to:             null as string | null,
    color:                  '#22c55e',
    target_hours_per_month: 160,
    weekly_schedule:        { ...DEFAULT_SCHEDULE } as WeekSchedule,
    is_active:              true,
    birth_date:             '',
    home_address:           '',
    tax_number:             '',
    phone:                  '',
    email:                  '',
  })
  const [arbeitsvertragFile, setArbeitsvertragFile] = useState<File | null>(null)
  const [personalfragebogenFile, setPersonalfragebogenFile] = useState<File | null>(null)
  const arbeitsvertragRef = useRef<HTMLInputElement>(null)
  const personalfragebogenRef = useRef<HTMLInputElement>(null)
  const [saving, setSaving] = useState(false)
  const [resettingPin, setResettingPin] = useState(false)

  useEffect(() => {
    if (member) {
      setForm({
        name:                   member.name,
        position:               member.position,
        reports_to:             member.reports_to,
        color:                  member.color,
        target_hours_per_month: member.target_hours_per_month ?? 160,
        weekly_schedule:        member.weekly_schedule ?? { ...DEFAULT_SCHEDULE },
        is_active:              member.is_active,
        birth_date:             member.birth_date ?? '',
        home_address:           member.home_address ?? '',
        tax_number:             member.tax_number ?? '',
        phone:                  member.phone ?? '',
        email:                  member.email ?? '',
      })
      setArbeitsvertragFile(null)
      setPersonalfragebogenFile(null)
    }
  }, [member])

  if (!member) return null

  const isGF = member.position === 'geschaeftsfuehrer'
  const showKioskFields = form.position === 'mitarbeiter' || form.position === 'manager'
  const canEditAll = userRole === 'admin'

  async function handleResetPin() {
    if (!member) return
    setResettingPin(true)
    try {
      const res = await fetch(`/api/organisation/members/${member.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reset_pin: true }),
      })
      if (!res.ok) throw new Error('Fehler beim Zurücksetzen')
      toast.success('PIN zurückgesetzt — Mitarbeiter muss beim nächsten Check-in eine neue PIN vergeben')
      onSaved()
    } catch {
      toast.error('PIN-Reset fehlgeschlagen')
    } finally {
      setResettingPin(false)
    }
  }

  async function uploadDocument(file: File, type: 'arbeitsvertrag' | 'personalfragebogen') {
    const fd = new FormData()
    fd.append('type', type)
    fd.append('file', file)
    const res = await fetch(`/api/organisation/members/${member!.id}/documents`, {
      method: 'POST',
      body: fd,
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error((err as { error?: string })?.error ?? `Fehler beim Upload (${type})`)
    }
  }

  async function handleDeleteDocument(type: 'arbeitsvertrag' | 'personalfragebogen') {
    try {
      const res = await fetch(`/api/organisation/members/${member!.id}/documents?type=${type}`, {
        method: 'DELETE',
      })
      if (!res.ok) throw new Error('Fehler beim Löschen')
      toast.success('Dokument gelöscht')
      onSaved()
    } catch {
      toast.error('Dokument konnte nicht gelöscht werden')
    }
  }

  async function handleDownloadDocument(type: 'arbeitsvertrag' | 'personalfragebogen') {
    try {
      const res = await fetch(`/api/organisation/members/${member!.id}/documents?type=${type}`)
      if (!res.ok) throw new Error('Nicht gefunden')
      const { url } = await res.json()
      window.open(url, '_blank')
    } catch {
      toast.error('Dokument konnte nicht geöffnet werden')
    }
  }

  async function handleSave() {
    if (!member) return
    if (!form.name.trim())         { toast.error('Name ist erforderlich'); return }
    if (form.position === 'mitarbeiter' && canEditAll && !form.reports_to) {
      toast.error('Vorgesetzter ist erforderlich'); return
    }
    if (!form.birth_date)          { toast.error('Geburtsdatum ist erforderlich'); return }
    if (!form.home_address.trim()) { toast.error('Heimadresse ist erforderlich'); return }
    if (!form.tax_number.trim())   { toast.error('Steuernummer ist erforderlich'); return }
    if (!form.phone.trim())        { toast.error('Telefonnummer ist erforderlich'); return }

    setSaving(true)
    try {
      const body: Record<string, unknown> = {
        name:       form.name.trim(),
        birth_date: form.birth_date || null,
        home_address: form.home_address.trim() || null,
        tax_number:   form.tax_number.trim() || null,
        phone:        form.phone.trim() || null,
        email:        form.email.trim() || null,
      }

      if (canEditAll) {
        body.position   = form.position
        body.reports_to = form.reports_to
        body.color      = form.color
        body.target_hours_per_month = form.target_hours_per_month
        body.weekly_schedule        = form.weekly_schedule
        body.is_active              = form.is_active
      } else {
        body.color                  = form.color
        body.target_hours_per_month = form.target_hours_per_month
        body.weekly_schedule        = form.weekly_schedule
        body.is_active              = form.is_active
      }

      const res = await fetch(`/api/organisation/members/${member.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error((err as { error?: string })?.error ?? 'Fehler beim Speichern')
      }

      // Dokumente hochladen falls neu ausgewählt
      if (arbeitsvertragFile) await uploadDocument(arbeitsvertragFile, 'arbeitsvertrag')
      if (personalfragebogenFile) await uploadDocument(personalfragebogenFile, 'personalfragebogen')

      toast.success('Daten gespeichert')
      onSaved()
      onOpenChange(false)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Fehler beim Speichern')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {member.name}
            <span className="ml-2 text-sm font-normal text-muted-foreground">
              · {POSITION_LABELS[member.position]}
            </span>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* ── Stammdaten ── */}
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Stammdaten</p>

            <div className="space-y-2">
              <Label>Name <span className="text-destructive">*</span></Label>
              <Input
                value={form.name}
                onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="Vorname Nachname"
              />
            </div>

            <div className="space-y-2">
              <Label>Position <span className="text-destructive">*</span></Label>
              {canEditAll && !isGF ? (
                <Select
                  value={form.position}
                  onValueChange={(v) => setForm(f => ({ ...f, position: v as OrgPosition }))}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.keys(POSITION_LABELS) as OrgPosition[]).map((p) => (
                      <SelectItem key={p} value={p}>{POSITION_LABELS[p]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  value={POSITION_LABELS[form.position]}
                  disabled
                  className="bg-muted text-muted-foreground"
                />
              )}
            </div>

            {canEditAll && availableParents && availableParents.length > 0 && !isGF && (
              <div className="space-y-2">
                <Label>
                  Vorgesetzter
                  {form.position === 'mitarbeiter' && <span className="text-destructive ml-1">*</span>}
                </Label>
                <Select
                  value={form.reports_to ?? '__none__'}
                  onValueChange={(v) => setForm(f => ({ ...f, reports_to: v === '__none__' ? null : v }))}
                >
                  <SelectTrigger><SelectValue placeholder="— kein —" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">— kein —</SelectItem>
                    {availableParents.map((m) => (
                      <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-2">
              <Label>Geburtsdatum <span className="text-destructive">*</span></Label>
              <Input
                type="date"
                value={form.birth_date}
                onChange={(e) => setForm(f => ({ ...f, birth_date: e.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <Label>Heimadresse <span className="text-destructive">*</span></Label>
              <Textarea
                value={form.home_address}
                onChange={(e) => setForm(f => ({ ...f, home_address: e.target.value }))}
                placeholder="Straße, PLZ, Ort"
                rows={2}
              />
            </div>

            <div className="space-y-2">
              <Label>Steuernummer <span className="text-destructive">*</span></Label>
              <Input
                value={form.tax_number}
                onChange={(e) => setForm(f => ({ ...f, tax_number: e.target.value }))}
                placeholder="z.B. 12/345/67890"
              />
            </div>

            <div className="space-y-2">
              <Label>Telefonnummer <span className="text-destructive">*</span></Label>
              <Input
                type="tel"
                value={form.phone}
                onChange={(e) => setForm(f => ({ ...f, phone: e.target.value }))}
                placeholder="+49 123 456789"
              />
            </div>

            <div className="space-y-2">
              <Label>E-Mail</Label>
              <Input
                type="email"
                value={form.email}
                onChange={(e) => setForm(f => ({ ...f, email: e.target.value }))}
                placeholder="name@beispiel.de"
              />
            </div>
          </div>

          {/* ── Dokumente ── */}
          <div className="space-y-3 border-t pt-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Dokumente (optional)</p>

            <PdfUploadField
              label="Arbeitsvertrag"
              file={arbeitsvertragFile}
              inputRef={arbeitsvertragRef}
              onChange={setArbeitsvertragFile}
              existingPath={member.arbeitsvertrag_path}
              onDownload={() => handleDownloadDocument('arbeitsvertrag')}
              onDelete={() => handleDeleteDocument('arbeitsvertrag')}
            />

            <PdfUploadField
              label="Personalfragebogen"
              file={personalfragebogenFile}
              inputRef={personalfragebogenRef}
              onChange={setPersonalfragebogenFile}
              existingPath={member.personalfragebogen_path}
              onDownload={() => handleDownloadDocument('personalfragebogen')}
              onDelete={() => handleDeleteDocument('personalfragebogen')}
            />
          </div>

          {/* ── Zeiterfassung (Kiosk) ── */}
          {showKioskFields && (
            <div className="space-y-3 border-t pt-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Zeiterfassung (Kiosk)</p>

              <div className="flex items-center justify-between">
                <Label>Für Kiosk aktiv</Label>
                <Switch
                  checked={form.is_active}
                  onCheckedChange={(checked) => setForm(f => ({ ...f, is_active: checked }))}
                />
              </div>

              <div className="flex items-center justify-between rounded-lg border px-3 py-2 bg-muted/30"
                style={member.pin_is_set ? undefined : { borderColor: 'rgb(251 146 60 / 0.3)' }}>
                <div className="flex items-center gap-2">
                  {member.pin_is_set ? (
                    <>
                      <div className="w-2 h-2 rounded-full bg-green-500" />
                      <span className="text-xs text-muted-foreground">PIN gesetzt</span>
                    </>
                  ) : (
                    <>
                      <div className="w-2 h-2 rounded-full bg-orange-400" />
                      <span className="text-xs text-orange-400">Setup ausstehend</span>
                    </>
                  )}
                </div>
                {member.pin_is_set && (
                  <button
                    type="button"
                    onClick={handleResetPin}
                    disabled={resettingPin || saving}
                    className="flex items-center gap-1.5 text-xs text-orange-400 hover:text-orange-300 disabled:opacity-40 transition-colors"
                  >
                    <RotateCcw className="w-3 h-3" />
                    {resettingPin ? 'Wird zurückgesetzt…' : 'Zurücksetzen'}
                  </button>
                )}
              </div>

              <div className="space-y-2">
                <Label>Farbe</Label>
                <div className="flex gap-2 flex-wrap">
                  {COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      className={`w-7 h-7 rounded-full border-2 transition-transform active:scale-95 ${
                        form.color === c ? 'border-foreground scale-110' : 'border-transparent'
                      }`}
                      style={{ backgroundColor: c }}
                      onClick={() => setForm(f => ({ ...f, color: c }))}
                    />
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label>Sollstunden pro Monat</Label>
                <Input
                  type="number"
                  value={form.target_hours_per_month}
                  onChange={(e) => setForm(f => ({ ...f, target_hours_per_month: Number(e.target.value) }))}
                  min={1} max={400}
                />
              </div>

              <div className="space-y-2">
                <Label>Wochenplan (Stunden pro Tag)</Label>
                <div className="grid grid-cols-7 gap-1">
                  {WEEKDAYS.map(({ key, label }) => (
                    <div key={key} className="flex flex-col items-center gap-1">
                      <span className="text-xs text-muted-foreground font-medium">{label}</span>
                      <Input
                        type="number"
                        value={form.weekly_schedule[key as WeekKey]}
                        onChange={(e) => setForm(f => ({
                          ...f,
                          weekly_schedule: {
                            ...f.weekly_schedule,
                            [key]: Math.min(24, Math.max(0, Number(e.target.value))),
                          },
                        }))}
                        min={0} max={24}
                        className="text-center px-1 h-8 text-sm"
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Abbrechen</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? 'Speichert…' : 'Speichern'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
