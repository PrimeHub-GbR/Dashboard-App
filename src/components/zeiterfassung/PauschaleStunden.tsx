'use client'

import { useCallback, useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Check, X, Hourglass, CheckCircle2, XCircle } from 'lucide-react'

interface Employee { id: string; name: string }

interface PauschalEntry {
  id: string
  employee_id: string
  employee_name: string
  minutes: number
  datum: string
  grund: string
  status: 'pending' | 'approved' | 'rejected'
  required_count: number
  approved_count: number
  created_by_name: string | null
  created_at: string
}

interface PendingEntry extends Omit<PauschalEntry, 'employee_id'> {
  entry_id: string
  employee_color: string
  decided: boolean
  decided_at: string | null
}

function fmt(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${h}h ${String(m).padStart(2, '0')}m`
}

function todayYmd(): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Berlin' }).format(new Date())
}

export function PauschaleStunden() {
  const [employees, setEmployees] = useState<Employee[]>([])
  const [entries, setEntries] = useState<PauschalEntry[]>([])
  const [pending, setPending] = useState<PendingEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [isGF, setIsGF] = useState(false)

  // Formular — Dauer minutengenau (Stunden + Minuten getrennt)
  const [employeeId, setEmployeeId] = useState('')
  const [hoursStr, setHoursStr] = useState('1')
  const [minutesStr, setMinutesStr] = useState('0')
  const [datum, setDatum] = useState(todayYmd())
  const [grund, setGrund] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [empRes, listRes, pendRes] = await Promise.all([
        fetch('/api/zeiterfassung/employees'),
        fetch('/api/zeiterfassung/pauschal'),
        fetch('/api/zeiterfassung/pauschal/pending'),
      ])
      if (empRes.ok) {
        const d = await empRes.json() as { employees: Employee[] }
        setEmployees(d.employees)
      }
      if (listRes.ok) {
        const d = await listRes.json() as { entries: PauschalEntry[] }
        setEntries(d.entries)
      }
      if (pendRes.ok) {
        const d = await pendRes.json() as { entries: PendingEntry[] }
        setPending(d.entries)
        setIsGF(true) // RPC liefert nur fuer GF Daten (sonst leer, aber 200)
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const totalMinutes = () => {
    const h = parseInt(hoursStr, 10)
    const m = parseInt(minutesStr, 10)
    return (Number.isNaN(h) ? 0 : h) * 60 + (Number.isNaN(m) ? 0 : m)
  }

  const submit = async () => {
    if (!employeeId) { setError('Bitte Mitarbeiter wählen.'); return }
    const minutes = totalMinutes()
    if (minutes <= 0) { setError('Bitte eine Dauer größer 0 eingeben.'); return }
    if (minutes > 24 * 60) { setError('Maximal 24 Stunden pro Eintrag.'); return }
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch('/api/zeiterfassung/pauschal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employee_id: employeeId, minutes, datum, grund: grund.trim() }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({})) as { error?: unknown }
        throw new Error(typeof d.error === 'string' ? d.error : 'Eintrag fehlgeschlagen')
      }
      setGrund('')
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Fehler')
    } finally {
      setSubmitting(false)
    }
  }

  const decide = async (entryId: string, approve: boolean) => {
    const res = await fetch(`/api/zeiterfassung/pauschal/${entryId}/decide`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ approve }),
    })
    if (res.ok) await load()
  }

  const openPending = pending.filter((p) => !p.decided)

  return (
    <div className="space-y-6">
      {/* Eingabe */}
      <Card>
        <CardHeader>
          <CardTitle>Pauschale Stunden eintragen</CardTitle>
          <CardDescription>
            Unabhängig von Tagen (z. B. Dienstreise). Eingabe minutengenau.
            Wird erst nach Genehmigung durch die Geschäftsführung wirksam.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Mitarbeiter</Label>
              <Select value={employeeId} onValueChange={setEmployeeId}>
                <SelectTrigger><SelectValue placeholder="Mitarbeiter wählen" /></SelectTrigger>
                <SelectContent>
                  {employees.map((e) => (
                    <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Datum</Label>
              <Input type="date" value={datum} onChange={(e) => setDatum(e.target.value)} />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Dauer</Label>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <Input
                  type="number" inputMode="numeric" min={0} max={24}
                  className="w-20 text-right tabular-nums"
                  aria-label="Stunden"
                  value={hoursStr}
                  onChange={(e) => setHoursStr(e.target.value)}
                />
                <span className="text-sm text-muted-foreground">Std.</span>
              </div>
              <div className="flex items-center gap-2">
                <Input
                  type="number" inputMode="numeric" min={0} max={59}
                  className="w-20 text-right tabular-nums"
                  aria-label="Minuten"
                  value={minutesStr}
                  onChange={(e) => setMinutesStr(e.target.value)}
                />
                <span className="text-sm text-muted-foreground">Min.</span>
              </div>
              <span className="text-sm font-medium tabular-nums text-muted-foreground">
                = {fmt(Math.max(0, totalMinutes()))}
              </span>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Grund (optional)</Label>
            <Input value={grund} maxLength={200}
              placeholder="z. B. Dienstreise München"
              onChange={(e) => setGrund(e.target.value)} />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <Button onClick={submit} disabled={submitting}>
            {submitting ? 'Wird eingereicht…' : 'Zur Genehmigung'}
          </Button>
        </CardContent>
      </Card>

      {/* Offene Genehmigungen (nur GF) */}
      {isGF && openPending.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Offene Genehmigungen ({openPending.length})</CardTitle>
            <CardDescription>
              Als Geschäftsführung musst du diese Pauschalstunden bestätigen. Erst wenn alle
              Geschäftsführer zugestimmt haben, werden sie wirksam.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {openPending.map((p) => (
              <div key={p.entry_id}
                className="flex items-center justify-between gap-4 rounded-md border p-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{p.employee_name}</span>
                    <Badge variant="secondary">{fmt(p.minutes)}</Badge>
                    <span className="text-sm text-muted-foreground">
                      {new Date(p.datum).toLocaleDateString('de-DE')}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground truncate">
                    {p.created_by_name ? `Eingetragen von ${p.created_by_name}` : ''}
                    {p.grund ? ` · ${p.grund}` : ''}
                    {` · ${p.approved_count}/${p.required_count} GF`}
                  </p>
                </div>
                <div className="flex gap-2 shrink-0">
                  <Button size="sm" variant="outline" onClick={() => decide(p.entry_id, false)}>
                    <X className="h-4 w-4 mr-1" />Ablehnen
                  </Button>
                  <Button size="sm" onClick={() => decide(p.entry_id, true)}>
                    <Check className="h-4 w-4 mr-1" />Genehmigen
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Alle Eintraege */}
      <Card>
        <CardHeader>
          <CardTitle>Pauschal-Einträge</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Mitarbeiter</TableHead>
                  <TableHead>Datum</TableHead>
                  <TableHead className="text-right">Dauer</TableHead>
                  <TableHead>Grund</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 3 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 5 }).map((_, j) => (
                        <TableCell key={j}><Skeleton className="h-4 w-20" /></TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : entries.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                      Keine Pauschal-Einträge.
                    </TableCell>
                  </TableRow>
                ) : (
                  entries.map((e) => (
                    <TableRow key={e.id}>
                      <TableCell className="font-medium">{e.employee_name}</TableCell>
                      <TableCell>{new Date(e.datum).toLocaleDateString('de-DE')}</TableCell>
                      <TableCell className="text-right">{fmt(e.minutes)}</TableCell>
                      <TableCell className="text-muted-foreground">{e.grund || '—'}</TableCell>
                      <TableCell>
                        {e.status === 'approved' ? (
                          <Badge variant="default" className="gap-1">
                            <CheckCircle2 className="h-3 w-3" />Genehmigt
                          </Badge>
                        ) : e.status === 'rejected' ? (
                          <Badge variant="destructive" className="gap-1">
                            <XCircle className="h-3 w-3" />Abgelehnt
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="gap-1">
                            <Hourglass className="h-3 w-3" />
                            {e.approved_count}/{e.required_count} GF
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
