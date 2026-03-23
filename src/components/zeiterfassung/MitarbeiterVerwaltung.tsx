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
import { Plus, Pencil, Trash2, ExternalLink } from 'lucide-react'
import { toast } from 'sonner'
import type { WeeklySchedule } from '@/lib/zeiterfassung/types'
import { DEFAULT_WEEKLY_SCHEDULE, WEEKDAY_LABELS } from '@/lib/zeiterfassung/types'

const COLORS = ['#22c55e','#3b82f6','#f59e0b','#ef4444','#8b5cf6','#ec4899','#06b6d4','#84cc16']

interface FormState {
  name: string
  pin: string
  color: string
  target_hours_per_month: number
  weekly_schedule: WeeklySchedule
}

const defaultForm: FormState = {
  name: '', pin: '', color: '#22c55e', target_hours_per_month: 160,
  weekly_schedule: { ...DEFAULT_WEEKLY_SCHEDULE },
}

export function MitarbeiterVerwaltung({ hideCreate = false }: { hideCreate?: boolean }) {
  const { employees, loading, createEmployee, updateEmployee, deleteEmployee } = useEmployees()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(defaultForm)
  const [saving, setSaving] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  function openCreate() {
    setEditingId(null)
    setForm(defaultForm)
    setDialogOpen(true)
  }

  function openEdit(emp: typeof employees[number]) {
    setEditingId(emp.id)
    setForm({
      name: emp.name,
      pin: '',
      color: emp.color,
      target_hours_per_month: emp.target_hours_per_month,
      weekly_schedule: emp.weekly_schedule ?? { ...DEFAULT_WEEKLY_SCHEDULE },
    })
    setDialogOpen(true)
  }

  async function handleSave() {
    if (!form.name.trim()) return
    if (!editingId && form.pin.length < 4) {
      toast.error('PIN muss mindestens 4 Ziffern haben')
      return
    }
    setSaving(true)
    try {
      if (editingId) {
        const data: Parameters<typeof updateEmployee>[1] = {
          name: form.name,
          color: form.color,
          target_hours_per_month: form.target_hours_per_month,
          weekly_schedule: form.weekly_schedule,
        }
        if (form.pin.length >= 4) data.pin = form.pin
        await updateEmployee(editingId, data)
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
            <div className="space-y-2">
              <Label>{editingId ? 'Neue PIN (leer lassen = unverändert)' : 'PIN (4–8 Ziffern)'}</Label>
              <Input
                type="password"
                inputMode="numeric"
                value={form.pin}
                onChange={(e) => setForm(f => ({ ...f, pin: e.target.value.replace(/\D/g, '') }))}
                maxLength={8}
                placeholder="••••"
              />
            </div>
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
