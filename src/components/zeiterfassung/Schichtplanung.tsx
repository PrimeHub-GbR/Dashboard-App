'use client'

import { useCallback, useEffect, useState } from 'react'
import { useEmployees } from '@/hooks/useEmployees'
import { MonatsSelector } from './MonatsSelector'
import { MitarbeiterBadge } from './MitarbeiterBadge'
import { currentBerlinYearMonth } from '@/lib/zeiterfassung/timezone'
import type { ShiftPlan } from '@/lib/zeiterfassung/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

interface ShiftWithEmployee extends ShiftPlan {
  employees?: { id: string; name: string; color: string } | null
}

export function Schichtplanung() {
  const now = currentBerlinYearMonth()
  const [year, setYear] = useState(now.year)
  const [month, setMonth] = useState(now.month)
  const [shifts, setShifts] = useState<ShiftWithEmployee[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ employee_id: '', shift_date: '', start_time: '08:00', end_time: '17:00', note: '' })

  const { employees } = useEmployees()

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/zeiterfassung/shifts?year=${year}&month=${month}`)
      const json = await res.json() as { shifts: ShiftWithEmployee[] }
      setShifts(json.shifts ?? [])
    } finally {
      setLoading(false)
    }
  }, [year, month])

  useEffect(() => { load() }, [load])

  async function handleCreate() {
    if (!form.employee_id || !form.shift_date) return
    setSaving(true)
    try {
      const res = await fetch('/api/zeiterfassung/shifts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (!res.ok) {
        const err = await res.json() as { error: string }
        throw new Error(err.error)
      }
      toast.success('Schicht angelegt')
      setDialogOpen(false)
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Fehler beim Anlegen')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    try {
      await fetch(`/api/zeiterfassung/shifts/${id}`, { method: 'DELETE' })
      toast.success('Schicht gelöscht')
      await load()
    } catch {
      toast.error('Löschen fehlgeschlagen')
    }
  }

  // Tage des Monats
  const daysInMonth = new Date(year, month, 0).getDate()
  const days = Array.from({ length: daysInMonth }, (_, i) => {
    const d = i + 1
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    const date = new Date(year, month - 1, d)
    return { day: d, dateStr, weekday: date.toLocaleDateString('de-DE', { weekday: 'short' }) }
  })

  const shiftsByDate = new Map<string, ShiftWithEmployee[]>()
  for (const s of shifts) {
    if (!shiftsByDate.has(s.shift_date)) shiftsByDate.set(s.shift_date, [])
    shiftsByDate.get(s.shift_date)!.push(s)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Schichtplanung</h2>
        <div className="flex items-center gap-3">
          <MonatsSelector year={year} month={month} onChange={(y, m) => { setYear(y); setMonth(m) }} />
          <Button size="sm" onClick={() => setDialogOpen(true)} className="gap-2">
            <Plus className="w-4 h-4" />
            Schicht
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
        </div>
      ) : (
        <div className="space-y-1">
          {days.map(({ day, dateStr, weekday }) => {
            const dayShifts = shiftsByDate.get(dateStr) ?? []
            const isWeekend = weekday === 'Sa' || weekday === 'So'
            return (
              <div
                key={dateStr}
                className={`flex items-start gap-3 p-3 rounded-lg ${
                  isWeekend ? 'bg-muted/30' : ''
                }`}
              >
                <div className="w-16 shrink-0">
                  <span className="text-sm font-medium">{weekday}</span>
                  <span className="text-sm text-muted-foreground ml-1">{day}.</span>
                </div>
                <div className="flex flex-wrap gap-2 flex-1 min-h-[24px]">
                  {dayShifts.map((s) => {
                    const emp = s.employees
                    return (
                      <div
                        key={s.id}
                        className="flex items-center gap-2 px-3 py-1 rounded-full text-xs border"
                        style={{ borderColor: emp?.color ?? '#22c55e', backgroundColor: `${emp?.color ?? '#22c55e'}15` }}
                      >
                        {emp && <MitarbeiterBadge name={emp.name} color={emp.color} size="sm" />}
                        <span className="text-muted-foreground">{s.start_time}–{s.end_time}</span>
                        <button onClick={() => handleDelete(s.id)} className="text-muted-foreground hover:text-destructive ml-1">
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Schicht anlegen</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Mitarbeiter</Label>
              <Select value={form.employee_id} onValueChange={(v) => setForm(f => ({ ...f, employee_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Auswählen…" /></SelectTrigger>
                <SelectContent>
                  {employees.filter(e => e.is_active).map((e) => (
                    <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Datum</Label>
              <Input
                type="date"
                value={form.shift_date}
                onChange={(e) => setForm(f => ({ ...f, shift_date: e.target.value }))}
                min={`${year}-${String(month).padStart(2, '0')}-01`}
                max={`${year}-${String(month).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Von</Label>
                <Input type="time" value={form.start_time} onChange={(e) => setForm(f => ({ ...f, start_time: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Bis</Label>
                <Input type="time" value={form.end_time} onChange={(e) => setForm(f => ({ ...f, end_time: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Notiz (optional)</Label>
              <Input value={form.note} onChange={(e) => setForm(f => ({ ...f, note: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Abbrechen</Button>
            <Button onClick={handleCreate} disabled={saving || !form.employee_id || !form.shift_date}>
              {saving ? 'Speichert…' : 'Anlegen'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
