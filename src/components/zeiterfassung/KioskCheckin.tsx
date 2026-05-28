'use client'

import { useKioskCheckin } from '@/hooks/useKioskCheckin'
import { formatTimeBerlin, formatDuration, currentBerlinYearMonth } from '@/lib/zeiterfassung/timezone'
import type { Employee, KioskCheckinResult } from '@/lib/zeiterfassung/types'
import { CheckCircle, LogIn, LogOut, Delete, Clock, AlertTriangle, TrendingUp, TrendingDown, X } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import {
  Area,
  Line,
  XAxis,
  YAxis,
  ComposedChart,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'

const KIOSK_TOKEN = process.env.NEXT_PUBLIC_KIOSK_TOKEN ?? ''

type WeeklySchedule = Partial<Record<'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun', number>>

// JS Date.getDay(): 0 = Sonntag … 6 = Samstag
const WEEKDAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const

interface PersonalStats {
  total_work_minutes: number
  total_break_minutes: number
  entry_count: number
  target_hours_per_month: number
  weekly_schedule: WeeklySchedule
}

interface DailyEntry {
  checked_in_at: string
  checked_out_at: string | null
  break_minutes: number | null
}

// Kumulatives Soll (in Minuten) vom 1. des Monats bis einschließlich upToDay,
// abgeleitet aus den geplanten Stunden pro Wochentag (weekly_schedule).
function sollMinutesUpToDay(
  schedule: WeeklySchedule,
  year: number,
  month: number,
  upToDay: number
): number {
  let total = 0
  for (let d = 1; d <= upToDay; d++) {
    const dow = new Date(year, month - 1, d).getDay()
    total += (schedule[WEEKDAY_KEYS[dow]] ?? 0) * 60
  }
  return total
}

function currentDayOfMonth(year: number, month: number): number {
  const today = new Date()
  const daysInMonth = new Date(year, month, 0).getDate()
  return today.getMonth() + 1 === month && today.getFullYear() === year
    ? today.getDate()
    : daysInMonth
}

function buildChartData(
  entries: DailyEntry[],
  schedule: WeeklySchedule,
  year: number,
  month: number
) {
  const currentDay = currentDayOfMonth(year, month)

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
  let cumSoll = 0
  for (let d = 1; d <= currentDay; d++) {
    cumIst += dayMap[d] ?? 0
    const dow = new Date(year, month - 1, d).getDay()
    cumSoll += (schedule[WEEKDAY_KEYS[dow]] ?? 0) * 60
    data.push({
      day: d,
      ist: Math.round((cumIst / 60) * 10) / 10,
      soll: Math.round((cumSoll / 60) * 10) / 10,
    })
  }

  // Am Monatsanfang gibt es nur einen Datenpunkt → recharts zeichnet keine sichtbare
  // Linie/Fläche. Einen Null-Startpunkt (Tag 0) voranstellen, damit immer etwas gerendert wird.
  if (data.length < 2) {
    data.unshift({ day: 0, ist: 0, soll: 0 })
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
        if (prev <= 1) {
          clearInterval(timer)
          onExit()
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(timer)
  }, [onExit])

  useEffect(() => {
    fetch(`/api/zeiterfassung/portal/me?employee_id=${employee.id}&year=${year}&month=${month}`, {
      headers: { 'x-kiosk-token': KIOSK_TOKEN },
    })
      .then(r => r.json())
      .then((j: {
        monthStats: { total_work_minutes: number; total_break_minutes: number; entry_count: number }
        employee: { target_hours_per_month: number; weekly_schedule?: WeeklySchedule }
        entries: DailyEntry[]
      }) => {
        setStats({
          ...j.monthStats,
          target_hours_per_month: j.employee?.target_hours_per_month ?? 0,
          weekly_schedule: j.employee?.weekly_schedule ?? {},
        })
        setEntries(j.entries ?? [])
      })
      .catch(() => { /* ignore */ })
  }, [employee.id, year, month])

  const schedule = stats?.weekly_schedule ?? {}
  const daysInMonth = new Date(year, month, 0).getDate()
  const currentDay = currentDayOfMonth(year, month)

  const netMinutes = stats ? Math.max(0, (stats.total_work_minutes ?? 0) - (stats.total_break_minutes ?? 0)) : 0
  // Soll aus dem Wochenplan: kumulativ bis heute (Vergleichsbasis) und für den ganzen Monat (Fortschritt)
  const sollToDateMinutes = stats ? sollMinutesUpToDay(schedule, year, month, currentDay) : 0
  const sollMonthMinutes = stats ? sollMinutesUpToDay(schedule, year, month, daysInMonth) : 0
  // Differenz gegenüber dem, was BIS HEUTE laut Wochenplan erwartet wird (nicht ganzer Monat)
  const diffToDate = netMinutes - sollToDateMinutes
  const hasData = netMinutes > 0
  const progressPct = sollMonthMinutes > 0 ? Math.round((netMinutes / sollMonthMinutes) * 100) : 0

  // Status auf Stundenbasis: ahead / on track / behind — gemessen am Soll bis heute
  const TOLERANCE_MIN = 15
  const statusTone: 'ahead' | 'ontrack' | 'behind' =
    diffToDate >= TOLERANCE_MIN ? 'ahead' : diffToDate <= -TOLERANCE_MIN ? 'behind' : 'ontrack'
  const contextMsg = !stats || sollToDateMinutes === 0
    ? null
    : statusTone === 'behind'
    ? `Noch ${formatDuration(-diffToDate)} bis zum Soll`
    : statusTone === 'ahead'
    ? `${formatDuration(diffToDate)} über dem Soll`
    : 'Genau im Soll'

  const ss = String(countdown % 60).padStart(2, '0')
  const chartData = stats
    ? buildChartData(entries, schedule, year, month)
    : []

  const isCheckin = result?.type === 'checkin'

  return (
    <div className="flex flex-col items-center gap-8 max-w-4xl mx-auto px-6 w-full text-center">
      {/* Avatar + Begrüßung */}
      <div className="flex flex-col items-center gap-3">
        <div
          className="w-20 h-20 rounded-full flex items-center justify-center text-3xl font-bold text-white shadow-lg"
          style={{ backgroundColor: employee.color }}
        >
          {employee.name.charAt(0).toUpperCase()}
        </div>
        <div>
          <h1 className="text-3xl font-bold text-white">
            {isCheckin ? `Hallo, ${employee.name}!` : `Bis bald, ${employee.name}!`}
          </h1>
          <p className="text-gray-500 text-sm mt-1">Monatsübersicht · {month}/{year}</p>
        </div>
      </div>

      {/* Stats */}
      {stats === null ? (
        <div className="w-full h-40 bg-gray-900 rounded-2xl animate-pulse" />
      ) : (
        <>
          <div className="grid grid-cols-3 gap-6 w-full">
            <div className="bg-gray-900/60 border border-white/5 rounded-2xl p-6 md:p-8">
              <p className="text-base text-gray-400 mb-2">Ist</p>
              <p className="text-4xl md:text-5xl font-bold text-white">
                {hasData ? formatDuration(netMinutes) : <span className="text-gray-600">—</span>}
              </p>
            </div>
            <div className="bg-gray-900/60 border border-white/5 rounded-2xl p-6 md:p-8">
              <p className="text-base text-gray-400 mb-2">Soll bis heute</p>
              <p className="text-4xl md:text-5xl font-bold text-white">
                {sollToDateMinutes > 0 ? formatDuration(sollToDateMinutes) : <span className="text-gray-600">—</span>}
              </p>
            </div>
            <div className="bg-gray-900/60 border border-white/5 rounded-2xl p-6 md:p-8">
              <p className="text-base text-gray-400 mb-2">Diff</p>
              {sollToDateMinutes > 0 ? (
                <p className={`text-4xl md:text-5xl font-bold flex items-center justify-center gap-1.5 ${diffToDate >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {diffToDate >= 0 ? <TrendingUp className="w-7 h-7" /> : <TrendingDown className="w-7 h-7" />}
                  {diffToDate >= 0 ? '+' : '−'}{formatDuration(Math.abs(diffToDate))}
                </p>
              ) : (
                <p className="text-4xl md:text-5xl font-bold text-gray-600">—</p>
              )}
            </div>
          </div>

          {/* Fortschrittsbalken */}
          {sollMonthMinutes > 0 && (
            <div className="w-full space-y-2">
              <div className="h-3 bg-gray-800 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${Math.min(100, progressPct)}%`, backgroundColor: employee.color }}
                />
              </div>
              <div className="flex justify-between text-sm text-gray-500">
                <span>{hasData ? `${progressPct}% des Monatsziels (${formatDuration(sollMonthMinutes)})` : 'Noch keine Stunden erfasst'}</span>
                {(stats.entry_count ?? 0) > 0 && <span>{stats.entry_count} Buchungen</span>}
              </div>
            </div>
          )}

          {/* Kontext-Hinweis */}
          {contextMsg && (
            <div className={`w-full rounded-2xl px-4 py-3 text-base font-medium ${
              statusTone === 'ahead' ? 'bg-green-500/10 text-green-400' :
              statusTone === 'behind' ? 'bg-red-500/10 text-red-400' :
              'bg-gray-800 text-gray-400'
            }`}>
              {contextMsg}
            </div>
          )}

          {/* Ist/Soll Chart */}
          {chartData.length >= 1 && (
            <div className="w-full">
              <p className="text-sm text-gray-500 mb-3 text-left">Verlauf dieses Monats</p>
              <ResponsiveContainer width="100%" height={360}>
                <ComposedChart data={chartData} margin={{ top: 8, right: 12, bottom: 0, left: -8 }}>
                  <XAxis
                    dataKey="day"
                    tick={{ fill: '#6b7280', fontSize: 14 }}
                    tickLine={false}
                    axisLine={false}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    tick={{ fill: '#6b7280', fontSize: 14 }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={v => `${v}h`}
                  />
                  <Tooltip
                    contentStyle={{ background: '#111', border: '1px solid #333', borderRadius: 8, fontSize: 14 }}
                    labelStyle={{ color: '#9ca3af' }}
                    labelFormatter={v => `Tag ${v}`}
                    formatter={(value: number, name: string) => [
                      `${value}h`,
                      name === 'ist' ? 'Ist' : 'Soll',
                    ]}
                  />
                  <Line
                    type="monotone"
                    dataKey="soll"
                    stroke="#6b7280"
                    strokeWidth={2}
                    strokeDasharray="5 4"
                    dot={false}
                  />
                  <Area
                    type="monotone"
                    dataKey="ist"
                    stroke={employee.color}
                    fill={employee.color}
                    fillOpacity={0.2}
                    strokeWidth={3}
                    dot={false}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}
        </>
      )}

      {/* Exit-Button + Countdown */}
      <div className="w-full max-w-sm flex flex-col items-center gap-2">
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

function PinDots({ count, loading }: { count: number; loading: boolean }) {
  return (
    <div className="flex gap-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={i}
          className={`w-4 h-4 rounded-full border-2 transition-all duration-150 ${
            loading
              ? 'bg-gray-500 border-gray-500 animate-pulse'
              : i < count
              ? 'bg-green-400 border-green-400 scale-110'
              : 'border-gray-600'
          }`}
        />
      ))}
    </div>
  )
}

function NumPad({
  onAppend,
  onDelete,
  loading,
  pinLength,
}: {
  onAppend: (digit: string) => void
  onDelete: () => void
  loading: boolean
  pinLength: number
}) {
  return (
    <div className="grid grid-cols-3 gap-3 w-full">
      {['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'].map((key, i) => {
        if (key === '') return <div key={i} />
        if (key === '⌫') {
          return (
            <button
              key={i}
              onClick={onDelete}
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
            onClick={() => onAppend(key)}
            disabled={loading || pinLength >= 4}
            className="h-16 rounded-2xl bg-gray-800 hover:bg-gray-700 text-white text-2xl font-semibold active:scale-95 transition-all disabled:opacity-40"
          >
            {key}
          </button>
        )
      })}
    </div>
  )
}

function PresenceBadge({ checkedIn }: { checkedIn: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-semibold ${
        checkedIn ? 'bg-green-500/15 text-green-300' : 'bg-gray-700/40 text-gray-400'
      }`}
    >
      <span
        className={`w-2.5 h-2.5 rounded-full ${checkedIn ? 'bg-green-400 animate-pulse' : 'bg-gray-500'}`}
      />
      {checkedIn ? 'Anwesend' : 'Abwesend'}
    </span>
  )
}

interface Props {
  employees: (Pick<Employee, 'id' | 'name' | 'color'> & { pin_is_set: boolean; position: string; is_checked_in: boolean })[]
}

export function KioskCheckin({ employees }: Props) {
  const router = useRouter()
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
    backToSetPin,
    startChangePin,
    backToChangeNew,
    reset,
  } = useKioskCheckin({ onReset: () => router.refresh() })

  // Geteiltes Terminal: Auswahl periodisch aktualisieren, damit der Anwesenheits-
  // Status auch frisch bleibt, wenn jemand an einem anderen Gerät ein-/auscheckt.
  useEffect(() => {
    if (step !== 'select') return
    const interval = setInterval(() => router.refresh(), 30000)
    return () => clearInterval(interval)
  }, [step, router])

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

  if (step === 'change_pin_success' && selectedEmployee) {
    return (
      <div className="flex flex-col items-center gap-6 text-center max-w-sm mx-auto px-4">
        <div className="relative flex items-center justify-center w-28 h-28">
          <div className="absolute inset-0 rounded-full bg-green-500 opacity-20 animate-ping" />
          <div className="relative w-20 h-20 rounded-full bg-green-500 flex items-center justify-center">
            <CheckCircle className="w-10 h-10 text-white" strokeWidth={2.5} />
          </div>
        </div>
        <h2 className="text-2xl font-bold text-white">PIN geändert</h2>
        <p className="text-gray-400">Du kannst dich jetzt mit deiner neuen PIN einstempeln.</p>
      </div>
    )
  }

  if (
    (step === 'change_pin_old' || step === 'change_pin_new' || step === 'change_pin_confirm') &&
    selectedEmployee
  ) {
    const headerText =
      step === 'change_pin_old'
        ? 'Aktuelle PIN eingeben'
        : step === 'change_pin_new'
        ? 'Neue PIN vergeben (4 Ziffern)'
        : 'Neue PIN bestätigen'
    const stepIndex = step === 'change_pin_old' ? 0 : step === 'change_pin_new' ? 1 : 2

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
          <p className="text-gray-400 mt-1 text-sm">{loading ? 'Bitte warten…' : headerText}</p>
          {/* Schritt-Indikator (3 Schritte) */}
          <div className="flex items-center justify-center gap-2 mt-2">
            <div className={`w-2 h-2 rounded-full ${stepIndex >= 0 ? 'bg-green-400' : 'bg-gray-600'}`} />
            <div className={`w-6 h-0.5 ${stepIndex >= 1 ? 'bg-green-400' : 'bg-gray-700'}`} />
            <div className={`w-2 h-2 rounded-full ${stepIndex >= 1 ? 'bg-green-400' : 'bg-gray-600'}`} />
            <div className={`w-6 h-0.5 ${stepIndex >= 2 ? 'bg-green-400' : 'bg-gray-700'}`} />
            <div className={`w-2 h-2 rounded-full ${stepIndex >= 2 ? 'bg-green-400' : 'bg-gray-600'}`} />
          </div>
        </div>

        {/* PIN-Punkte */}
        <PinDots count={pin.length} loading={loading} />

        {/* Fehler */}
        {error && (
          <div className="flex items-center gap-2 text-red-400 text-sm bg-red-400/10 px-4 py-2 rounded-lg w-full justify-center">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            {error}
          </div>
        )}

        {/* Numpad */}
        <NumPad onAppend={appendDigit} onDelete={deleteDigit} loading={loading} pinLength={pin.length} />

        <div className="flex gap-4">
          {step === 'change_pin_confirm' && (
            <button
              onClick={backToChangeNew}
              disabled={loading}
              className="text-gray-500 text-sm hover:text-gray-300 disabled:opacity-40"
            >
              ← Zurück
            </button>
          )}
          <button
            onClick={reset}
            disabled={loading}
            className="text-gray-500 text-sm hover:text-gray-300 disabled:opacity-40"
          >
            Abbrechen
          </button>
        </div>
      </div>
    )
  }

  if ((step === 'set_pin' || step === 'set_pin_confirm') && selectedEmployee) {
    const isConfirm = step === 'set_pin_confirm'
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
          <p className="text-gray-400 mt-1 text-sm">
            {loading
              ? 'Bitte warten…'
              : isConfirm
              ? 'PIN zur Bestätigung wiederholen'
              : 'Neue PIN vergeben (4 Ziffern)'}
          </p>
          {/* Schritt-Indikator */}
          <div className="flex items-center justify-center gap-2 mt-2">
            <div className={`w-2 h-2 rounded-full ${!isConfirm ? 'bg-green-400' : 'bg-gray-600'}`} />
            <div className={`w-6 h-0.5 ${isConfirm ? 'bg-green-400' : 'bg-gray-700'}`} />
            <div className={`w-2 h-2 rounded-full ${isConfirm ? 'bg-green-400' : 'bg-gray-600'}`} />
          </div>
        </div>

        {/* PIN-Punkte */}
        <PinDots count={pin.length} loading={loading} />

        {/* Hinweis-Box */}
        {!error && !loading && (
          <div className="flex items-start gap-2 text-xs text-gray-500 bg-gray-900 px-4 py-3 rounded-xl w-full">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-yellow-600" />
            <span>
              {isConfirm
                ? 'Dieselbe PIN noch einmal eingeben, um zu bestätigen.'
                : 'Diese PIN wird für alle zukünftigen Check-ins verwendet. Merke sie dir gut.'}
            </span>
          </div>
        )}

        {/* Fehler */}
        {error && (
          <div className="flex items-center gap-2 text-red-400 text-sm bg-red-400/10 px-4 py-2 rounded-lg w-full justify-center">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            {error}
          </div>
        )}

        {/* Numpad */}
        <NumPad onAppend={appendDigit} onDelete={deleteDigit} loading={loading} pinLength={pin.length} />

        <div className="flex gap-4">
          {isConfirm && (
            <button
              onClick={backToSetPin}
              disabled={loading}
              className="text-gray-500 text-sm hover:text-gray-300 disabled:opacity-40"
            >
              ← Zurück
            </button>
          )}
          <button
            onClick={reset}
            disabled={loading}
            className="text-gray-500 text-sm hover:text-gray-300 disabled:opacity-40"
          >
            Abbrechen
          </button>
        </div>
      </div>
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
        <PinDots count={pin.length} loading={loading} />

        {/* Fehler */}
        {error && (
          <div className="flex items-center gap-2 text-red-400 text-sm bg-red-400/10 px-4 py-2 rounded-lg w-full justify-center">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            {error}
          </div>
        )}

        {/* Numpad */}
        <NumPad onAppend={appendDigit} onDelete={deleteDigit} loading={loading} pinLength={pin.length} />

        <div className="flex gap-6">
          <button
            onClick={reset}
            disabled={loading}
            className="text-gray-500 text-sm hover:text-gray-300 disabled:opacity-40"
          >
            Zurück zur Auswahl
          </button>
          <button
            onClick={startChangePin}
            disabled={loading}
            className="text-gray-500 text-sm hover:text-gray-300 disabled:opacity-40"
          >
            PIN ändern
          </button>
        </div>
      </div>
    )
  }

  // Step: select
  const managers = employees.filter(e => e.position === 'manager')
  const mitarbeiter = employees.filter(e => e.position !== 'manager')

  function ManagerCard({ emp }: { emp: typeof employees[number] }) {
    return (
      <button
        onClick={() => selectEmployee(emp, emp.pin_is_set)}
        className="relative flex flex-col items-center gap-4 px-10 py-7 rounded-2xl active:scale-95 transition-all duration-200 group"
        style={{
          background: 'linear-gradient(135deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.02) 100%)',
          border: `1px solid ${emp.color}33`,
          boxShadow: emp.is_checked_in
            ? `0 0 0 1px ${emp.color}55, 0 8px 32px ${emp.color}22`
            : '0 4px 24px rgba(0,0,0,0.3)',
        }}
      >
        {/* Anwesenheits-Indikator */}
        <div className="absolute top-3.5 right-3.5">
          <PresenceBadge checkedIn={emp.is_checked_in} />
        </div>

        {/* Avatar mit Glow-Ring wenn anwesend */}
        <div className="relative">
          {emp.is_checked_in && (
            <div className="absolute inset-0 rounded-full animate-ping opacity-20"
              style={{ backgroundColor: emp.color, transform: 'scale(1.3)' }} />
          )}
          <div
            className="relative w-20 h-20 rounded-full flex items-center justify-center text-2xl font-bold text-white shadow-lg"
            style={{
              backgroundColor: emp.color,
              boxShadow: emp.is_checked_in ? `0 0 20px ${emp.color}66` : 'none',
            }}
          >
            {emp.name.charAt(0).toUpperCase()}
          </div>
        </div>

        <div className="text-center">
          <span className="text-white font-semibold text-lg leading-tight block">{emp.name}</span>
          <span className="text-xs font-medium tracking-wider uppercase mt-1 block"
            style={{ color: `${emp.color}aa` }}>Manager</span>
        </div>
      </button>
    )
  }

  function MitarbeiterCard({ emp }: { emp: typeof employees[number] }) {
    return (
      <button
        onClick={() => selectEmployee(emp, emp.pin_is_set)}
        className="relative flex flex-col items-center gap-3 p-5 rounded-2xl active:scale-95 transition-all duration-200 min-w-[150px]"
        style={{
          background: 'rgba(255,255,255,0.03)',
          border: emp.is_checked_in ? `1px solid ${emp.color}44` : '1px solid rgba(255,255,255,0.06)',
          boxShadow: emp.is_checked_in ? `0 0 16px ${emp.color}18` : 'none',
        }}
      >
        <div
          className="w-12 h-12 rounded-full flex items-center justify-center text-base font-bold text-white"
          style={{ backgroundColor: emp.color,
            boxShadow: emp.is_checked_in ? `0 0 12px ${emp.color}55` : 'none' }}
        >
          {emp.name.charAt(0).toUpperCase()}
        </div>
        <span className="text-white font-medium text-sm text-center leading-tight">{emp.name}</span>
        <PresenceBadge checkedIn={emp.is_checked_in} />
      </button>
    )
  }

  return (
    <div className="w-full max-w-2xl mx-auto px-4">
      <div className="text-center mb-12">
        <Clock className="w-12 h-12 text-green-400 mx-auto mb-3" />
        <h1 className="text-3xl font-bold text-white">Zeiterfassung</h1>
        <p className="text-gray-500 mt-2 text-sm tracking-wide">Mitarbeiter auswählen</p>
      </div>

      {employees.length === 0 ? (
        <p className="text-center text-gray-500">Keine aktiven Mitarbeiter vorhanden.</p>
      ) : (
        <div className="flex flex-col items-center gap-8">
          {/* Manager — zentriert */}
          {managers.length > 0 && (
            <div className="flex flex-col items-center gap-4 w-full">
              <p className="text-[10px] font-semibold tracking-[0.2em] uppercase text-gray-600">
                Management
              </p>
              <div className="flex flex-wrap justify-center gap-4">
                {managers.map(emp => <ManagerCard key={emp.id} emp={emp} />)}
              </div>
            </div>
          )}

          {/* Trenner */}
          {managers.length > 0 && mitarbeiter.length > 0 && (
            <div className="flex items-center gap-4 w-full max-w-md">
              <div className="flex-1 h-px bg-gradient-to-r from-transparent to-gray-800" />
              <p className="text-[10px] font-semibold tracking-[0.2em] uppercase text-gray-600 shrink-0">
                Mitarbeiter
              </p>
              <div className="flex-1 h-px bg-gradient-to-l from-transparent to-gray-800" />
            </div>
          )}

          {/* Mitarbeiter — flex-wrap zentriert */}
          {mitarbeiter.length > 0 && (
            <div className="flex flex-wrap justify-center gap-4">
              {mitarbeiter.map(emp => <MitarbeiterCard key={emp.id} emp={emp} />)}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
