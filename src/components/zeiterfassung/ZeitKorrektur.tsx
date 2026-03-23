'use client'

import { useCallback, useEffect, useState } from 'react'
import { useEmployees } from '@/hooks/useEmployees'
import { MonatsSelector } from './MonatsSelector'
import { MitarbeiterBadge } from './MitarbeiterBadge'
import { formatDateTimeBerlin, formatDuration, currentBerlinYearMonth } from '@/lib/zeiterfassung/timezone'
import type { TimeEntry } from '@/lib/zeiterfassung/types'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Pencil } from 'lucide-react'
import { toast } from 'sonner'

interface EntryWithEmployee extends TimeEntry {
  employees?: { id: string; name: string; color: string } | null
}

export function ZeitKorrektur() {
  const now = currentBerlinYearMonth()
  const [year, setYear] = useState(now.year)
  const [month, setMonth] = useState(now.month)
  const [employeeFilter, setEmployeeFilter] = useState<string>('all')
  const [entries, setEntries] = useState<EntryWithEmployee[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [editingEntry, setEditingEntry] = useState<EntryWithEmployee | null>(null)
  const [saving, setSaving] = useState(false)
  const [editForm, setEditForm] = useState({ checked_in_at: '', checked_out_at: '', break_minutes: 0, note: '' })

  const { employees } = useEmployees()
  const PAGE_SIZE = 50

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        year: String(year),
        month: String(month),
        page: String(page),
        page_size: String(PAGE_SIZE),
      })
      if (employeeFilter !== 'all') params.set('employee_id', employeeFilter)

      const res = await fetch(`/api/zeiterfassung/entries?${params}`)
      const json = await res.json() as { entries: EntryWithEmployee[]; total: number }
      setEntries(json.entries ?? [])
      setTotal(json.total ?? 0)
    } finally {
      setLoading(false)
    }
  }, [year, month, employeeFilter, page])

  useEffect(() => { load() }, [load])

  function openEdit(entry: EntryWithEmployee) {
    setEditingEntry(entry)
    setEditForm({
      checked_in_at: entry.checked_in_at.slice(0, 16),
      checked_out_at: entry.checked_out_at?.slice(0, 16) ?? '',
      break_minutes: entry.break_minutes,
      note: entry.note ?? '',
    })
  }

  async function handleSave() {
    if (!editingEntry) return
    setSaving(true)
    try {
      const body: Record<string, unknown> = {
        break_minutes: editForm.break_minutes,
        note: editForm.note || null,
      }
      if (editForm.checked_in_at) body.checked_in_at = new Date(editForm.checked_in_at).toISOString()
      if (editForm.checked_out_at) body.checked_out_at = new Date(editForm.checked_out_at).toISOString()
      else body.checked_out_at = null

      const res = await fetch(`/api/zeiterfassung/entries/${editingEntry.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error('Fehler')
      toast.success('Zeiteintrag korrigiert')
      setEditingEntry(null)
      await load()
    } catch {
      toast.error('Korrektur fehlgeschlagen')
    } finally {
      setSaving(false)
    }
  }

  const totalPages = Math.ceil(total / PAGE_SIZE)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 justify-between">
        <h2 className="text-lg font-semibold">Zeitkorrektur</h2>
        <div className="flex items-center gap-3">
          <Select value={employeeFilter} onValueChange={(v) => { setEmployeeFilter(v); setPage(1) }}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Alle Mitarbeiter" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle Mitarbeiter</SelectItem>
              {employees.map((e) => (
                <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <MonatsSelector year={year} month={month} onChange={(y, m) => { setYear(y); setMonth(m); setPage(1) }} />
        </div>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Mitarbeiter</TableHead>
              <TableHead>Eingestempelt</TableHead>
              <TableHead>Ausgestempelt</TableHead>
              <TableHead className="text-right">Pause</TableHead>
              <TableHead>Notiz</TableHead>
              <TableHead>Status</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 7 }).map((_, j) => (
                    <TableCell key={j}><Skeleton className="h-4 w-24" /></TableCell>
                  ))}
                </TableRow>
              ))
            ) : entries.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                  Keine Einträge gefunden.
                </TableCell>
              </TableRow>
            ) : (
              entries.map((e) => {
                const emp = e.employees
                const grossMinutes = e.checked_out_at
                  ? Math.floor((new Date(e.checked_out_at).getTime() - new Date(e.checked_in_at).getTime()) / 60_000)
                  : null
                return (
                  <TableRow key={e.id}>
                    <TableCell>
                      {emp ? <MitarbeiterBadge name={emp.name} color={emp.color} size="sm" /> : '—'}
                    </TableCell>
                    <TableCell className="text-sm">{formatDateTimeBerlin(e.checked_in_at)}</TableCell>
                    <TableCell className="text-sm">
                      {e.checked_out_at ? formatDateTimeBerlin(e.checked_out_at) : (
                        <Badge variant="secondary">Offen</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right text-sm">
                      {e.break_minutes > 0 ? `${e.break_minutes} Min.` : '—'}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-[120px] truncate">
                      {e.note ?? '—'}
                    </TableCell>
                    <TableCell>
                      {e.corrected_at ? (
                        <Badge variant="outline" className="text-xs">Korrigiert</Badge>
                      ) : grossMinutes !== null && grossMinutes > 0 ? (
                        <span className="text-xs text-muted-foreground">{formatDuration(grossMinutes)}</span>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" onClick={() => openEdit(e)}>
                        <Pencil className="w-4 h-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>{total} Einträge</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Zurück</Button>
            <span className="flex items-center px-2">{page} / {totalPages}</span>
            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Weiter</Button>
          </div>
        </div>
      )}

      {/* Edit Dialog */}
      <Dialog open={!!editingEntry} onOpenChange={() => setEditingEntry(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Zeiteintrag korrigieren</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Eingestempelt</Label>
              <Input
                type="datetime-local"
                value={editForm.checked_in_at}
                onChange={(e) => setEditForm(f => ({ ...f, checked_in_at: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Ausgestempelt</Label>
              <Input
                type="datetime-local"
                value={editForm.checked_out_at}
                onChange={(e) => setEditForm(f => ({ ...f, checked_out_at: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Pause (Minuten)</Label>
              <Input
                type="number"
                value={editForm.break_minutes}
                onChange={(e) => setEditForm(f => ({ ...f, break_minutes: Number(e.target.value) }))}
                min={0}
              />
            </div>
            <div className="space-y-2">
              <Label>Notiz (optional)</Label>
              <Input
                value={editForm.note}
                onChange={(e) => setEditForm(f => ({ ...f, note: e.target.value }))}
                placeholder="Grund der Korrektur"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingEntry(null)}>Abbrechen</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Speichert…' : 'Speichern'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
