'use client'

import { useKioskCheckin } from '@/hooks/useKioskCheckin'
import { formatTimeBerlin, formatDuration, currentBerlinYearMonth } from '@/lib/zeiterfassung/timezone'
import type { Employee, KioskCheckinResult } from '@/lib/zeiterfassung/types'
import { CheckCircle, LogIn, LogOut, Delete, Clock, AlertTriangle, TrendingUp, TrendingDown, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import {
  AreaChart,
  Area,
  Line,
  XAxis,
  YAxis,
  ComposedChart,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'

const KIOSK_TOKEN = process.env.NEXT_PUBLIC_KIOSK_TOKEN ?? ''

interface PersonalStats {
  total_work_minutes: number
  total_break_minutes: number
  entry_count: number
  target_hours_per_month: number
}

interface DailyEntry {
  checked_in_at: string
  checked_out_at: string | null
  break_minutes: number | null
}

function buildChartData(
  entries: DailyEntry[],
  targetHoursPerMonth: number,
  year: number,
  month: number
) {
  const today = new Date()
  const daysInMonth = new Date(year, month, 0).getDate()
  const currentDay = today.getMonth() + 1 === month && today.getFullYear() === year
    ? today.getDate()
    : daysInMonth

  // Map day → net minutes worked
  const dayMap: Record<number, number> = {}
  for (const entry of entries) {
    if (!entry.checked_out_at) continue
    const inDate = new Date(entry.checked_in_at)
    const berlinDay = parseInt(
      new Intl.DateTimeFormat('de-DE', { timeZone: 'Europe/Berlin', day: 'numeric' }).format(inDate)
    )
    const gross = (new Date(entry.checked_out_at).getTime() - inDate.getTime()) / 60000
    const net = Math.max(0, gross - (entry.break_minutes ?? 0))
    dayMap[berlinDay] = (dayMap[berlinDay] ?? 0) + net
  }

  const data: { day: number; ist: number; soll: number }[] = []
  let cumIst = 0
  for (let d = 1; d <= currentDay; d++) {
    cumIst += dayMap[d] ?? 0
    const cumSoll = (d / daysInMonth) * targetHoursPerMonth * 60
    data.push({
      day: d,
      ist: Math.round((cumIst / 60) * 10) / 10,
      soll: Math.round((cumSoll / 60) * 10) / 10,
    })
  }
  return data
}

// Success animation screen
function SuccessScreen({ result }: { result: KioskCheckinResult }) {
  const isCheckin = result.type === 'checkin'
  return (
    <div className="flex flex-col items-center gap-6 text-center max-w-sm mx-auto px-4">
      {/* Pulsing ring + checkmark */}
      <div className="relative flex items-center justify-center w-32 h-32">
        <div className="absolute inset-0 rounded-full bg-green-500 opacity-20 animate-ping" />
        <div className="absolute inset-2 rounded-full bg-green-500 opacity-10 animate-ping [animation-delay:0.3s]" />
        <div
          className="relative w-24 h-24 rounded-full flex items-center justify-center"
          style={{ backgroundColor: result.employee_color ?? '#22c55e' }}
        >
          <CheckCircle className="w-12 h-12 text-white" strokeWidth={2.5} />
        </div>
      </div>

      {/* Message */}
      <div>
        <h1 className="text-3xl font-bold text-white mb-2">
          {isCheckin ? `Willkommen!` : `Tschüss!`}
        </h1>
        <p className="text-xl text-gray-300 font-medium">{result.employee_name}</p>
        {isCheckin ? (
          <p className="text-gray-400 mt-2 text-lg">
            Eingestempelt um {formatTimeBerlin(result.checked_in_at)} Uhr
          </p>
        ) : (
          <div className="mt-2 space-y-1">
            <p className="text-gray-400 text-lg">
              Gearbeitet: <span className="text-white font-semibold">{formatDuration(result.net_minutes ?? 0)}</span>
            </p>
            {(result.break_minutes ?? 0) > 0 && (
              <p className="text-gray-500 text-sm">
                inkl. {result.break_minutes} Min. Pause (ArbZG § 4)
              </p>
            )}
          </div>
        )}
      </div>

      {/* Action badge */}
      <div className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium ${
        isCheckin ? 'bg-green-500/20 text-green-400' : 'bg-blue-500/20 text-blue-400'
      }`}>
        {isCheckin ? <LogIn className="w-4 h-4" /> : <LogOut className="w-4 h-4" />}
        {isCheckin ? 'Eingestempelt' : 'Ausgestempelt'}
      </div>
    </div>
  )
}

function PersonalView({
  employee,
  result,
  onExit,
  personalViewSeconds,
}: {
  employee: Pick<Employee, 'id' | 'name' | 'color'>
  result: KioskCheckinResult | null
  onExit: () => void
  personalViewSeconds: number
}) {
  const [countdown, setCountdown] = useState(personalViewSeconds)
  const [stats, setStats] = useState<PersonalStats | null>(null)
  const [entries, setEntries] = useState<DailyEntry[]>([])

  const { year, month } = currentBerlinYearMonth()

  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) { clearInterval(timer); return 0 }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    fetch(`/api/zeiterfassung/portal/me?employee_id=${employee.id}&year=${year}&month=${month}`, {
      headers: { 'x-kiosk-token': KIOSK_TOKEN },
    })
      .then(r => r.json())
      .then((j: {
        monthStats: { total_work_minutes: number; total_break_minutes: number; entry_count: number }
        employee: { target_hours_per_month: number }
        entries: DailyEntry[]
      }) => {
        setStats({ ...j.monthStats, target_hours_per_month: j.employee?.target_hours_per_month ?? 0 })
        setEntries(j.entries ?? [])
      })
      .catch(() => { /* ignore */ })
  }, [employee.id, year, month])

  // Null-safe Berechnungen
  const netMinutes = stats ? Math.max(0, (stats.total_work_minutes ?? 0) - (stats.total_break_minutes ?? 0)) : 0
  const targetMinutes = stats ? (stats.target_hours_per_month ?? 0) * 60 : 0
  const diff = netMinutes - targetMinutes
  const hasData = netMinutes > 0
  const progressPct = targetMinutes > 0 && hasData ? Math.min(100, Math.round((netMinutes / targetMinutes) * 100)) : 0

  const today = new Date()
  const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate()
  const currentDay = today.getDate()
  const expectedPct = Math.round((currentDay / daysInMonth) * 100)
  const pctDiff = progressPct - expectedPct
  const contextMsg = hasData && targetMinutes > 0
    ? pctDiff >= 5
      ? `Gut dabei — ${pctDiff}% vor dem Tagesziel`
      : pctDiff <= -5
      ? `${Math.abs(pctDiff)}% hinter dem Tagesziel`
      : `Genau im Plan`
    : null

  const ss = String(countdown % 60).padStart(2, '0')

  // Chart-Daten
  const chartData = stats
    ? buildChartData(entries, stats.target_hours_per_month, year, month)
    : []

  const isCheckin = result?.type === 'checkin'

  return (
    <div className="flex flex-col items-center gap-5 max-w-sm mx-auto px-4 w-full text-center">
      {/* Avatar + Begrüßung */}
      <div className="flex flex-col items-center gap-2">
        <div
          className="w-16 h-16 rounded-full flex items-center justify-center text-2xl font-bold text-white shadow-lg"
          style={{ backgroundColor: employee.color }}
        >
          {employee.name.charAt(0).toUpperCase()}
        </div>
        <div>
          <h1 className="text-xl font-bold text-white">
            {isCheckin ? `Hallo, ${employee.name}!` : `Bis bald, ${employee.name}!`}
          </h1>
          <p className="text-gray-500 text-xs mt-0.5">Monatsübersicht · {month}/{year}</p>
        </div>
      </div>

      {/* Stats */}
      {stats === null ? (
        <div className="w-full h-20 bg-gray-900 rounded-xl animate-pulse" />
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2 w-full">
            <div className="bg-gray-900 rounded-xl p-3">
              <p className="text-xs text-gray-500 mb-1">Ist</p>
              <p className="text-base font-bold text-white">
                {hasData ? formatDuration(netMinutes) : <span className="text-gray-600">—</span>}
              </p>
            </div>
            <div className="bg-gray-900 rounded-xl p-3">
              <p className="text-xs text-gray-500 mb-1">Soll</p>
              <p className="text-base font-bold text-white">
                {targetMinutes > 0 ? `${stats.target_hours_per_month}h` : <span className="text-gray-600">—</span>}
              </p>
            </div>
            <div className="bg-gray-900 rounded-xl p-3">
              <p className="text-xs text-gray-500 mb-1">Diff</p>
              {hasData && targetMinutes > 0 ? (
                <p className={`text-base font-bold flex items-center justify-center gap-0.5 ${diff >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {diff >= 0 ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
                  {diff >= 0 ? '+' : ''}{formatDuration(Math.abs(diff))}
                </p>
              ) : (
                <p className="text-gray-600">—</p>
              )}
            </div>
          </div>

          {/* Fortschrittsbalken */}
          {targetMinutes > 0 && (
            <div className="w-full space-y-1">
              <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${progressPct}%`, backgroundColor: employee.color }}
                />
              </div>
              <div className="flex justify-between text-xs text-gray-600">
                <span>{hasData ? `${progressPct}% des Monatsziels` : 'Noch keine Stunden erfasst'}</span>
                {(stats.entry_count ?? 0) > 0 && <span>{stats.entry_count} Buchungen</span>}
              </div>
            </div>
          )}

          {/* Kontext-Hinweis */}
          {contextMsg && (
            <div className={`w-full rounded-xl px-3 py-2 text-xs font-medium ${
              pctDiff >= 5 ? 'bg-green-500/10 text-green-400' :
              pctDiff <= -5 ? 'bg-red-500/10 text-red-400' :
              'bg-gray-800 text-gray-400'
            }`}>
              {contextMsg}
            </div>
          )}

          {/* Ist/Soll Chart */}
          {chartData.length > 1 && (
            <div className="w-full">
              <p className="text-xs text-gray-600 mb-2 text-left">Verlauf dieses Monats</p>
              <ResponsiveContainer width="100%" height={110}>
                <ComposedChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                  <XAxis
                    dataKey="day"
                    tick={{ fill: '#4b5563', fontSize: 10 }}
                    tickLine={false}
                    axisLine={false}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    tick={{ fill: '#4b5563', fontSize: 10 }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={v => `${v}h`}
                  />
                  <Tooltip
                    contentStyle={{ background: '#111', border: '1px solid #333', borderRadius: 8, fontSize: 12 }}
                    labelStyle={{ color: '#9ca3af' }}
                    labelFormatter={v => `Tag ${v}`}
                    formatter={(value: number, name: string) => [
                      `${value}h`,
                      name === 'ist' ? 'Ist' : 'Soll',
                    ]}
                  />
                  {/* Soll als gestrichelte Linie */}
                  <Line
                    type="monotone"
                    dataKey="soll"
                    stroke="#6b7280"
                    strokeWidth={1.5}
                    strokeDasharray="4 3"
                    dot={false}
                  />
                  {/* Ist als gefüllte Fläche */}
                  <Area
                    type="monotone"
                    dataKey="ist"
                    stroke={employee.color}
                    fill={employee.color}
                    fillOpacity={0.2}
                    strokeWidth={2}
                    dot={false}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}
        </>
      )}

      {/* Exit-Button + Countdown */}
      <div className="w-full flex flex-col items-center gap-2">
        <button
          onClick={onExit}
          className="w-full flex items-center justify-center gap-3 rounded-2xl py-5 text-white font-semibold text-lg transition-all active:scale-95"
          style={{ backgroundColor: employee.color }}
        >
          <X className="w-6 h-6" />
          Beenden
        </button>
        <p className="text-gray-700 text-xs">Automatisch in {ss}s</p>
      </div>
    </div>
  )
}

interface Props {
  employees: Pick<Employee, 'id' | 'name' | 'color'>[]
}

export function KioskCheckin({ employees }: Props) {
  const {
    step,
    selectedEmployee,
    pin,
    result,
    error,
    loading,
    personalViewSeconds,
    selectEmployee,
    appendDigit,
    deleteDigit,
    reset,
  } = useKioskCheckin()

  if (step === 'success' && result) {
    return <SuccessScreen result={result} />
  }

  if (step === 'personal' && selectedEmployee) {
    return (
      <PersonalView
        employee={selectedEmployee}
        result={result}
        onExit={reset}
        personalViewSeconds={personalViewSeconds}
      />
    )
  }

  if (step === 'pin' && selectedEmployee) {
    return (
      <div className="flex flex-col items-center gap-8 max-w-xs mx-auto px-4 w-full">
        {/* Header */}
        <div className="text-center">
          <div
            className="w-16 h-16 rounded-full mx-auto mb-3 flex items-center justify-center text-2xl font-bold text-white"
            style={{ backgroundColor: selectedEmployee.color }}
          >
            {selectedEmployee.name.charAt(0).toUpperCase()}
          </div>
          <h2 className="text-2xl font-bold text-white">{selectedEmployee.name}</h2>
          <p className="text-gray-400 mt-1">{loading ? 'Bitte warten…' : 'PIN eingeben'}</p>
        </div>

        {/* PIN-Punkte */}
        <div className="flex gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className={`w-4 h-4 rounded-full border-2 transition-all duration-150 ${
                loading
                  ? 'bg-gray-500 border-gray-500 animate-pulse'
                  : i < pin.length
                  ? 'bg-green-400 border-green-400 scale-110'
                  : 'border-gray-600'
              }`}
            />
          ))}
        </div>

        {/* Fehler */}
        {error && (
          <div className="flex items-center gap-2 text-red-400 text-sm bg-red-400/10 px-4 py-2 rounded-lg w-full justify-center">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            {error}
          </div>
        )}

        {/* Numpad */}
        <div className="grid grid-cols-3 gap-3 w-full">
          {['1','2','3','4','5','6','7','8','9','','0','⌫'].map((key, i) => {
            if (key === '') return <div key={i} />
            if (key === '⌫') {
              return (
                <button
                  key={i}
                  onClick={deleteDigit}
                  disabled={loading}
                  className="h-16 rounded-2xl bg-gray-800 text-white flex items-center justify-center active:scale-95 transition-transform disabled:opacity-40"
                >
                  <Delete className="w-6 h-6" />
                </button>
              )
            }
            return (
              <button
                key={i}
                onClick={() => appendDigit(key)}
                disabled={loading || pin.length >= 4}
                className="h-16 rounded-2xl bg-gray-800 hover:bg-gray-700 text-white text-2xl font-semibold active:scale-95 transition-all disabled:opacity-40"
              >
                {key}
              </button>
            )
          })}
        </div>

        <button
          onClick={reset}
          disabled={loading}
          className="text-gray-500 text-sm hover:text-gray-300 disabled:opacity-40"
        >
          Zurück zur Auswahl
        </button>
      </div>
    )
  }

  // Step: select
  return (
    <div className="w-full max-w-2xl mx-auto px-4">
      <div className="text-center mb-10">
        <Clock className="w-12 h-12 text-green-400 mx-auto mb-3" />
        <h1 className="text-3xl font-bold text-white">Zeiterfassung</h1>
        <p className="text-gray-400 mt-2">Mitarbeiter auswählen</p>
      </div>

      {employees.length === 0 ? (
        <p className="text-center text-gray-500">Keine aktiven Mitarbeiter vorhanden.</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          {employees.map((emp) => (
            <button
              key={emp.id}
              onClick={() => selectEmployee(emp)}
              className="flex flex-col items-center gap-3 p-6 rounded-2xl bg-gray-900 border border-gray-800 hover:border-green-500 active:scale-95 transition-all min-h-[120px]"
            >
              <div
                className="w-14 h-14 rounded-full flex items-center justify-center text-xl font-bold text-white"
                style={{ backgroundColor: emp.color }}
              >
                {emp.name.charAt(0).toUpperCase()}
              </div>
              <span className="text-white font-medium text-center leading-tight">{emp.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
