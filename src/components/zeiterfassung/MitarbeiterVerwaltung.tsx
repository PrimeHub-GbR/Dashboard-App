'use client'

import { useState } from 'react'
import { useEmployees } from '@/hooks/useEmployees'
import { MitarbeiterBadge } from './MitarbeiterBadge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { Plus, Pencil, Trash2, ExternalLink, RotateCcw, ShieldAlert } from 'lucide-react'
import { toast } from 'sonner'
import type { WeeklySchedule } from '@/lib/zeiterfassung/types'
import { DEFAULT_WEEKLY_SCHEDULE, WEEKDAY_LABELS } from '@/lib/zeiterfassung/types'

const COLORS = ['#22c55e','#3b82f6','#f59e0b','#ef4444','#8b5cf6','#ec4899','#06b6d4','#84cc16']

interface FormState {
  name: string
  color: string
  target_hours_per_month: number
  weekly_schedule: WeeklySchedule
}

const defaultForm: FormState = {
  name: '', color: '#22c55e', target_hours_per_month: 160,
  weekly_schedule: { ...DEFAULT_WEEKLY_SCHEDULE },
}

export function MitarbeiterVerwaltung({ hideCreate = false }: { hideCreate?: boolean }) {
  const { employees, loading, createEmployee, updateEmployee, deleteEmployee } = useEmployees()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingPinIsSet, setEditingPinIsSet] = useState(false)
  const [form, setForm] = useState<FormState>(defaultForm)
  const [saving, setSaving] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  function openCreate() {
    setEditingId(null)
    setEditingPinIsSet(false)
    setForm(defaultForm)
    setDialogOpen(true)
  }

  function openEdit(emp: typeof employees[number]) {
    setEditingId(emp.id)
    setEditingPinIsSet((emp as { pin_is_set?: boolean }).pin_is_set ?? false)
    setForm({
      name: emp.name,
      color: emp.color,
      target_hours_per_month: emp.target_hours_per_month,
      weekly_schedule: emp.weekly_schedule ?? { ...DEFAULT_WEEKLY_SCHEDULE },
    })
    setDialogOpen(true)
  }

  async function handleResetPin() {
    if (!editingId) return
    setSaving(true)
    try {
      await updateEmployee(editingId, { reset_pin: true })
      toast.success('PIN zurückgesetzt — Mitarbeiter muss beim nächsten Check-in eine neue PIN vergeben')
    } catch {
      toast.error('PIN-Reset fehlgeschlagen')
    } finally {
      setSaving(false)
    }
  }

  async function handleSave() {
    if (!form.name.trim()) return
    setSaving(true)
    try {
      if (editingId) {
        await updateEmployee(editingId, {
          name: form.name,
          color: form.color,
          target_hours_per_month: form.target_hours_per_month,
          weekly_schedule: form.weekly_schedule,
        })
        toast.success('Mitarbeiter aktualisiert')
      } else {
        await createEmployee(form)
        toast.success('Mitarbeiter angelegt')
      }
      setDialogOpen(false)
    } catch {
      toast.error('Speichern fehlgeschlagen')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!deleteId) return
    try {
      await deleteEmployee(deleteId)
      toast.success('Mitarbeiter gelöscht')
    } catch {
      toast.error('Löschen fehlgeschlagen')
    } finally {
      setDeleteId(null)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Mitarbeiter</h2>
        {!hideCreate && (
          <Button size="sm" onClick={openCreate} className="gap-2">
            <Plus className="w-4 h-4" />
            Neu
          </Button>
        )}
      </div>

      <div className="rounded-md border divide-y">
        {loading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex items-center justify-between p-4">
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-8 w-20" />
            </div>
          ))
        ) : employees.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">
            Noch keine Mitarbeiter angelegt.
          </div>
        ) : (
          employees.map((emp) => (
            <div key={emp.id} className="flex items-center justify-between p-4">
              <div className="flex items-center gap-4">
                <div className="w-36 shrink-0">
                  <MitarbeiterBadge name={emp.name} color={emp.color} />
                </div>
                <Badge variant="outline" className="text-xs whitespace-nowrap">
                  {emp.target_hours_per_month}h/Monat
                </Badge>
                {!emp.is_active && (
                  <Badge variant="secondary" className="text-xs">Inaktiv</Badge>
                )}
                {!emp.pin_is_set && (
                  <Badge variant="outline" className="text-xs text-orange-400 border-orange-400/40 gap-1 whitespace-nowrap">
                    <ShieldAlert className="w-3 h-3" />
                    PIN nicht gesetzt
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" asChild className="text-xs text-muted-foreground gap-1">
                  <a href="/kiosk" target="_blank">
                    <ExternalLink className="w-3 h-3" />
                    Kiosk
                  </a>
                </Button>
                <Switch
                  checked={emp.is_active}
                  onCheckedChange={(checked) => updateEmployee(emp.id, { is_active: checked })}
                />
                <Button variant="ghost" size="icon" onClick={() => openEdit(emp)}>
                  <Pencil className="w-4 h-4" />
                </Button>
                <Button variant="ghost" size="icon" onClick={() => setDeleteId(emp.id)} className="text-destructive hover:text-destructive">
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Anlegen/Bearbeiten Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Mitarbeiter bearbeiten' : 'Mitarbeiter anlegen'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="Vorname Nachname"
              />
            </div>
            {editingId && editingPinIsSet && (
              <div className="flex items-center justify-between rounded-lg border border-orange-400/20 bg-orange-400/5 px-3 py-2">
                <span className="text-xs text-muted-foreground">PIN ist gesetzt</span>
                <button
                  type="button"
                  onClick={handleResetPin}
                  disabled={saving}
                  className="flex items-center gap-1.5 text-xs text-orange-400 hover:text-orange-300 disabled:opacity-40 transition-colors"
                >
                  <RotateCcw className="w-3 h-3" />
                  PIN zurücksetzen
                </button>
              </div>
            )}
            <div className="space-y-2">
              <Label>Farbe</Label>
              <div className="flex gap-2 flex-wrap">
                {COLORS.map((c) => (
                  <button
                    key={c}
                    className={`w-8 h-8 rounded-full border-2 transition-transform active:scale-95 ${
                      form.color === c ? 'border-white scale-110' : 'border-transparent'
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
                min={1}
                max={400}
              />
            </div>
            <div className="space-y-2">
              <Label>Wochenplan (Stunden pro Tag)</Label>
              <div className="grid grid-cols-7 gap-1">
                {(Object.keys(WEEKDAY_LABELS) as Array<keyof WeeklySchedule>).map((day) => (
                  <div key={day} className="flex flex-col items-center gap-1">
                    <span className="text-xs text-muted-foreground font-medium">{WEEKDAY_LABELS[day]}</span>
                    <Input
                      type="number"
                      value={form.weekly_schedule[day]}
                      onChange={(e) => setForm(f => ({
                        ...f,
                        weekly_schedule: { ...f.weekly_schedule, [day]: Math.min(24, Math.max(0, Number(e.target.value))) },
                      }))}
                      min={0}
                      max={24}
                      className="text-center px-1 h-8 text-sm"
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Abbrechen</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Speichert…' : 'Speichern'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Löschen Bestätigung */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Mitarbeiter löschen?</AlertDialogTitle>
            <AlertDialogDescription>
              Alle Zeiteinträge und Schichtpläne dieses Mitarbeiters werden ebenfalls gelöscht. Diese Aktion ist nicht rückgängig zu machen.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Löschen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
