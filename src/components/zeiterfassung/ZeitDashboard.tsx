'use client'

import { useState } from 'react'
import { useZeitDashboard } from '@/hooks/useZeitDashboard'
import { useEmployees } from '@/hooks/useEmployees'
import { MonatsSelector } from './MonatsSelector'
import { MitarbeiterChart } from './MitarbeiterChart'
import { formatDuration, currentBerlinYearMonth } from '@/lib/zeiterfassung/timezone'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Clock, Users, TrendingUp, TrendingDown, Minus, AlertTriangle, LogOut, Calendar } from 'lucide-react'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
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

// ─── Hilfsfunktionen ──────────────────────────────────────────────────────────

function buildChartData(daily: DailyRow[], year: number, month: number) {
  const daysInMonth = new Date(year, month, 0).getDate()
  const employees = [...new Set(daily.map(d => d.employee_name))]

  const lookup: Record<string, Record<string, number>> = {}
  for (const row of daily) {
    const day = new Date(row.work_date).getDate()
    const key = String(day)
    if (!lookup[key]) lookup[key] = {}
    lookup[key][row.employee_name] = Math.round(row.net_minutes / 60 * 10) / 10
  }

  return Array.from({ length: daysInMonth }, (_, i) => {
    const day = i + 1
    const key = String(day)
    const entry: Record<string, number | string> = { tag: `${day}.` }
    for (const emp of employees) {
      entry[emp] = lookup[key]?.[emp] ?? 0
    }
    return entry
  })
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

// ─── Custom Tooltip für Area Chart ────────────────────────────────────────────

function ChartTooltip({ active, payload, label }: {
  active?: boolean
  payload?: { name: string; value: number; color: string }[]
  label?: string
}) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-popover border rounded-lg shadow-lg p-3 text-sm min-w-[140px]">
      <p className="font-medium mb-2 text-foreground">Tag {label}</p>
      {payload.map(p => (
        p.value > 0 && (
          <div key={p.name} className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: p.color }} />
              <span className="text-muted-foreground">{p.name}</span>
            </span>
            <span className="font-medium">{p.value}h</span>
          </div>
        )
      ))}
    </div>
  )
}

// ─── Hauptkomponente ──────────────────────────────────────────────────────────

export function ZeitDashboard() {
  const now = currentBerlinYearMonth()
  const [year, setYear] = useState(now.year)
  const [month, setMonth] = useState(now.month)
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(null)

  const { data, loading } = useZeitDashboard(year, month)
  const { employees: allEmployees } = useEmployees()

  const daily = (data?.daily ?? []) as DailyRow[]
  const monthData = (data?.month ?? []) as MonthRow[]
  const recent = (data?.recent ?? []) as RecentEntry[]
  const liveCount = data?.live_count ?? 0
  const liveEntries = (data?.live ?? []) as LiveEntry[]
  const todayShifts = (data?.today_shifts ?? []) as TodayShift[]

  // KPI-Berechnungen
  const totalNetMinutes = monthData.reduce((s, r) => s + Math.max(0, r.total_work_minutes - r.total_break_minutes), 0)
  const totalTargetMinutes = monthData.reduce((s, r) => s + r.target_hours_per_month * 60, 0)
  const overtimeMinutes = totalNetMinutes - totalTargetMinutes
  const daysWorked = new Set(daily.map(d => d.work_date)).size
  const avgMinutesPerDay = daysWorked > 0 ? Math.round(totalNetMinutes / daysWorked) : 0

  // Chart-Daten
  const uniqueEmpNames = [...new Set(daily.map(d => d.employee_name))]
  const employeeColors = Object.fromEntries(daily.map(d => [d.employee_name, d.employee_color]))
  const chartData = buildChartData(daily, year, month)

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

      {/* Haupt-Charts */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">

        {/* Area Chart / MitarbeiterChart — mit Employee-Switcher */}
        <Card className="xl:col-span-2">
          <CardHeader className="pb-2">
            <div className="flex items-start justify-between gap-4">
              <div>
                <CardTitle className="text-base">
                  {selectedEmpFull ? `Soll/Ist — ${selectedEmpFull.name}` : 'Tägliche Arbeitszeit'}
                </CardTitle>
                <CardDescription>
                  {selectedEmpFull
                    ? 'Kumulativer Soll- und Ist-Verlauf im Monatsvergleich'
                    : 'Netto-Stunden pro Mitarbeiter — zeigt Gleichmäßigkeit der Arbeit'}
                </CardDescription>
              </div>
              {/* Employee Switcher */}
              {!loading && monthEmployees.length > 0 && (
                <div className="flex flex-wrap gap-1.5 justify-end">
                  <button
                    onClick={() => setSelectedEmployeeId(null)}
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
              />
            ) : daily.length === 0 ? (
              <div className="h-64 flex items-center justify-center text-muted-foreground text-sm">
                Noch keine Daten für diesen Monat.
              </div>
            ) : (
              /* Alle Mitarbeiter — Area Chart */
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart data={chartData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    {uniqueEmpNames.map(emp => (
                      <linearGradient key={emp} id={`grad-${emp}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={employeeColors[emp]} stopOpacity={0.3} />
                        <stop offset="95%" stopColor={employeeColors[emp]} stopOpacity={0} />
                      </linearGradient>
                    ))}
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis
                    dataKey="tag"
                    tick={{ fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    interval={uniqueEmpNames.length > 3 ? 3 : 1}
                  />
                  <YAxis
                    tick={{ fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={v => `${v}h`}
                  />
                  <Tooltip content={<ChartTooltip />} />
                  {uniqueEmpNames.length > 1 && (
                    <Legend
                      iconType="circle"
                      iconSize={8}
                      wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
                    />
                  )}
                  {uniqueEmpNames.map(emp => (
                    <Area
                      key={emp}
                      type="monotone"
                      dataKey={emp}
                      stroke={employeeColors[emp]}
                      strokeWidth={2}
                      fill={`url(#grad-${emp})`}
                      dot={false}
                      activeDot={{ r: 4 }}
                    />
                  ))}
                </AreaChart>
              </ResponsiveContainer>
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
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Stundenauswertung</CardTitle>
          <CardDescription>Brutto / Netto / Soll / Differenz — {month}/{year}</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
          ) : monthData.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">Keine Daten für diesen Monat.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 pr-4 font-medium text-muted-foreground">Mitarbeiter</th>
                    <th className="text-right py-2 px-2 font-medium text-muted-foreground">Netto</th>
                    <th className="text-right py-2 px-2 font-medium text-muted-foreground">Soll</th>
                    <th className="text-right py-2 pl-2 font-medium text-muted-foreground">Differenz</th>
                    <th className="text-right py-2 pl-2 font-medium text-muted-foreground">Buchungen</th>
                  </tr>
                </thead>
                <tbody>
                  {monthData.map(row => {
                    const net = Math.max(0, row.total_work_minutes - row.total_break_minutes)
                    const target = row.target_hours_per_month * 60
                    const diff = net - target
                    return (
                      <tr key={row.employee_id} className="border-b last:border-0">
                        <td className="py-2 pr-4">
                          <div className="flex items-center gap-2">
                            <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: row.employee_color }} />
                            <span className="font-medium truncate">{row.employee_name}</span>
                          </div>
                        </td>
                        <td className="text-right py-2 px-2 font-medium">{formatDuration(net)}</td>
                        <td className="text-right py-2 px-2 text-muted-foreground">{formatDuration(target)}</td>
                        <td className={`text-right py-2 pl-2 font-medium ${diff >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                          {diff >= 0 ? '+' : ''}{formatDuration(Math.abs(diff))}
                        </td>
                        <td className="text-right py-2 pl-2 text-muted-foreground">{row.entry_count}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
