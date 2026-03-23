'use client'

import { useState } from 'react'
import { useMonthStats } from '@/hooks/useMonthStats'
import { MonatsSelector } from './MonatsSelector'
import { MitarbeiterBadge } from './MitarbeiterBadge'
import { formatDuration, currentBerlinYearMonth } from '@/lib/zeiterfassung/timezone'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { TrendingUp, TrendingDown, Minus } from 'lucide-react'

export function StundenUebersicht() {
  const now = currentBerlinYearMonth()
  const [year, setYear] = useState(now.year)
  const [month, setMonth] = useState(now.month)
  const { stats, loading } = useMonthStats(year, month)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Stundenauswertung</h2>
        <MonatsSelector year={year} month={month} onChange={(y, m) => { setYear(y); setMonth(m) }} />
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Mitarbeiter</TableHead>
              <TableHead className="text-right">Brutto</TableHead>
              <TableHead className="text-right">Pause</TableHead>
              <TableHead className="text-right">Netto</TableHead>
              <TableHead className="text-right">Soll</TableHead>
              <TableHead className="text-right">Differenz</TableHead>
              <TableHead className="text-right">Buchungen</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 7 }).map((_, j) => (
                    <TableCell key={j}><Skeleton className="h-4 w-20" /></TableCell>
                  ))}
                </TableRow>
              ))
            ) : stats.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                  Keine Daten für diesen Monat.
                </TableCell>
              </TableRow>
            ) : (
              stats.map((s) => {
                const overtimeSign = s.overtime_minutes > 0 ? 1 : s.overtime_minutes < 0 ? -1 : 0
                return (
                  <TableRow key={s.employee_id}>
                    <TableCell>
                      <MitarbeiterBadge name={s.employee_name} color={s.employee_color} />
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {formatDuration(s.total_work_minutes)}
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {s.total_break_minutes > 0 ? formatDuration(s.total_break_minutes) : '—'}
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {formatDuration(s.net_work_minutes)}
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {formatDuration(s.target_minutes)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Badge
                        variant={overtimeSign > 0 ? 'default' : overtimeSign < 0 ? 'destructive' : 'secondary'}
                        className="gap-1"
                      >
                        {overtimeSign > 0 && <TrendingUp className="w-3 h-3" />}
                        {overtimeSign < 0 && <TrendingDown className="w-3 h-3" />}
                        {overtimeSign === 0 && <Minus className="w-3 h-3" />}
                        {overtimeSign >= 0 ? '+' : ''}{formatDuration(Math.abs(s.overtime_minutes))}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {s.entry_count}
                    </TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
