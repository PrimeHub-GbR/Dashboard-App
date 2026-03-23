'use client'

import { useKioskCheckin } from '@/hooks/useKioskCheckin'
import { formatTimeBerlin, formatDuration, currentBerlinYearMonth } from '@/lib/zeiterfassung/timezone'
import type { Employee } from '@/lib/zeiterfassung/types'
import { CheckCircle, Delete, Clock, AlertTriangle, TrendingUp, TrendingDown, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useEffect, useState } from 'react'

const KIOSK_TOKEN = process.env.NEXT_PUBLIC_KIOSK_TOKEN ?? ''
const PERSONAL_VIEW_SECONDS = 3 * 60

interface PersonalStats {
  total_work_minutes: number
  total_break_minutes: number
  entry_count: number
  target_hours_per_month: number
}

function PersonalView({
  employee,
  onExit,
}: {
  employee: Pick<Employee, 'id' | 'name' | 'color'>
  onExit: () => void
}) {
  const [countdown, setCountdown] = useState(PERSONAL_VIEW_SECONDS)
  const [stats, setStats] = useState<PersonalStats | null>(null)

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
      .then((j: { monthStats: { total_work_minutes: number; total_break_minutes: number; entry_count: number }; employee: { target_hours_per_month: number } }) => {
        setStats({ ...j.monthStats, target_hours_per_month: j.employee?.target_hours_per_month ?? 0 })
      })
      .catch(() => { /* ignore */ })
  }, [employee.id, year, month])

  // Null-safe Berechnungen
  const netMinutes = stats ? Math.max(0, (stats.total_work_minutes ?? 0) - (stats.total_break_minutes ?? 0)) : 0
  const targetMinutes = stats ? (stats.target_hours_per_month ?? 0) * 60 : 0
  const diff = netMinutes - targetMinutes
  const hasData = netMinutes > 0
  const progressPct = targetMinutes > 0 && hasData ? Math.min(100, Math.round((netMinutes / targetMinutes) * 100)) : 0

  // Erwarteter Fortschritt basierend auf aktuellem Tag im Monat
  const today = new Date()
  const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate()
  const currentDay = today.getDate()
  const expectedPct = Math.round((currentDay / daysInMonth) * 100)
  const pctDiff = progressPct - expectedPct
  const contextMsg = hasData && targetMinutes > 0
    ? pctDiff >= 5
      ? `Gut dabei — du liegst ${pctDiff}% vor dem Tagesziel`
      : pctDiff <= -5
      ? `Du liegst ${Math.abs(pctDiff)}% hinter dem Tagesziel`
      : `Du liegst genau im Plan`
    : null

  const mm = String(Math.floor(countdown / 60)).padStart(2, '0')
  const ss = String(countdown % 60).padStart(2, '0')

  return (
    <div className="flex flex-col items-center gap-5 max-w-sm mx-auto px-4 w-full text-center">
      {/* Avatar + Begrüßung */}
      <div className="flex flex-col items-center gap-3">
        <div
          className="w-20 h-20 rounded-full flex items-center justify-center text-3xl font-bold text-white shadow-lg"
          style={{ backgroundColor: employee.color }}
        >
          {employee.name.charAt(0).toUpperCase()}
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white">Hallo, {employee.name}!</h1>
          <p className="text-gray-400 text-sm mt-0.5">Monatsübersicht · {month}/{year}</p>
        </div>
      </div>

      {/* Stats */}
      {stats === null ? (
        <div className="w-full h-28 bg-gray-900 rounded-xl animate-pulse" />
      ) : (
        <>
          <div className="grid grid-cols-3 gap-3 w-full">
            {/* Ist */}
            <div className="bg-gray-900 rounded-xl p-3">
              <p className="text-xs text-gray-500 mb-1">Ist</p>
              <p className="text-lg font-bold text-white">
                {hasData ? formatDuration(netMinutes) : <span className="text-gray-600 text-base">—</span>}
              </p>
            </div>
            {/* Soll */}
            <div className="bg-gray-900 rounded-xl p-3">
              <p className="text-xs text-gray-500 mb-1">Soll</p>
              <p className="text-lg font-bold text-white">
                {targetMinutes > 0 ? `${stats.target_hours_per_month}h` : <span className="text-gray-600 text-base">—</span>}
              </p>
            </div>
            {/* Diff */}
            <div className="bg-gray-900 rounded-xl p-3">
              <p className="text-xs text-gray-500 mb-1">Diff</p>
              {hasData && targetMinutes > 0 ? (
                <p className={`text-lg font-bold flex items-center justify-center gap-0.5 ${diff >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {diff >= 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                  {diff >= 0 ? '+' : ''}{formatDuration(Math.abs(diff))}
                </p>
              ) : (
                <p className="text-gray-600 text-base">—</p>
              )}
            </div>
          </div>

          {/* Fortschrittsbalken — nur wenn Daten vorhanden */}
          {targetMinutes > 0 && (
            <div className="w-full space-y-1.5">
              <div className="h-2.5 bg-gray-800 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${progressPct}%`, backgroundColor: employee.color }}
                />
              </div>
              <div className="flex justify-between text-xs text-gray-600">
                <span>
                  {hasData ? `${progressPct}% des Monatsziels` : 'Noch keine Stunden erfasst'}
                </span>
                <span>{(stats.entry_count ?? 0) > 0 ? `${stats.entry_count} Buchungen` : ''}</span>
              </div>
            </div>
          )}

          {/* Kontext-Hinweis */}
          {contextMsg && (
            <div className={`w-full rounded-xl px-4 py-2.5 text-sm font-medium ${
              pctDiff >= 5 ? 'bg-green-500/10 text-green-400' :
              pctDiff <= -5 ? 'bg-red-500/10 text-red-400' :
              'bg-gray-800 text-gray-400'
            }`}>
              {contextMsg}
            </div>
          )}
        </>
      )}

      {/* Großer Exit-Button + Countdown */}
      <div className="w-full flex flex-col items-center gap-2 pt-1">
        <button
          onClick={onExit}
          className="w-full flex items-center justify-center gap-3 rounded-2xl py-5 text-white font-semibold text-lg transition-all active:scale-95"
          style={{ backgroundColor: employee.color }}
        >
          <X className="w-6 h-6" />
          Beenden
        </button>
        <p className="text-gray-700 text-xs">Automatisch in {mm}:{ss}</p>
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
    selectEmployee,
    appendDigit,
    deleteDigit,
    submit,
    reset,
  } = useKioskCheckin()

  if (step === 'personal' && selectedEmployee) {
    return <PersonalView employee={selectedEmployee} onExit={reset} />
  }

  if (step === 'result' && result) {
    return (
      <div className="flex flex-col items-center gap-6 text-center max-w-sm mx-auto px-4">
        <CheckCircle className="w-20 h-20 text-green-400" />
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">
            {result.type === 'checkin'
              ? `Willkommen, ${result.employee_name}!`
              : `Tschüss, ${result.employee_name}!`}
          </h1>
          {result.type === 'checkin' ? (
            <p className="text-gray-400 text-lg">
              Eingestempelt um {formatTimeBerlin(result.checked_in_at)} Uhr
            </p>
          ) : (
            <div className="space-y-1">
              <p className="text-gray-400 text-lg">
                Arbeitszeit: <span className="text-white font-semibold">{formatDuration(result.net_minutes ?? 0)}</span>
              </p>
              {(result.break_minutes ?? 0) > 0 && (
                <p className="text-gray-500 text-sm">
                  inkl. {result.break_minutes} Min. Pause (ArbZG § 4)
                </p>
              )}
            </div>
          )}
        </div>
        <p className="text-gray-600 text-sm">Fenster schließt automatisch…</p>
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
          <p className="text-gray-400 mt-1">PIN eingeben</p>
        </div>

        {/* PIN-Anzeige */}
        <div className="flex gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className={`w-4 h-4 rounded-full border-2 ${
                i < pin.length ? 'bg-green-400 border-green-400' : 'border-gray-600'
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
                  className="h-16 rounded-2xl bg-gray-800 text-white flex items-center justify-center active:scale-95 transition-transform"
                >
                  <Delete className="w-6 h-6" />
                </button>
              )
            }
            return (
              <button
                key={i}
                onClick={() => appendDigit(key)}
                className="h-16 rounded-2xl bg-gray-800 hover:bg-gray-700 text-white text-2xl font-semibold active:scale-95 transition-transform"
              >
                {key}
              </button>
            )
          })}
        </div>

        {/* Aktions-Buttons */}
        <div className="flex flex-col gap-3 w-full">
          <Button
            onClick={() => submit(false)}
            disabled={pin.length < 4 || loading}
            className="h-14 text-lg bg-green-600 hover:bg-green-500 text-white font-semibold"
          >
            {loading ? 'Bitte warten…' : 'Einstempeln'}
          </Button>
          <Button
            onClick={() => submit(true)}
            disabled={pin.length < 4 || loading}
            variant="outline"
            className="h-14 text-lg border-gray-600 text-gray-300 hover:text-white hover:bg-gray-800"
          >
            Ausstempeln
          </Button>
          <button
            onClick={reset}
            className="text-gray-500 text-sm hover:text-gray-300 mt-1"
          >
            Zurück zur Auswahl
          </button>
        </div>
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
