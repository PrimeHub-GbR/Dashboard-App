'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { MitarbeiterChart } from '@/components/zeiterfassung/MitarbeiterChart'
import { MonatsSelector } from '@/components/zeiterfassung/MonatsSelector'
import { formatDuration, formatDateTimeBerlin, formatTimeBerlin, currentBerlinYearMonth } from '@/lib/zeiterfassung/timezone'
import type { WeeklySchedule } from '@/lib/zeiterfassung/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { LogOut, Clock, CalendarDays, TrendingUp, TrendingDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'

interface PortalSession {
  id: string
  name: string
  color: string
  target_hours_per_month: number
  weekly_schedule: WeeklySchedule
  loginAt: number
}

interface MonthStats {
  total_work_minutes: number
  total_break_minutes: number
  entry_count: number
}

interface DailyRow {
  work_date: string
  employee_id: string
  net_minutes: number
}

interface Shift {
  id: string
  shift_date: string
  start_time: string
  end_time: string
  note: string | null
}

interface Entry {
  id: string
  checked_in_at: string
  checked_out_at: string | null
  break_minutes: number
  note: string | null
}

const KIOSK_TOKEN = process.env.NEXT_PUBLIC_KIOSK_TOKEN ?? ''
const WEEKDAY_SHORT = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa']
const SESSION_TTL = 8 * 60 * 60 * 1000 // 8 Stunden

export function PortalDashboard() {
  const router = useRouter()
  const now = currentBerlinYearMonth()
  const [year, setYear] = useState(now.year)
  const [month, setMonth] = useState(now.month)
  const [session, setSession] = useState<PortalSession | null>(null)
  const [monthStats, setMonthStats] = useState<MonthStats | null>(null)
  const [daily, setDaily] = useState<DailyRow[]>([])
  const [shifts, setShifts] = useState<Shift[]>([])
  const [entries, setEntries] = useState<Entry[]>([])
  const [loading, setLoading] = useState(true)

  // Session aus sessionStorage lesen
  useEffect(() => {
    const stored = sessionStorage.getItem('portal_session')
    if (!stored) { router.replace('/portal'); return }
    try {
      const s = JSON.parse(stored) as PortalSession
      if (Date.now() - s.loginAt > SESSION_TTL) {
        sessionStorage.removeItem('portal_session')
        router.replace('/portal')
        return
      }
      setSession(s)
    } catch {
      router.replace('/portal')
    }
  }, [router])

  const loadData = useCallback(async (emp: PortalSession, y: number, m: number) => {
    setLoading(true)
    try {
      const res = await fetch(
        `/api/zeiterfassung/portal/me?employee_id=${emp.id}&year=${y}&month=${m}`,
        { headers: { 'x-kiosk-token': KIOSK_TOKEN } }
      )
      if (!res.ok) throw new Error()
      const json = await res.json() as {
        monthStats: MonthStats
        daily: DailyRow[]
        shifts: Shift[]
        entries: Entry[]
      }
      setMonthStats(json.monthStats)
      setDaily(json.daily)
      setShifts(json.shifts)
      setEntries(json.entries)
    } catch {
      toast.error('Daten konnten nicht geladen werden')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (session) loadData(session, year, month)
  }, [session, year, month, loadData])

  function logout() {
    sessionStorage.removeItem('portal_session')
    router.replace('/portal')
  }

  if (!session) return null

  // Berechnungen
  const netMinutes = monthStats
    ? Math.max(0, monthStats.total_work_minutes - monthStats.total_break_minutes)
    : 0
  const targetMinutes = session.target_hours_per_month * 60
  const overtimeMinutes = netMinutes - targetMinutes
  const progressPct = targetMinutes > 0 ? Math.min(100, Math.round((netMinutes / targetMinutes) * 100)) : 0

  // Heutige Schichten
  const todayStr = new Date().toISOString().split('T')[0]
  const todayShifts = shifts.filter(s => s.shift_date === todayStr)

  return (
    <div className="min-h-screen bg-background pb-8">

      {/* Header */}
      <div className="sticky top-0 z-10 bg-background border-b px-4 py-3 flex items-center gap-3">
        <div
          className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold text-white shrink-0"
          style={{ backgroundColor: session.color }}
        >
          {session.name.charAt(0).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm truncate">{session.name}</p>
          <p className="text-xs text-muted-foreground">Mitarbeiter-Portal</p>
        </div>
        <Button variant="ghost" size="sm" onClick={logout} className="gap-1.5 text-muted-foreground">
          <LogOut className="w-4 h-4" />
          Abmelden
        </Button>
      </div>

      <div className="px-4 pt-4 space-y-4 max-w-lg mx-auto">

        {/* Monat-Selector */}
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Meine Übersicht</h2>
          <MonatsSelector year={year} month={month} onChange={(y, m) => { setYear(y); setMonth(m) }} />
        </div>

        {/* KPI-Karten */}
        <div className="grid grid-cols-3 gap-2">
          {loading ? Array.from({length: 3}).map((_, i) => (
            <Card key={i}><CardContent className="p-3 h-20"><Skeleton className="h-full" /></CardContent></Card>
          )) : (
            <>
              <Card>
                <CardContent className="p-3">
                  <div className="flex items-center gap-1 mb-1">
                    <Clock className="w-3.5 h-3.5 text-primary" />
                    <span className="text-xs text-muted-foreground">Ist</span>
                  </div>
                  <p className="text-lg font-bold leading-tight">{formatDuration(netMinutes)}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-3">
                  <div className="flex items-center gap-1 mb-1">
                    <CalendarDays className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">Soll</span>
                  </div>
                  <p className="text-lg font-bold leading-tight">{session.target_hours_per_month}h</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-3">
                  <div className="flex items-center gap-1 mb-1">
                    {overtimeMinutes >= 0
                      ? <TrendingUp className="w-3.5 h-3.5 text-green-500" />
                      : <TrendingDown className="w-3.5 h-3.5 text-red-500" />}
                    <span className="text-xs text-muted-foreground">Diff</span>
                  </div>
                  <p className={`text-lg font-bold leading-tight ${overtimeMinutes >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                    {overtimeMinutes >= 0 ? '+' : ''}{formatDuration(Math.abs(overtimeMinutes))}
                  </p>
                </CardContent>
              </Card>
            </>
          )}
        </div>

        {/* Fortschrittsbalken */}
        {!loading && (
          <div className="space-y-1">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{progressPct}% des Monatsziels</span>
              <span>{monthStats?.entry_count ?? 0} Buchungen</span>
            </div>
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all"
                style={{ width: `${progressPct}%`, backgroundColor: session.color }}
              />
            </div>
          </div>
        )}

        {/* Soll/Ist-Chart */}
        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm">Soll/Ist-Verlauf</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            {loading ? (
              <div className="h-40"><Skeleton className="h-full" /></div>
            ) : (
              <MitarbeiterChart
                employee={{ id: session.id, name: session.name, color: session.color, weekly_schedule: session.weekly_schedule }}
                daily={daily}
                year={year}
                month={month}
              />
            )}
          </CardContent>
        </Card>

        {/* Heutiger Schichtplan (nur aktueller Monat) */}
        {todayShifts.length > 0 && (
          <Card>
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-sm flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                Heute
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4 space-y-2">
              {todayShifts.map(s => (
                <div key={s.id} className="flex items-center gap-3 text-sm">
                  <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: session.color }} />
                  <span className="font-medium">{s.start_time} – {s.end_time}</span>
                  {s.note && <span className="text-muted-foreground text-xs">{s.note}</span>}
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Schichtplan Monat */}
        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm">Schichtplan</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            {loading ? (
              <div className="space-y-2">{Array.from({length: 4}).map((_,i) => <Skeleton key={i} className="h-8" />)}</div>
            ) : shifts.length === 0 ? (
              <p className="text-sm text-muted-foreground">Keine Schichten geplant.</p>
            ) : (
              <div className="space-y-2">
                {shifts.map(s => {
                  const date = new Date(s.shift_date + 'T00:00:00')
                  const wd = WEEKDAY_SHORT[date.getDay()]
                  const day = date.getDate()
                  const isToday = s.shift_date === todayStr
                  return (
                    <div
                      key={s.id}
                      className={`flex items-center gap-3 text-sm rounded-lg px-3 py-2 ${isToday ? 'bg-primary/10 font-medium' : 'bg-muted/40'}`}
                    >
                      <span className="w-12 text-muted-foreground shrink-0">{wd} {day}.</span>
                      <span>{s.start_time} – {s.end_time}</span>
                      {s.note && <span className="text-xs text-muted-foreground ml-auto truncate">{s.note}</span>}
                      {isToday && <Badge variant="secondary" className="text-xs ml-auto shrink-0">Heute</Badge>}
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Zeiteinträge */}
        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm">Meine Buchungen</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            {loading ? (
              <div className="space-y-2">{Array.from({length: 4}).map((_,i) => <Skeleton key={i} className="h-10" />)}</div>
            ) : entries.length === 0 ? (
              <p className="text-sm text-muted-foreground">Keine Buchungen in diesem Monat.</p>
            ) : (
              <div className="space-y-2">
                {entries.map(e => {
                  const gross = e.checked_out_at
                    ? Math.floor((new Date(e.checked_out_at).getTime() - new Date(e.checked_in_at).getTime()) / 60_000)
                    : null
                  const net = gross !== null ? Math.max(0, gross - e.break_minutes) : null
                  return (
                    <div key={e.id} className="flex items-center gap-2 text-xs py-2 border-b last:border-0">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium">{formatDateTimeBerlin(e.checked_in_at).split(',')[0]}</p>
                        <p className="text-muted-foreground">
                          {formatTimeBerlin(e.checked_in_at)}
                          {e.checked_out_at ? ` – ${formatTimeBerlin(e.checked_out_at)}` : ' – '}
                          {e.checked_out_at ? '' : <Badge variant="secondary" className="text-xs ml-1">Offen</Badge>}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        {net !== null
                          ? <span className="font-semibold">{formatDuration(net)}</span>
                          : <span className="text-muted-foreground">—</span>}
                        {e.break_minutes > 0 && (
                          <p className="text-muted-foreground">{e.break_minutes} Min. Pause</p>
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
