'use client'

import { useState, useEffect } from 'react'
import { useZeitDashboard } from '@/hooks/useZeitDashboard'
import { useEmployees } from '@/hooks/useEmployees'
import { MonatsSelector } from './MonatsSelector'
import { MitarbeiterChart } from './MitarbeiterChart'
import { formatDuration, currentBerlinYearMonth } from '@/lib/zeiterfassung/timezone'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Clock, Users, TrendingUp, TrendingDown, Minus, AlertTriangle, LogOut, Calendar, Package } from 'lucide-react'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { MitarbeiterBadge } from './MitarbeiterBadge'
import { useMonthStats } from '@/hooks/useMonthStats'
import {
  BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from 'recharts'

// ─── Typen ────────────────────────────────────────────────────────────────────

interface DailyRow {
  work_date: string
  employee_id: string
  employee_name: string
  employee_color: string
  net_minutes: number
}

interface MonthRow {
  employee_id: string
  employee_name: string
  employee_color: string
  target_hours_per_month: number
  total_work_minutes: number
  total_break_minutes: number
  entry_count: number
}

interface RecentEntry {
  id: string
  checked_in_at: string
  checked_out_at: string | null
  break_minutes: number
  employees: { id: string; name: string; color: string } | null
}

interface LiveEntry {
  id: string
  employee_id: string
  checked_in_at: string
  employees: { id: string; name: string; color: string } | null
}

interface TodayShift {
  id: string
  employee_id: string
  start_time: string
  end_time: string
  employees: { id: string; name: string; color: string } | null
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────

function KpiCard({
  title, value, sub, icon: Icon, trend, trendLabel, iconColor,
}: {
  title: string
  value: string
  sub?: string
  icon: React.ElementType
  trend?: 'up' | 'down' | 'neutral'
  trendLabel?: string
  iconColor?: string
}) {
  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">{title}</p>
            <p className="text-2xl font-bold tracking-tight">{value}</p>
            {trendLabel && (
              <div className="flex items-center gap-1 text-xs">
                {trend === 'up' && <TrendingUp className="w-3 h-3 text-green-500" />}
                {trend === 'down' && <TrendingDown className="w-3 h-3 text-red-500" />}
                {trend === 'neutral' && <Minus className="w-3 h-3 text-muted-foreground" />}
                <span className={
                  trend === 'up' ? 'text-green-500' :
                  trend === 'down' ? 'text-red-500' :
                  'text-muted-foreground'
                }>{trendLabel}</span>
              </div>
            )}
            {sub && !trendLabel && <p className="text-xs text-muted-foreground">{sub}</p>}
          </div>
          <div className="p-2 rounded-lg bg-muted">
            <Icon className={`w-5 h-5 ${iconColor ?? 'text-muted-foreground'}`} />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// ─── Stundenauswertung (inline, synchron mit Dashboard-Monat) ─────────────────

function StundenAuswertungInline({ year, month }: { year: number; month: number }) {
  const { stats, loading } = useMonthStats(year, month)
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Stundenauswertung</CardTitle>
        <CardDescription>Brutto / Netto / Soll / Differenz — {month}/{year}</CardDescription>
      </CardHeader>
      <CardContent>
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
      </CardContent>
    </Card>
  )
}

// ─── Hauptkomponente ──────────────────────────────────────────────────────────

export function ZeitDashboard() {
  const now = currentBerlinYearMonth()
  const [year, setYear] = useState(now.year)
  const [month, setMonth] = useState(now.month)
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(null)
  const [chartPeriod, setChartPeriod] = useState<'7d' | '14d' | 'month'>('month')
  const [deliveries, setDeliveries] = useState<Array<{
    id: string; carrier: string; type: string;
    window_start: string; window_end: string;
    status: 'expected' | 'arrived' | 'missed';
    note?: string;
  }>>([])

  useEffect(() => {
    fetch('/api/zeiterfassung/delivery-announcements')
      .then(r => r.json())
      .then((j: { announcements: typeof deliveries }) => setDeliveries(j.announcements ?? []))
      .catch(() => {})
  }, [])

  const { data, loading } = useZeitDashboard(year, month)
  const { employees: allEmployees } = useEmployees()

  const daily = (data?.daily ?? []) as DailyRow[]
  const monthData = (data?.month ?? []) as MonthRow[]
  const recent = (data?.recent ?? []) as RecentEntry[]
  const liveCount = data?.live_count ?? 0
  const liveEntries = (data?.live ?? []) as LiveEntry[]
  const todayShifts = (data?.today_shifts ?? []) as TodayShift[]
  const hourly = (data?.hourly ?? []) as Array<{ hour: string; raw_hour: number; count: number; planned: number }>

  // KPI-Berechnungen
  const totalNetMinutes = monthData.reduce((s, r) => s + Math.max(0, r.total_work_minutes - r.total_break_minutes), 0)
  const totalTargetMinutes = monthData.reduce((s, r) => s + r.target_hours_per_month * 60, 0)
  const overtimeMinutes = totalNetMinutes - totalTargetMinutes
  const daysWorked = new Set(daily.map(d => d.work_date)).size
  const avgMinutesPerDay = daysWorked > 0 ? Math.round(totalNetMinutes / daysWorked) : 0

  // Mitarbeiter für Switcher (nur solche mit Daten in diesem Monat)
  const monthEmployees = monthData.map(r => ({
    id: r.employee_id,
    name: r.employee_name,
    color: r.employee_color,
  }))

  // Selektierter MA mit weekly_schedule aus useEmployees
  const selectedEmpFull = selectedEmployeeId
    ? allEmployees.find(e => e.id === selectedEmployeeId) ?? null
    : null

  const skel = <Skeleton className="h-full w-full rounded-xl" />

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Übersicht</h2>
          <p className="text-sm text-muted-foreground">Stunden, Gleichmäßigkeit und Teamleistung</p>
        </div>
        <MonatsSelector year={year} month={month} onChange={(y, m) => { setYear(y); setMonth(m) }} />
      </div>

      {/* KPI-Karten */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => <Card key={i}><CardContent className="p-6 h-28">{skel}</CardContent></Card>)
        ) : (
          <>
            <KpiCard
              title="Gesamtstunden (Netto)"
              value={formatDuration(totalNetMinutes)}
              icon={Clock}
              iconColor="text-green-500"
              trend={overtimeMinutes > 0 ? 'up' : overtimeMinutes < 0 ? 'down' : 'neutral'}
              trendLabel={`${overtimeMinutes >= 0 ? '+' : ''}${formatDuration(Math.abs(overtimeMinutes))} vs. Soll`}
            />
            <KpiCard
              title="Aktive Mitarbeiter"
              value={String(monthData.length)}
              sub={`${liveCount} gerade anwesend`}
              icon={Users}
              iconColor="text-blue-500"
            />
            <KpiCard
              title="Ø Stunden pro Arbeitstag"
              value={formatDuration(avgMinutesPerDay)}
              sub={`${daysWorked} Tage erfasst`}
              icon={TrendingUp}
              iconColor="text-purple-500"
            />
            <KpiCard
              title="Überstunden gesamt"
              value={`${overtimeMinutes >= 0 ? '+' : ''}${formatDuration(Math.abs(overtimeMinutes))}`}
              sub={overtimeMinutes >= 0 ? 'Team im Plan' : 'Team im Minus'}
              icon={overtimeMinutes < -60 ? AlertTriangle : TrendingUp}
              iconColor={overtimeMinutes < -60 ? 'text-yellow-500' : 'text-green-500'}
            />
          </>
        )}
      </div>

      {/* Paketankündigungen */}
      {(deliveries.length > 0 || true) && (
        <Card>
          <CardHeader className="pb-2 pt-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Package className="w-4 h-4 text-muted-foreground" />
                <CardTitle className="text-sm">Paketankündigungen heute</CardTitle>
              </div>
              {deliveries.length > 0 && (
                <span className="text-xs text-muted-foreground">{deliveries.filter(d => d.status === 'expected').length} erwartet</span>
              )}
            </div>
          </CardHeader>
          <CardContent className="pb-4">
            {deliveries.length === 0 ? (
              <div className="flex items-center gap-3 py-2">
                <div className="flex-1 text-sm text-muted-foreground">
                  Keine Ankündigungen für heute — Daten kommen automatisch aus deiner E-Mail.
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                {deliveries.map(d => {
                  const carrierColor: Record<string, string> = {
                    DPD: '#dc2626', UPS: '#d97706', DHL: '#ca8a04',
                    Hermes: '#16a34a', GLS: '#2563eb',
                  }
                  const color = carrierColor[d.carrier] ?? '#6b7280'
                  const statusConfig = {
                    expected: { label: 'Erwartet', cls: 'bg-blue-500/10 text-blue-500' },
                    arrived: { label: 'Angekommen', cls: 'bg-green-500/10 text-green-500' },
                    missed: { label: 'Verpasst', cls: 'bg-red-500/10 text-red-500' },
                  }
                  const sc = statusConfig[d.status]
                  return (
                    <div key={d.id} className="flex items-center gap-3 py-2 border-b last:border-0">
                      <div
                        className="w-10 h-10 rounded-lg flex items-center justify-center text-xs font-bold text-white shrink-0"
                        style={{ backgroundColor: color }}
                      >
                        {d.carrier.slice(0, 3)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">{d.type}</p>
                        <p className="text-xs text-muted-foreground">{d.window_start} – {d.window_end} Uhr{d.note ? ` · ${d.note}` : ''}</p>
                      </div>
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full shrink-0 ${sc.cls}`}>
                        {sc.label}
                      </span>
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Haupt-Charts */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">

        {/* Stündliche Besetzung / MitarbeiterChart — mit Employee-Switcher */}
        <Card className="xl:col-span-2">
          <CardHeader className="pb-2">
            <div className="flex items-start justify-between gap-4">
              <div>
                <CardTitle className="text-base">
                  {selectedEmpFull ? `Soll/Ist — ${selectedEmpFull.name}` : 'Besetzung nach Tageszeit'}
                </CardTitle>
                <CardDescription>
                  {selectedEmpFull
                    ? 'Kumulativer Soll- und Ist-Verlauf im Monatsvergleich'
                    : 'Ø Mitarbeiter anwesend pro Stunde — aus allen erfassten Einträgen des Monats'}
                </CardDescription>
              </div>
              {/* Employee Switcher */}
              {!loading && monthEmployees.length > 0 && (
                <div className="flex flex-col items-end gap-1.5">
                  <div className="flex flex-wrap gap-1.5 justify-end">
                    <button
                      onClick={() => { setSelectedEmployeeId(null); setChartPeriod('month') }}
                      className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors border ${
                        selectedEmployeeId === null
                          ? 'bg-foreground text-background border-transparent'
                          : 'bg-transparent text-muted-foreground border-border hover:border-foreground hover:text-foreground'
                      }`}
                    >
                      Alle
                    </button>
                    {monthEmployees.map(emp => (
                      <button
                        key={emp.id}
                        onClick={() => setSelectedEmployeeId(emp.id === selectedEmployeeId ? null : emp.id)}
                        className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors border ${
                          selectedEmployeeId === emp.id
                            ? 'text-white border-transparent'
                            : 'bg-transparent text-muted-foreground border-border hover:text-foreground'
                        }`}
                        style={selectedEmployeeId === emp.id ? { backgroundColor: emp.color, borderColor: emp.color } : {}}
                      >
                        {emp.name.split(' ')[0]}
                      </button>
                    ))}
                  </div>
                  {selectedEmpFull && (
                    <div className="flex gap-1 mt-2">
                      {(['7d', '14d', 'month'] as const).map(p => (
                        <button
                          key={p}
                          onClick={() => setChartPeriod(p)}
                          className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors border ${
                            chartPeriod === p
                              ? 'bg-foreground text-background border-transparent'
                              : 'bg-transparent text-muted-foreground border-border hover:border-foreground hover:text-foreground'
                          }`}
                        >
                          {p === '7d' ? '7 Tage' : p === '14d' ? '14 Tage' : 'Monat'}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="h-64">{skel}</div>
            ) : selectedEmpFull ? (
              /* Individuelle Soll/Ist-Kurve */
              <MitarbeiterChart
                employee={selectedEmpFull}
                daily={daily}
                year={year}
                month={month}
                period={chartPeriod}
              />
            ) : hourly.length === 0 ? (
              <div className="h-64 flex items-center justify-center text-muted-foreground text-sm">
                Noch keine Daten für diesen Monat.
              </div>
            ) : (
              /* Stündliche Besetzung — gestapelter Bar Chart (Anwesend + Geplant) */
              (() => {
                const chartData = hourly.map(h => ({
                  ...h,
                  planned_extra: Math.max(0, h.planned - h.count),
                }))
                return (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between px-1">
                      <p className="text-xs text-muted-foreground">Besetzung nach Tageszeit — kumulativ über den Monat</p>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <span className="w-2.5 h-2.5 rounded-sm inline-block bg-green-500" />
                          Anwesend
                        </span>
                        <span className="flex items-center gap-1">
                          <span className="w-2.5 h-2.5 rounded-sm inline-block bg-muted-foreground/30" />
                          Geplant
                        </span>
                      </div>
                    </div>
                    <ResponsiveContainer width="100%" height={240}>
                      <BarChart data={chartData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }} barSize={20}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" vertical={false} />
                        <XAxis
                          dataKey="hour"
                          tick={{ fontSize: 10 }}
                          tickLine={false}
                          axisLine={false}
                          interval={1}
                        />
                        <YAxis
                          tick={{ fontSize: 10 }}
                          tickLine={false}
                          axisLine={false}
                          allowDecimals={false}
                          tickFormatter={v => v === 0 ? '' : `${v}`}
                          domain={[0, 'dataMax + 1']}
                        />
                        <Tooltip
                          cursor={{ fill: 'rgba(255,255,255,0.04)' }}
                          content={({ active, payload }) => {
                            if (!active || !payload?.length) return null
                            const d = payload[0].payload as typeof chartData[number]
                            return (
                              <div className="bg-popover border rounded-lg shadow-lg p-3 text-sm min-w-[160px]">
                                <p className="font-medium mb-2">{d.hour} Uhr</p>
                                <div className="space-y-1">
                                  <div className="flex items-center justify-between gap-4">
                                    <span className="flex items-center gap-1.5 text-muted-foreground">
                                      <span className="w-2 h-2 rounded-sm bg-green-500 inline-block" />
                                      Anwesend
                                    </span>
                                    <span className="font-medium">{d.count}×</span>
                                  </div>
                                  {d.planned > 0 && (
                                    <div className="flex items-center justify-between gap-4">
                                      <span className="flex items-center gap-1.5 text-muted-foreground">
                                        <span className="w-2 h-2 rounded-sm bg-muted-foreground/40 inline-block" />
                                        Geplant gesamt
                                      </span>
                                      <span className="font-medium">{d.planned}×</span>
                                    </div>
                                  )}
                                </div>
                              </div>
                            )
                          }}
                        />
                        {/* Tatsächlich anwesend — grün */}
                        <Bar dataKey="count" stackId="a" radius={[0, 0, 2, 2]}>
                          {chartData.map((entry, i) => (
                            <Cell
                              key={i}
                              fill={entry.count > 2 ? '#16a34a' : entry.count > 0 ? '#22c55e' : 'transparent'}
                            />
                          ))}
                        </Bar>
                        {/* Geplant aber noch nicht da — grau (gestapelt oben) */}
                        <Bar dataKey="planned_extra" stackId="a" radius={[2, 2, 0, 0]}>
                          {chartData.map((entry, i) => (
                            <Cell
                              key={i}
                              fill={entry.planned_extra > 0 ? '#6b728066' : 'transparent'}
                            />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )
              })()
            )}
          </CardContent>
        </Card>

        {/* Mitarbeiter heute — Live-Status */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Mitarbeiter heute</CardTitle>
            <CardDescription>Live-Status und Tagesplanung</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
              </div>
            ) : (() => {
              // Compute today (Berlin) for client-side comparison
              const todayStr = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Berlin' }).format(new Date())

              // Which employees to show: union of live + today_shifts + recent-today
              const seen = new Set<string>()
              const items: Array<{
                employee_id: string; name: string; color: string;
                status: 'live' | 'done' | 'planned' | 'absent'
                detail: string
              }> = []

              // 1. Currently live
              for (const le of liveEntries) {
                const emp = Array.isArray(le.employees) ? le.employees[0] : le.employees
                if (!emp || seen.has(le.employee_id)) continue
                seen.add(le.employee_id)
                const sinceTime = new Intl.DateTimeFormat('de-DE', { timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit' }).format(new Date(le.checked_in_at))
                items.push({ employee_id: le.employee_id, name: emp.name, color: emp.color, status: 'live', detail: `Im Lager seit ${sinceTime}` })
              }

              // 2. Done today (recent entries with checkout today)
              for (const re of recent) {
                if (!re.checked_out_at) continue
                const checkoutDate = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Berlin' }).format(new Date(re.checked_out_at))
                if (checkoutDate !== todayStr) continue
                const emp = Array.isArray(re.employees) ? re.employees[0] : re.employees
                if (!emp || seen.has(emp.id)) continue
                seen.add(emp.id)
                const inTime = new Intl.DateTimeFormat('de-DE', { timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit' }).format(new Date(re.checked_in_at))
                const outTime = new Intl.DateTimeFormat('de-DE', { timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit' }).format(new Date(re.checked_out_at))
                const gross = Math.floor((new Date(re.checked_out_at).getTime() - new Date(re.checked_in_at).getTime()) / 60_000)
                const net = Math.max(0, gross - re.break_minutes)
                items.push({ employee_id: emp.id, name: emp.name, color: emp.color, status: 'done', detail: `${inTime}–${outTime} · ${formatDuration(net)}` })
              }

              // 3. Planned today (shift exists, not yet in)
              for (const ts of todayShifts) {
                const emp = Array.isArray(ts.employees) ? ts.employees[0] : ts.employees
                if (!emp || seen.has(ts.employee_id)) continue
                seen.add(ts.employee_id)
                items.push({ employee_id: ts.employee_id, name: emp.name, color: emp.color, status: 'planned', detail: `Geplant ${ts.start_time} Uhr` })
              }

              if (items.length === 0) {
                return <p className="text-sm text-muted-foreground text-center py-8">Keine Aktivitäten heute.</p>
              }

              return (
                <div className="space-y-3">
                  {items.map(item => (
                    <div key={item.employee_id} className="flex items-center gap-3">
                      <div className="relative shrink-0">
                        <div
                          className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-bold"
                          style={{ backgroundColor: item.color }}
                        >
                          {item.name.charAt(0).toUpperCase()}
                        </div>
                        {item.status === 'live' && (
                          <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-500 rounded-full border-2 border-background animate-pulse" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{item.name}</p>
                        <p className="text-xs text-muted-foreground flex items-center gap-1">
                          {item.status === 'live' && <span className="text-green-500 font-medium">{item.detail}</span>}
                          {item.status === 'done' && <span className="text-muted-foreground">{item.detail}</span>}
                          {item.status === 'planned' && <span className="text-blue-500">{item.detail}</span>}
                        </p>
                      </div>
                      <div className="shrink-0">
                        {item.status === 'live' && <Clock className="w-4 h-4 text-green-500" />}
                        {item.status === 'done' && <LogOut className="w-4 h-4 text-muted-foreground" />}
                        {item.status === 'planned' && <Calendar className="w-4 h-4 text-blue-500" />}
                      </div>
                    </div>
                  ))}
                </div>
              )
            })()}
          </CardContent>
        </Card>
      </div>

      {/* Stundenauswertung */}
      <StundenAuswertungInline year={year} month={month} />
    </div>
  )
}
