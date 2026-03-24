'use client'

import { useState } from 'react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'sonner'
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
  /** Vorausgewählter Vorgesetzter */
  defaultReportsTo?: string | null
  /** Wenn gesetzt: Position kann nicht geändert werden */
  fixedPosition?: OrgPosition
  /** Für Vorgesetzten-Dropdown (nur admin) */
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
    work_address:           '',
    home_address:           '',
  })
  const [saving, setSaving] = useState(false)
  const showKioskFields = form.position === 'mitarbeiter' || form.position === 'manager'

  async function handleSave() {
    if (!form.name.trim()) { toast.error('Name ist erforderlich'); return }
    if (!form.position) { toast.error('Position ist erforderlich'); return }
    if (form.position === 'mitarbeiter' && userRole === 'admin' && !form.reports_to) {
      toast.error('Vorgesetzter ist erforderlich'); return
    }

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
          work_address:           form.work_address.trim() || null,
          home_address:           form.home_address.trim() || null,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error((err as { error?: string })?.error ?? 'Fehler beim Anlegen')
      }
      toast.success('Mitglied angelegt')
      setForm({
        name: '', position: fixedPosition ?? 'mitarbeiter', reports_to: defaultReportsTo ?? null,
        color: '#22c55e', target_hours_per_month: 160,
        weekly_schedule: { ...DEFAULT_SCHEDULE }, birth_date: '', work_address: '', home_address: '',
      })
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
              <Label>Name</Label>
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
              <Label>Geburtsdatum</Label>
              <Input
                type="date"
                value={form.birth_date}
                onChange={(e) => setForm(f => ({ ...f, birth_date: e.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <Label>Geschäftsadresse</Label>
              <Textarea
                value={form.work_address}
                onChange={(e) => setForm(f => ({ ...f, work_address: e.target.value }))}
                placeholder="Straße, PLZ, Ort"
                rows={2}
              />
            </div>

            <div className="space-y-2">
              <Label>Heimadresse</Label>
              <Textarea
                value={form.home_address}
                onChange={(e) => setForm(f => ({ ...f, home_address: e.target.value }))}
                placeholder="Straße, PLZ, Ort"
                rows={2}
              />
            </div>
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
