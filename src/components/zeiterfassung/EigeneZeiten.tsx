'use client'

import { useCallback, useEffect, useState } from 'react'
import { MonatsSelector } from './MonatsSelector'
import { formatDateTimeBerlin, formatDuration, currentBerlinYearMonth } from '@/lib/zeiterfassung/timezone'
import type { TimeEntry } from '@/lib/zeiterfassung/types'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'

interface Props {
  employeeId?: string
}

export function EigeneZeiten({ employeeId }: Props) {
  const now = currentBerlinYearMonth()
  const [year, setYear] = useState(now.year)
  const [month, setMonth] = useState(now.month)
  const [entries, setEntries] = useState<TimeEntry[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        year: String(year),
        month: String(month),
        page: String(page),
        page_size: '50',
      })
      if (employeeId) params.set('employee_id', employeeId)

      const res = await fetch(`/api/zeiterfassung/entries?${params}`)
      const json = await res.json() as { entries: TimeEntry[]; total: number }
      setEntries(json.entries ?? [])
      setTotal(json.total ?? 0)
    } finally {
      setLoading(false)
    }
  }, [year, month, page, employeeId])

  useEffect(() => { load() }, [load])

  const totalNetMinutes = entries
    .filter(e => e.checked_out_at)
    .reduce((sum, e) => {
      const gross = Math.floor(
        (new Date(e.checked_out_at!).getTime() - new Date(e.checked_in_at).getTime()) / 60_000
      )
      return sum + Math.max(0, gross - e.break_minutes)
    }, 0)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Meine Zeiten</h2>
          {!loading && entries.length > 0 && (
            <p className="text-sm text-muted-foreground">
              Netto-Arbeitszeit: <span className="font-medium text-foreground">{formatDuration(totalNetMinutes)}</span>
            </p>
          )}
        </div>
        <MonatsSelector year={year} month={month} onChange={(y, m) => { setYear(y); setMonth(m); setPage(1) }} />
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Eingestempelt</TableHead>
              <TableHead>Ausgestempelt</TableHead>
              <TableHead className="text-right">Pause</TableHead>
              <TableHead className="text-right">Netto</TableHead>
              <TableHead>Notiz</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 5 }).map((_, j) => (
                    <TableCell key={j}><Skeleton className="h-4 w-24" /></TableCell>
                  ))}
                </TableRow>
              ))
            ) : entries.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                  Keine Einträge in diesem Monat.
                </TableCell>
              </TableRow>
            ) : (
              entries.map((e) => {
                const gross = e.checked_out_at
                  ? Math.floor((new Date(e.checked_out_at).getTime() - new Date(e.checked_in_at).getTime()) / 60_000)
                  : null
                const net = gross !== null ? Math.max(0, gross - e.break_minutes) : null
                return (
                  <TableRow key={e.id}>
                    <TableCell className="text-sm">{formatDateTimeBerlin(e.checked_in_at)}</TableCell>
                    <TableCell className="text-sm">
                      {e.checked_out_at ? formatDateTimeBerlin(e.checked_out_at) : (
                        <Badge variant="secondary">Offen</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right text-sm">
                      {e.break_minutes > 0 ? `${e.break_minutes} Min.` : '—'}
                    </TableCell>
                    <TableCell className="text-right text-sm font-medium">
                      {net !== null ? formatDuration(net) : '—'}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {e.note ?? '—'}
                    </TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
      </div>

      {Math.ceil(total / 50) > 1 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>{total} Einträge</span>
          <div className="flex gap-2">
            <button
              disabled={page <= 1}
              onClick={() => setPage(p => p - 1)}
              className="px-2 py-1 rounded border disabled:opacity-40"
            >
              Zurück
            </button>
            <span className="px-2">{page} / {Math.ceil(total / 50)}</span>
            <button
              disabled={page >= Math.ceil(total / 50)}
              onClick={() => setPage(p => p + 1)}
              className="px-2 py-1 rounded border disabled:opacity-40"
            >
              Weiter
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
