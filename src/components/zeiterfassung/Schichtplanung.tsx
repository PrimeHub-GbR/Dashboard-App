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
import { Badge } from '@/components/ui/badge'
import { Plus, Trash2, CalendarDays } from 'lucide-react'
import { toast } from 'sonner'

interface ShiftWithEmployee extends ShiftPlan {
  employees?: { id: string; name: string; color: string } | null
}

const WEEKDAY_SHORT = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa']

export function Schichtplanung() {
  const now = currentBerlinYearMonth()
  const [year, setYear] = useState(now.year)
  const [month, setMonth] = useState(now.month)
  const [shifts, setShifts] = useState<ShiftWithEmployee[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [saving, setSaving] = useState(false)

  // Multi-day form
  const [employeeId, setEmployeeId] = useState('')
  const [selectedDays, setSelectedDays] = useState<Set<string>>(new Set())
  const [startTime, setStartTime] = useState('08:00')
  const [endTime, setEndTime] = useState('17:00')
  const [note, setNote] = useState('')

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

  function openDialog() {
    setEmployeeId('')
    setSelectedDays(new Set())
    setStartTime('08:00')
    setEndTime('17:00')
    setNote('')
    setDialogOpen(true)
  }

  function toggleDay(dateStr: string) {
    setSelectedDays(prev => {
      const next = new Set(prev)
      if (next.has(dateStr)) next.delete(dateStr)
      else next.add(dateStr)
      return next
    })
  }

  // Quick-select helpers
  function selectWeekday(wday: number) {
    const days = buildDays()
    setSelectedDays(prev => {
      const next = new Set(prev)
      const dayDates = days.filter(d => new Date(d.dateStr).getDay() === wday).map(d => d.dateStr)
      const allSelected = dayDates.every(d => next.has(d))
      if (allSelected) dayDates.forEach(d => next.delete(d))
      else dayDates.forEach(d => next.add(d))
      return next
    })
  }

  function buildDays() {
    const daysInMonth = new Date(year, month, 0).getDate()
    return Array.from({ length: daysInMonth }, (_, i) => {
      const d = i + 1
      const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`
      const date = new Date(year, month - 1, d)
      return { day: d, dateStr, weekday: WEEKDAY_SHORT[date.getDay()], wdayNum: date.getDay() }
    })
  }

  async function handleCreate() {
    if (!employeeId || selectedDays.size === 0) return
    setSaving(true)
    let successCount = 0
    let skipCount = 0
    const errors: string[] = []

    await Promise.all(
      [...selectedDays].map(async (shift_date) => {
        try {
          const res = await fetch('/api/zeiterfassung/shifts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ employee_id: employeeId, shift_date, start_time: startTime, end_time: endTime, note }),
          })
          if (res.ok) {
            successCount++
          } else {
            const err = await res.json() as { error: string }
            if (typeof err.error === 'string' && err.error.toLowerCase().includes('duplikat')) {
              skipCount++
            } else {
              errors.push(shift_date)
            }
          }
        } catch {
          errors.push(shift_date)
        }
      })
    )

    setSaving(false)
    if (successCount > 0) toast.success(`${successCount} Schicht${successCount > 1 ? 'en' : ''} angelegt`)
    if (skipCount > 0) toast.info(`${skipCount} Tag${skipCount > 1 ? 'e' : ''} bereits vorhanden — übersprungen`)
    if (errors.length > 0) toast.error(`${errors.length} Fehler beim Anlegen`)
    setDialogOpen(false)
    await load()
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

  const days = buildDays()
  const daysInMonth = days.length

  const shiftsByDate = new Map<string, ShiftWithEmployee[]>()
  for (const s of shifts) {
    if (!shiftsByDate.has(s.shift_date)) shiftsByDate.set(s.shift_date, [])
    shiftsByDate.get(s.shift_date)!.push(s)
  }

  const selectedEmp = employees.find(e => e.id === employeeId)

  // Quick-select weekday labels
  const quickDays: { label: string; wday: number }[] = [
    { label: 'Mo', wday: 1 }, { label: 'Di', wday: 2 }, { label: 'Mi', wday: 3 },
    { label: 'Do', wday: 4 }, { label: 'Fr', wday: 5 }, { label: 'Sa', wday: 6 }, { label: 'So', wday: 0 },
  ]

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Schichtplanung</h2>
        <div className="flex items-center gap-3">
          <MonatsSelector year={year} month={month} onChange={(y, m) => { setYear(y); setMonth(m) }} />
          <Button size="sm" onClick={openDialog} className="gap-2">
            <Plus className="w-4 h-4" />
            Schichten
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
                className={`flex items-start gap-3 p-3 rounded-lg ${isWeekend ? 'bg-muted/30' : ''}`}
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

      {/* Multi-Day Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarDays className="w-5 h-5" />
              Schichten anlegen
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-5 py-2">

            {/* Mitarbeiter */}
            <div className="space-y-2">
              <Label>Mitarbeiter</Label>
              <Select value={employeeId} onValueChange={setEmployeeId}>
                <SelectTrigger><SelectValue placeholder="Mitarbeiter auswählen…" /></SelectTrigger>
                <SelectContent>
                  {employees.filter(e => e.is_active).map((e) => (
                    <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Uhrzeit */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Von</Label>
                <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Bis</Label>
                <Input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
              </div>
            </div>

            {/* Tage auswählen */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Tage auswählen</Label>
                {selectedDays.size > 0 && (
                  <Badge variant="secondary" className="text-xs">
                    {selectedDays.size} Tag{selectedDays.size > 1 ? 'e' : ''} gewählt
                  </Badge>
                )}
              </div>

              {/* Schnellauswahl Wochentage */}
              <div className="flex gap-1.5 flex-wrap">
                <span className="text-xs text-muted-foreground self-center mr-1">Alle:</span>
                {quickDays.map(({ label, wday }) => {
                  const dayDates = days.filter(d => d.wdayNum === wday).map(d => d.dateStr)
                  const allSelected = dayDates.length > 0 && dayDates.every(d => selectedDays.has(d))
                  return (
                    <button
                      key={wday}
                      type="button"
                      onClick={() => selectWeekday(wday)}
                      className={`px-2 py-0.5 rounded text-xs font-medium border transition-colors ${
                        allSelected
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'border-border text-muted-foreground hover:border-foreground hover:text-foreground'
                      }`}
                      style={allSelected && selectedEmp ? { backgroundColor: selectedEmp.color, borderColor: selectedEmp.color } : {}}
                    >
                      {label}
                    </button>
                  )
                })}
                <button
                  type="button"
                  onClick={() => setSelectedDays(new Set())}
                  className="px-2 py-0.5 rounded text-xs border border-border text-muted-foreground hover:text-destructive hover:border-destructive transition-colors ml-auto"
                >
                  Alle abwählen
                </button>
              </div>

              {/* Tage-Grid (7 Spalten = Wochenraster) */}
              <div className="grid grid-cols-7 gap-1">
                {/* Header */}
                {['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'].map(h => (
                  <div key={h} className="text-center text-xs text-muted-foreground font-medium py-1">{h}</div>
                ))}
                {/* Leere Zellen vor dem 1. des Monats */}
                {(() => {
                  const firstDayOfMonth = new Date(year, month - 1, 1).getDay()
                  // JS: 0=So,1=Mo...6=Sa → wir wollen Mo=0
                  const offset = (firstDayOfMonth + 6) % 7
                  return Array.from({ length: offset }, (_, i) => <div key={`empty-${i}`} />)
                })()}
                {/* Tage */}
                {days.map(({ day, dateStr, weekday }) => {
                  const isSelected = selectedDays.has(dateStr)
                  const isWeekend = weekday === 'Sa' || weekday === 'So'
                  return (
                    <button
                      key={dateStr}
                      type="button"
                      onClick={() => toggleDay(dateStr)}
                      className={`rounded-lg py-1.5 text-xs font-medium transition-all border ${
                        isSelected
                          ? 'text-white border-transparent scale-105 shadow-sm'
                          : isWeekend
                            ? 'bg-muted/40 border-transparent text-muted-foreground hover:bg-muted'
                            : 'border-transparent hover:bg-muted text-foreground'
                      }`}
                      style={isSelected && selectedEmp
                        ? { backgroundColor: selectedEmp.color, borderColor: selectedEmp.color }
                        : isSelected
                          ? { backgroundColor: '#3b82f6' }
                          : {}}
                    >
                      {day}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Notiz */}
            <div className="space-y-2">
              <Label>Notiz (optional)</Label>
              <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="z.B. Vertretung, Spätschicht…" />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Abbrechen</Button>
            <Button
              onClick={handleCreate}
              disabled={saving || !employeeId || selectedDays.size === 0}
            >
              {saving
                ? 'Speichert…'
                : selectedDays.size === 0
                  ? 'Tage auswählen'
                  : `${selectedDays.size} Schicht${selectedDays.size > 1 ? 'en' : ''} anlegen`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
