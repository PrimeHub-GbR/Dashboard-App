'use client'

import { useState } from 'react'
import { useZeitDashboard } from '@/hooks/useZeitDashboard'
import { MonatsSelector } from './MonatsSelector'
import { MitarbeiterBadge } from './MitarbeiterBadge'
import { formatDuration, formatDateTimeBerlin, formatTimeBerlin, currentBerlinYearMonth } from '@/lib/zeiterfassung/timezone'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Clock, Users, TrendingUp, TrendingDown, Minus, AlertTriangle, LogIn, LogOut } from 'lucide-react'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, BarChart, Bar, Cell,
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

// ─── Hilfsfunktionen ──────────────────────────────────────────────────────────

function buildChartData(daily: DailyRow[], year: number, month: number) {
  // Alle Tage des Monats generieren
  const daysInMonth = new Date(year, month, 0).getDate()
  const employees = [...new Set(daily.map(d => d.employee_name))]

  // Lookup: date → employee → net_minutes
  const lookup: Record<string, Record<string, number>> = {}
  for (const row of daily) {
    const day = new Date(row.work_date).getDate()
    const key = String(day)
    if (!lookup[key]) lookup[key] = {}
    lookup[key][row.employee_name] = Math.round(row.net_minutes / 60 * 10) / 10 // Stunden mit 1 Dezimale
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

function buildPerformanceData(month: MonthRow[]) {
  return month.map(row => {
    const netMinutes = Math.max(0, row.total_work_minutes - row.total_break_minutes)
    const netHours = Math.round(netMinutes / 60 * 10) / 10
    const targetHours = row.target_hours_per_month
    const pct = targetHours > 0 ? Math.round((netHours / targetHours) * 100) : 0
    return {
      name: row.employee_name,
      color: row.employee_color,
      netHours,
      targetHours,
      pct,
      overtime: Math.round((netMinutes - targetHours * 60) / 60 * 10) / 10,
    }
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
          <div className={`p-2 rounded-lg bg-muted`}>
            <Icon className={`w-5 h-5 ${iconColor ?? 'text-muted-foreground'}`} />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// ─── Custom Tooltip für Area Chart ───────────────────────────────────────────

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
  const { data, loading } = useZeitDashboard(year, month)

  const daily = (data?.daily ?? []) as DailyRow[]
  const monthData = (data?.month ?? []) as MonthRow[]
  const recent = (data?.recent ?? []) as RecentEntry[]
  const liveCount = data?.live_count ?? 0

  // KPI-Berechnungen
  const totalNetMinutes = monthData.reduce((s, r) => s + Math.max(0, r.total_work_minutes - r.total_break_minutes), 0)
  const totalTargetMinutes = monthData.reduce((s, r) => s + r.target_hours_per_month * 60, 0)
  const overtimeMinutes = totalNetMinutes - totalTargetMinutes
  const daysWorked = new Set(daily.map(d => d.work_date)).size
  const avgMinutesPerDay = daysWorked > 0 ? Math.round(totalNetMinutes / daysWorked) : 0

  // Chart-Daten
  const employees = [...new Set(daily.map(d => d.employee_name))]
  const employeeColors = Object.fromEntries(
    daily.map(d => [d.employee_name, d.employee_color])
  )
  const chartData = buildChartData(daily, year, month)
  const perfData = buildPerformanceData(monthData)

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

        {/* Area Chart — tägliche Stunden */}
        <Card className="xl:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Tägliche Arbeitszeit</CardTitle>
            <CardDescription>Netto-Stunden pro Mitarbeiter — zeigt Gleichmäßigkeit der Arbeit</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="h-64">{skel}</div>
            ) : daily.length === 0 ? (
              <div className="h-64 flex items-center justify-center text-muted-foreground text-sm">
                Noch keine Daten für diesen Monat.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart data={chartData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    {employees.map(emp => (
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
                    interval={employees.length > 3 ? 3 : 1}
                  />
                  <YAxis
                    tick={{ fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={v => `${v}h`}
                  />
                  <Tooltip content={<ChartTooltip />} />
                  {employees.length > 1 && (
                    <Legend
                      iconType="circle"
                      iconSize={8}
                      wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
                    />
                  )}
                  {employees.map(emp => (
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

        {/* Performance-Bars — Soll vs. Ist */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Leistung im Monat</CardTitle>
            <CardDescription>Ist-Stunden vs. Soll — % der Sollzeit</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="h-64">{skel}</div>
            ) : perfData.length === 0 ? (
              <div className="h-64 flex items-center justify-center text-muted-foreground text-sm">
                Keine Daten
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={perfData} layout="vertical" margin={{ top: 0, right: 40, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} className="stroke-muted" />
                  <XAxis type="number" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={v => `${v}%`} domain={[0, Math.max(120, ...perfData.map(d => d.pct))]} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 12 }} tickLine={false} axisLine={false} width={70} />
                  <Tooltip
                    cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null
                      const d = payload[0].payload as typeof perfData[number]
                      return (
                        <div className="bg-popover border rounded-lg shadow-lg p-3 text-sm">
                          <p className="font-medium mb-1">{d.name}</p>
                          <p className="text-muted-foreground">Ist: <span className="text-foreground font-medium">{d.netHours}h</span></p>
                          <p className="text-muted-foreground">Soll: <span className="text-foreground font-medium">{d.targetHours}h</span></p>
                          <p className="text-muted-foreground">Erreichung: <span className={`font-medium ${d.pct >= 100 ? 'text-green-500' : 'text-yellow-500'}`}>{d.pct}%</span></p>
                        </div>
                      )
                    }}
                  />
                  <Bar dataKey="pct" radius={[0, 4, 4, 0]} maxBarSize={28}>
                    {perfData.map((d, i) => (
                      <Cell
                        key={i}
                        fill={d.pct >= 100 ? d.color : d.pct >= 80 ? '#f59e0b' : '#ef4444'}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Untere Reihe */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Mitarbeiter Rangliste */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Mitarbeiter-Auswertung</CardTitle>
            <CardDescription>Netto-Stunden · Zielerreichung · Überstunden</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {loading ? (
              Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)
            ) : monthData.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">Keine Daten</p>
            ) : (
              monthData
                .map(row => {
                  const net = Math.max(0, row.total_work_minutes - row.total_break_minutes)
                  const target = row.target_hours_per_month * 60
                  const pct = target > 0 ? Math.min(100, Math.round((net / target) * 100)) : 0
                  const overtime = net - target
                  return { ...row, net, target, pct, overtime }
                })
                .sort((a, b) => b.net - a.net)
                .map(row => (
                  <div key={row.employee_id} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <MitarbeiterBadge name={row.employee_name} color={row.employee_color} />
                      <div className="flex items-center gap-3 text-sm">
                        <span className="font-medium">{formatDuration(row.net)}</span>
                        <Badge
                          variant={row.overtime >= 0 ? 'default' : 'destructive'}
                          className="text-xs"
                        >
                          {row.overtime >= 0 ? '+' : ''}{formatDuration(Math.abs(row.overtime))}
                        </Badge>
                      </div>
                    </div>
                    {/* Fortschrittsbalken */}
                    <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${row.pct}%`,
                          backgroundColor: row.employee_color,
                        }}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">{row.pct}% von {row.target_hours_per_month}h Soll · {row.entry_count} Buchungen</p>
                  </div>
                ))
            )}
          </CardContent>
        </Card>

        {/* Recent Activity Feed */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Letzte Aktivitäten</CardTitle>
            <CardDescription>Check-ins und Check-outs</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full mb-3" />)
            ) : recent.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">Keine Aktivitäten</p>
            ) : (
              <div className="space-y-3">
                {recent.map(entry => {
                  const emp = Array.isArray(entry.employees) ? entry.employees[0] : entry.employees
                  const isCheckout = !!entry.checked_out_at
                  const grossMin = isCheckout
                    ? Math.floor((new Date(entry.checked_out_at!).getTime() - new Date(entry.checked_in_at).getTime()) / 60_000)
                    : null
                  const netMin = grossMin !== null ? Math.max(0, grossMin - entry.break_minutes) : null

                  return (
                    <div key={entry.id} className="flex items-center gap-3">
                      <div
                        className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
                        style={{ backgroundColor: emp?.color ?? '#22c55e' }}
                      >
                        {emp?.name?.charAt(0).toUpperCase() ?? '?'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{emp?.name ?? 'Unbekannt'}</p>
                        <p className="text-xs text-muted-foreground">
                          {isCheckout ? `Ausgestempelt · ${formatTimeBerlin(entry.checked_out_at!)} Uhr` : `Eingestempelt · ${formatTimeBerlin(entry.checked_in_at)} Uhr`}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        {isCheckout ? (
                          <>
                            <LogOut className="w-3.5 h-3.5 text-muted-foreground mx-auto mb-0.5" />
                            <p className="text-xs font-medium">{netMin !== null ? formatDuration(netMin) : '—'}</p>
                          </>
                        ) : (
                          <>
                            <LogIn className="w-3.5 h-3.5 text-green-500 mx-auto mb-0.5" />
                            <p className="text-xs text-muted-foreground">{formatDateTimeBerlin(entry.checked_in_at).split(',')[0]}</p>
                          </>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
