'use client'

import { useRef, useState } from 'react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'sonner'
import { FileText, Upload, X } from 'lucide-react'
import type { OrgMember, OrgPosition, UserRole } from './types'
import { POSITION_LABELS } from './types'

const COLORS = ['#22c55e','#3b82f6','#f59e0b','#ef4444','#8b5cf6','#ec4899','#06b6d4','#84cc16']
const WEEKDAYS = [
  { key: 'mon', label: 'Mo' }, { key: 'tue', label: 'Di' }, { key: 'wed', label: 'Mi' },
  { key: 'thu', label: 'Do' }, { key: 'fri', label: 'Fr' }, { key: 'sat', label: 'Sa' },
  { key: 'sun', label: 'So' },
] as const

type WeekKey = typeof WEEKDAYS[number]['key']

const DEFAULT_SCHEDULE: Record<WeekKey, number> = { mon:8, tue:8, wed:8, thu:8, fri:8, sat:0, sun:0 }

interface AddMemberDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  userRole: UserRole
  defaultReportsTo?: string | null
  fixedPosition?: OrgPosition
  availableParents?: OrgMember[]
  onSaved: () => void
}

export function AddMemberDialog({
  open,
  onOpenChange,
  userRole,
  defaultReportsTo,
  fixedPosition,
  availableParents,
  onSaved,
}: AddMemberDialogProps) {
  const [form, setForm] = useState({
    name:                   '',
    position:               (fixedPosition ?? 'mitarbeiter') as OrgPosition,
    reports_to:             defaultReportsTo ?? null as string | null,
    color:                  '#22c55e',
    target_hours_per_month: 160,
    weekly_schedule:        { ...DEFAULT_SCHEDULE } as Record<WeekKey, number>,
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

  const showKioskFields = form.position === 'mitarbeiter' || form.position === 'manager'

  function resetForm() {
    setForm({
      name: '', position: fixedPosition ?? 'mitarbeiter', reports_to: defaultReportsTo ?? null,
      color: '#22c55e', target_hours_per_month: 160,
      weekly_schedule: { ...DEFAULT_SCHEDULE }, birth_date: '', home_address: '',
      tax_number: '', phone: '', email: '',
    })
    setArbeitsvertragFile(null)
    setPersonalfragebogenFile(null)
  }

  async function uploadDocument(memberId: string, file: File, type: 'arbeitsvertrag' | 'personalfragebogen') {
    const fd = new FormData()
    fd.append('type', type)
    fd.append('file', file)
    const res = await fetch(`/api/organisation/members/${memberId}/documents`, {
      method: 'POST',
      body: fd,
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error((err as { error?: string })?.error ?? `Fehler beim Upload (${type})`)
    }
  }

  async function handleSave() {
    if (!form.name.trim())        { toast.error('Name ist erforderlich'); return }
    if (!form.position)           { toast.error('Position ist erforderlich'); return }
    if (form.position === 'mitarbeiter' && userRole === 'admin' && !form.reports_to) {
      toast.error('Vorgesetzter ist erforderlich'); return
    }
    if (!form.birth_date)         { toast.error('Geburtsdatum ist erforderlich'); return }
    if (!form.home_address.trim()) { toast.error('Heimadresse ist erforderlich'); return }
    if (!form.tax_number.trim())  { toast.error('Steuernummer ist erforderlich'); return }
    if (!form.phone.trim())       { toast.error('Telefonnummer ist erforderlich'); return }

    setSaving(true)
    try {
      const res = await fetch('/api/organisation/members', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name:                   form.name.trim(),
          position:               form.position,
          reports_to:             form.reports_to,
          color:                  form.color,
          target_hours_per_month: form.target_hours_per_month,
          weekly_schedule:        form.weekly_schedule,
          birth_date:             form.birth_date || null,
          home_address:           form.home_address.trim() || null,
          tax_number:             form.tax_number.trim() || null,
          phone:                  form.phone.trim() || null,
          email:                  form.email.trim() || null,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error((err as { error?: string })?.error ?? 'Fehler beim Anlegen')
      }

      const { member } = await res.json()

      // Dokumente hochladen (optional)
      if (arbeitsvertragFile) await uploadDocument(member.id, arbeitsvertragFile, 'arbeitsvertrag')
      if (personalfragebogenFile) await uploadDocument(member.id, personalfragebogenFile, 'personalfragebogen')

      toast.success('Mitglied angelegt')
      resetForm()
      onSaved()
      onOpenChange(false)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Fehler beim Anlegen')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Neues Mitglied anlegen</DialogTitle>
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
              {userRole === 'admin' ? (
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
                <Input value="Mitarbeiter" disabled className="bg-muted text-muted-foreground" />
              )}
            </div>

            {userRole === 'admin' && availableParents && availableParents.length > 0 && !fixedPosition && (
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
            />

            <PdfUploadField
              label="Personalfragebogen"
              file={personalfragebogenFile}
              inputRef={personalfragebogenRef}
              onChange={setPersonalfragebogenFile}
            />
          </div>

          {/* ── Zeiterfassung (nur für Mitarbeiter / Manager) ── */}
          {showKioskFields && (
            <div className="space-y-3 border-t pt-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Zeiterfassung (Kiosk)</p>

              <div className="flex items-center gap-2 rounded-lg border border-orange-400/20 bg-orange-400/5 px-3 py-2">
                <div className="w-2 h-2 rounded-full bg-orange-400 shrink-0" />
                <p className="text-xs text-orange-400">PIN Setup ausstehend — Mitarbeiter setzt PIN beim ersten Kiosk-Check-in</p>
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
                        value={form.weekly_schedule[key]}
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
            {saving ? 'Speichert…' : 'Anlegen'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

interface PdfUploadFieldProps {
  label: string
  file: File | null
  inputRef: React.RefObject<HTMLInputElement | null>
  onChange: (file: File | null) => void
  existingPath?: string | null
  onDownload?: () => void
  onDelete?: () => void
}

export function PdfUploadField({ label, file, inputRef, onChange, existingPath, onDownload, onDelete }: PdfUploadFieldProps) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {existingPath && !file ? (
        <div className="flex items-center justify-between rounded-lg border px-3 py-2 bg-muted/30">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-blue-400" />
            <span className="text-sm text-muted-foreground">{label}.pdf</span>
          </div>
          <div className="flex gap-1">
            {onDownload && (
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={onDownload}>
                Öffnen
              </Button>
            )}
            {onDelete && (
              <Button
                variant="ghost" size="icon"
                className="h-7 w-7 text-destructive hover:text-destructive"
                onClick={onDelete}
              >
                <X className="w-3.5 h-3.5" />
              </Button>
            )}
          </div>
        </div>
      ) : file ? (
        <div className="flex items-center justify-between rounded-lg border border-green-500/30 bg-green-500/5 px-3 py-2">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-green-400" />
            <span className="text-sm text-green-300 truncate max-w-[200px]">{file.name}</span>
          </div>
          <Button
            variant="ghost" size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-foreground"
            onClick={() => { onChange(null); if (inputRef.current) inputRef.current.value = '' }}
          >
            <X className="w-3.5 h-3.5" />
          </Button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="w-full flex items-center gap-2 rounded-lg border border-dashed border-border px-3 py-2.5 text-sm text-muted-foreground hover:border-muted-foreground/50 hover:text-foreground transition-colors"
        >
          <Upload className="w-4 h-4" />
          PDF auswählen
        </button>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0] ?? null
          onChange(f)
        }}
      />
    </div>
  )
}
