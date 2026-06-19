'use client'

import { useEffect, useMemo, useState } from 'react'
import { Printer, FolderArchive, Loader2, Clock, FileText, Fingerprint, Hand } from 'lucide-react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'

// ---------------------------------------------------------------------------
// Typen (spiegeln die RPCs aus Migrationen 112–114 + 121)
// ---------------------------------------------------------------------------
interface ArchiveEmployee {
  employee_id: string
  employee_name: string
  employee_color: string
  emp_position: string
  is_active: boolean
  entry_date: string | null
  first_entry: string | null
}
interface Summary {
  employee_name: string
  employee_color: string
  worked_days: number
  net_minutes: number
  pauschal_minutes: number
  vacation_days: number
  sick_days: number
  unpaid_days: number
}
interface MonthRow {
  month_start: string
  net_minutes: number
  worked_days: number
  vacation_days: number
  sick_days: number
  unpaid_days: number
}
interface DayRow {
  work_day: string
  first_in: string | null
  last_out: string | null
  gross_minutes: number
  break_minutes: number
  net_minutes: number
  pauschal_minutes: number
  entry_count: number
}
// Einzel-Stempelung (read-only) — get_employee_archive_entries (Mig 121).
interface EntryRow {
  entry_id: string
  work_day: string
  checked_in_at: string
  checked_out_at: string | null
  break_minutes: number
  gross_minutes: number
  net_minutes: number
  source: 'kiosk' | 'manual'
  corrected: boolean
  note: string | null
}

interface Period {
  key: string
  from: string
  to: string
  label: string
}

// Erster Monatsreport ueberhaupt: Juni 2026.
const FIRST_REPORT_MONTH = { year: 2026, month: 6 } as const

const MONTHS_DE = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember']
const MONTHS_SHORT = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez']

function fmtHours(min: number): string {
  const sign = min < 0 ? '-' : ''
  const a = Math.abs(min)
  return `${sign}${Math.floor(a / 60)}:${String(a % 60).padStart(2, '0')} h`
}

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * Abgeschlossene Monate ab Juni 2026 (neuester zuerst). Ein Monat erscheint,
 * sobald er vorbei ist (letzter Tag liegt vor heute).
 */
function completedMonths(): Period[] {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const out: Period[] = []
  let y = FIRST_REPORT_MONTH.year
  let m = FIRST_REPORT_MONTH.month - 1 // 0-basiert
  for (;;) {
    const from = new Date(y, m, 1)
    const to = new Date(y, m + 1, 0)
    if (to >= today) break
    out.push({
      key: `${y}-M${m + 1}`,
      from: ymd(from),
      to: ymd(to),
      label: `${MONTHS_DE[m]} ${y}`,
    })
    m++
    if (m > 11) {
      m = 0
      y++
    }
  }
  out.sort((a, b) => (a.key < b.key ? 1 : -1))
  return out
}

/** Abgeschlossene Halbjahre zwischen earliest und heute (neuestes zuerst). */
function completedHalfYears(earliest: Date | null): Period[] {
  const now = new Date()
  const start = earliest ?? new Date(now.getFullYear(), 0, 1)
  const out: Period[] = []
  for (let y = start.getFullYear(); y <= now.getFullYear(); y++) {
    for (const h of [1, 2] as const) {
      const to = h === 1 ? new Date(y, 5, 30) : new Date(y, 11, 31)
      const from = h === 1 ? new Date(y, 0, 1) : new Date(y, 6, 1)
      if (to < now && to >= start) {
        out.push({
          key: `${y}-H${h}`,
          from: ymd(from),
          to: ymd(to),
          label: h === 1 ? `1. Halbjahr ${y} (Jan–Jun)` : `2. Halbjahr ${y} (Jul–Dez)`,
        })
      }
    }
  }
  out.sort((a, b) => (a.key < b.key ? 1 : -1))
  return out
}

function hhmm(iso: string | null): string {
  if (!iso) return '—'
  return new Intl.DateTimeFormat('de-DE', {
    timeZone: 'Europe/Berlin',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso))
}

function dayLabel(d: string): string {
  return new Intl.DateTimeFormat('de-DE', {
    timeZone: 'Europe/Berlin',
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
  }).format(new Date(`${d}T12:00:00`))
}

function dayLabelLong(d: string): string {
  return new Intl.DateTimeFormat('de-DE', {
    timeZone: 'Europe/Berlin',
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(`${d}T12:00:00`))
}

export function ZeiterfassungArchiv() {
  const [employees, setEmployees] = useState<ArchiveEmployee[]>([])
  const [loadingList, setLoadingList] = useState(true)
  const [empId, setEmpId] = useState<string>('')
  const [monthKey, setMonthKey] = useState<string>('')

  const [entries, setEntries] = useState<EntryRow[] | null>(null)
  const [loadingEntries, setLoadingEntries] = useState(false)

  // Report (PDF/Druck) — separat, fuer den aktuell gewaehlten Zeitraum.
  const [report, setReport] = useState<{ summary: Summary | null; monthly: MonthRow[]; days: DayRow[] } | null>(null)
  const [reportPeriod, setReportPeriod] = useState<Period | null>(null)
  const [loadingReport, setLoadingReport] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const months = useMemo(() => completedMonths(), [])

  // Mitarbeiterliste laden
  useEffect(() => {
    let active = true
    ;(async () => {
      try {
        const res = await fetch('/api/zeiterfassung/archiv?mode=list')
        const json = await res.json()
        if (!res.ok) throw new Error(json.error ?? 'Fehler')
        if (active) setEmployees(json.employees ?? [])
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : 'Fehler')
      } finally {
        if (active) setLoadingList(false)
      }
    })()
    return () => {
      active = false
    }
  }, [])

  const selectedEmp = employees.find((e) => e.employee_id === empId)

  const halfYears = useMemo(() => {
    if (!selectedEmp) return []
    const dates = [selectedEmp.entry_date, selectedEmp.first_entry]
      .filter(Boolean)
      .map((s) => new Date(s as string))
    const earliest = dates.length ? new Date(Math.min(...dates.map((d) => d.getTime()))) : null
    return completedHalfYears(earliest)
  }, [selectedEmp])

  const selectedMonth = months.find((m) => m.key === monthKey) ?? months[0] ?? null

  // Standard-Monat setzen, sobald Mitarbeiter gewaehlt ist
  useEffect(() => {
    setReport(null)
    setReportPeriod(null)
    setMonthKey(months[0]?.key ?? '')
  }, [empId, months])

  // Stempelzeiten des gewaehlten Monats laden (Hauptansicht)
  useEffect(() => {
    if (!empId || !selectedMonth) {
      setEntries(null)
      return
    }
    let active = true
    setLoadingEntries(true)
    setError(null)
    ;(async () => {
      try {
        const params = new URLSearchParams({
          mode: 'entries',
          employee_id: empId,
          from: selectedMonth.from,
          to: selectedMonth.to,
        })
        const res = await fetch(`/api/zeiterfassung/archiv?${params}`)
        const json = await res.json()
        if (!res.ok) throw new Error(json.error ?? 'Fehler')
        if (active) setEntries(json.entries ?? [])
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : 'Fehler')
      } finally {
        if (active) setLoadingEntries(false)
      }
    })()
    return () => {
      active = false
    }
  }, [empId, selectedMonth])

  // Report fuer einen Zeitraum laden + Druckdialog oeffnen
  async function generateReport(period: Period) {
    if (!empId) return
    setLoadingReport(true)
    setReportPeriod(period)
    setError(null)
    try {
      const params = new URLSearchParams({
        mode: 'report',
        employee_id: empId,
        from: period.from,
        to: period.to,
      })
      const res = await fetch(`/api/zeiterfassung/archiv?${params}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Fehler')
      if (!json.summary) {
        setError(`Keine Daten für ${period.label}.`)
        setReport(null)
        return
      }
      setReport(json)
      // kurze Verzoegerung, damit der Report gerendert ist, bevor gedruckt wird
      setTimeout(() => window.print(), 350)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Fehler')
      setReport(null)
    } finally {
      setLoadingReport(false)
    }
  }

  const chartData = (report?.monthly ?? []).map((m) => ({
    label: MONTHS_SHORT[new Date(`${m.month_start}T12:00:00`).getMonth()],
    hours: Math.round((m.net_minutes / 60) * 10) / 10,
  }))

  return (
    <div className="space-y-6">
      {/* Auswahl-Leiste (wird im Druck ausgeblendet) */}
      <Card className="print:hidden">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FolderArchive className="h-5 w-5" />
            Archiv — Stempelzeiten ansehen
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loadingList ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Mitarbeiter werden geladen…
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-3">
              <Select value={empId} onValueChange={setEmpId}>
                <SelectTrigger className="w-[260px]">
                  <SelectValue placeholder="Mitarbeiter wählen" />
                </SelectTrigger>
                <SelectContent>
                  {employees.map((e) => (
                    <SelectItem key={e.employee_id} value={e.employee_id}>
                      {e.employee_name}
                      {!e.is_active ? ' (inaktiv)' : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={selectedMonth?.key ?? ''} onValueChange={setMonthKey} disabled={!selectedEmp || months.length === 0}>
                <SelectTrigger className="w-[220px]">
                  <SelectValue placeholder="Monat wählen" />
                </SelectTrigger>
                <SelectContent>
                  {months.map((m) => (
                    <SelectItem key={m.key} value={m.key}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {!loadingList && months.length === 0 && (
            <p className="mt-3 text-sm text-muted-foreground">
              Noch kein abgeschlossener Monat. Das Archiv zeigt Monate ab Juni 2026.
            </p>
          )}
          {error && <p className="mt-3 text-sm text-destructive">Fehler: {error}</p>}
        </CardContent>
      </Card>

      {/* HAUPTANSICHT: Stempelzeiten des gewaehlten Monats (read-only) */}
      {empId && selectedMonth && (
        <Card className="print:hidden">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Clock className="h-5 w-5" />
              Stempelzeiten · {selectedMonth.label}
              <Badge variant="outline" className="ml-1">nur Ansicht</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loadingEntries ? (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Stempelzeiten werden geladen…
              </div>
            ) : (
              <StampTimesView entries={entries ?? []} />
            )}
          </CardContent>
        </Card>
      )}

      {/* SEKUNDAER: Berichte (PDF) */}
      {empId && (
        <Card className="print:hidden bg-muted/30">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <FileText className="h-4 w-4" />
              Berichte (PDF)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Button
                variant="outline"
                size="sm"
                disabled={!selectedMonth || loadingReport}
                onClick={() => selectedMonth && generateReport(selectedMonth)}
              >
                {loadingReport ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Printer className="mr-2 h-4 w-4" />
                )}
                Monatsreport · {selectedMonth?.label ?? '—'}
              </Button>
            </div>
            {halfYears.length > 0 && (
              <div>
                <p className="mb-2 text-xs text-muted-foreground">Halbjahresreport</p>
                <div className="flex flex-wrap gap-2">
                  {halfYears.map((h) => (
                    <Button
                      key={h.key}
                      variant="outline"
                      size="sm"
                      disabled={loadingReport}
                      onClick={() => generateReport(h)}
                    >
                      <Printer className="mr-2 h-4 w-4" />
                      {h.label.replace(/ \(.*\)$/, '')}
                    </Button>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Druckbarer Report — nur im Druck sichtbar bzw. nach Generierung */}
      {report?.summary && reportPeriod && (
        <ReportView summary={report.summary} chartData={chartData} days={report.days} period={reportPeriod} />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Read-only Stempelzeiten-Ansicht (Hauptfunktion)
// ---------------------------------------------------------------------------
function StampTimesView({ entries }: { entries: EntryRow[] }) {
  if (entries.length === 0) {
    return <p className="text-sm text-muted-foreground">Keine Stempelzeiten in diesem Monat.</p>
  }
  const totalNet = entries.reduce((s, e) => s + e.net_minutes, 0)
  // nach Tag gruppieren
  const byDay = new Map<string, EntryRow[]>()
  for (const e of entries) {
    const arr = byDay.get(e.work_day) ?? []
    arr.push(e)
    byDay.set(e.work_day, arr)
  }
  const days = Array.from(byDay.keys()).sort()

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">
          {days.length} Tage · {entries.length} Buchungen
        </span>
        <span className="font-semibold text-emerald-600">Netto gesamt: {fmtHours(totalNet)}</span>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Tag</TableHead>
            <TableHead className="text-center">Von</TableHead>
            <TableHead className="text-center">Bis</TableHead>
            <TableHead className="text-right">Brutto</TableHead>
            <TableHead className="text-right">Pause</TableHead>
            <TableHead className="text-right">Netto</TableHead>
            <TableHead className="text-center">Quelle</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {days.map((day) => {
            const rows = byDay.get(day)!
            return rows.map((e, i) => (
              <TableRow key={e.entry_id}>
                <TableCell className="whitespace-nowrap">{i === 0 ? dayLabel(day) : ''}</TableCell>
                <TableCell className="text-center tabular-nums">{hhmm(e.checked_in_at)}</TableCell>
                <TableCell className="text-center tabular-nums">
                  {e.checked_out_at ? hhmm(e.checked_out_at) : <span className="text-muted-foreground">offen</span>}
                </TableCell>
                <TableCell className="text-right tabular-nums">{fmtHours(e.gross_minutes)}</TableCell>
                <TableCell className="text-right tabular-nums">{e.break_minutes}m</TableCell>
                <TableCell className="text-right font-medium tabular-nums">{fmtHours(e.net_minutes)}</TableCell>
                <TableCell className="text-center">
                  <SourceBadge source={e.source} corrected={e.corrected} />
                </TableCell>
              </TableRow>
            ))
          })}
        </TableBody>
      </Table>
    </div>
  )
}

function SourceBadge({ source, corrected }: { source: 'kiosk' | 'manual'; corrected: boolean }) {
  if (source === 'manual') {
    return (
      <Badge variant="outline" className="border-purple-500/40 text-purple-600">
        <Hand className="mr-1 h-3 w-3" /> manuell
      </Badge>
    )
  }
  return (
    <Badge variant="outline" className="border-emerald-500/40 text-emerald-600">
      <Fingerprint className="mr-1 h-3 w-3" /> Kiosk{corrected ? ' · korr.' : ''}
    </Badge>
  )
}

// ---------------------------------------------------------------------------
// Druckbarer Report (Monat ODER Halbjahr)
// ---------------------------------------------------------------------------
function ReportView({
  summary,
  chartData,
  days,
  period,
}: {
  summary: Summary
  chartData: { label: string; hours: number }[]
  days: DayRow[]
  period: Period
}) {
  const totalNet = days.reduce((s, d) => s + d.net_minutes, 0)
  return (
    <div id="archiv-report" className="hidden space-y-6 print:block">
      {/* Kopf */}
      <div className="flex items-end justify-between border-b-2 border-emerald-500 pb-3">
        <div>
          <h2 className="text-2xl font-bold">{summary.employee_name}</h2>
          <p className="text-muted-foreground">{period.label}</p>
        </div>
        <div className="text-right">
          <div className="font-bold text-emerald-600">PrimeHub</div>
          <div className="text-xs text-muted-foreground">
            Zeit-Auswertung · erstellt {new Intl.DateTimeFormat('de-DE').format(new Date())}
          </div>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Kpi label="Netto-Stunden" value={fmtHours(summary.net_minutes)} tone="emerald" />
        <Kpi label="Arbeitstage" value={String(summary.worked_days)} tone="blue" />
        <Kpi label="Urlaubstage" value={String(summary.vacation_days)} tone="emerald" />
        <Kpi label="Kranktage" value={String(summary.sick_days)} tone="amber" />
        <Kpi label="Unbezahlt" value={String(summary.unpaid_days)} tone="red" />
      </div>

      {/* Diagramme */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Arbeitsstunden pro Monat (netto)</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={chartData} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="label" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis fontSize={12} tickLine={false} axisLine={false} />
                <Tooltip formatter={(v: number) => [`${v} h`, 'Stunden']} />
                <Bar dataKey="hours" radius={[4, 4, 0, 0]} fill="#22C55E" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Abwesenheiten (Tage)</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart
                data={[
                  { label: 'Urlaub', value: summary.vacation_days, color: '#22C55E' },
                  { label: 'Krank', value: summary.sick_days, color: '#F59E0B' },
                  { label: 'Unbezahlt', value: summary.unpaid_days, color: '#EF4444' },
                ]}
                margin={{ top: 8, right: 8, left: -16, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="label" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis fontSize={12} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip formatter={(v: number) => [`${v} Tage`, '']} />
                <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                  {[0, 1, 2].map((i) => (
                    <Cell key={i} fill={['#22C55E', '#F59E0B', '#EF4444'][i]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Tages-Detail */}
      <Card className="break-before-page">
        <CardHeader>
          <CardTitle className="text-sm">
            Tages-Detail
            <Badge variant="secondary" className="ml-2">
              {days.length} Tage
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {days.length === 0 ? (
            <p className="text-sm text-muted-foreground">Keine Buchungen in diesem Zeitraum.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tag</TableHead>
                  <TableHead className="text-center">Von</TableHead>
                  <TableHead className="text-center">Bis</TableHead>
                  <TableHead className="text-right">Brutto</TableHead>
                  <TableHead className="text-right">Pause</TableHead>
                  <TableHead className="text-right">Pauschal</TableHead>
                  <TableHead className="text-right">Netto</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {days.map((d) => (
                  <TableRow key={d.work_day}>
                    <TableCell>{dayLabelLong(d.work_day)}</TableCell>
                    <TableCell className="text-center">{hhmm(d.first_in)}</TableCell>
                    <TableCell className="text-center">{hhmm(d.last_out)}</TableCell>
                    <TableCell className="text-right">{fmtHours(d.gross_minutes)}</TableCell>
                    <TableCell className="text-right">{d.break_minutes}m</TableCell>
                    <TableCell className="text-right">
                      {d.pauschal_minutes === 0 ? '—' : fmtHours(d.pauschal_minutes)}
                    </TableCell>
                    <TableCell className="text-right font-medium">{fmtHours(d.net_minutes)}</TableCell>
                  </TableRow>
                ))}
                <TableRow className="border-t-2 font-semibold">
                  <TableCell>Summe</TableCell>
                  <TableCell colSpan={5} />
                  <TableCell className="text-right text-emerald-600">{fmtHours(totalNet)}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        Netto-Stunden nach ArbZG (Pflichtpausen abgezogen) inkl. genehmigter Pauschalen. Abwesenheiten =
        genehmigte Anträge, gezählt als Arbeitstage laut Wochenplan. „Geplant, aber nicht erschienen" ist nicht
        enthalten.
      </p>
    </div>
  )
}

const TONES: Record<string, string> = {
  emerald: 'border-emerald-500/30 bg-emerald-500/5 text-emerald-600',
  blue: 'border-blue-500/30 bg-blue-500/5 text-blue-600',
  amber: 'border-amber-500/30 bg-amber-500/5 text-amber-600',
  red: 'border-red-500/30 bg-red-500/5 text-red-600',
}

function Kpi({ label, value, tone }: { label: string; value: string; tone: keyof typeof TONES }) {
  return (
    <div className={`rounded-lg border p-3 text-center ${TONES[tone]}`}>
      <div className="text-xl font-bold">{value}</div>
      <div className="mt-1 text-xs text-muted-foreground">{label}</div>
    </div>
  )
}
