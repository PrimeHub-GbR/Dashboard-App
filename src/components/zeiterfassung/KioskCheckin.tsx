'use client'

import { useKioskCheckin } from '@/hooks/useKioskCheckin'
import { formatTimeBerlin, formatDuration } from '@/lib/zeiterfassung/timezone'
import type { Employee } from '@/lib/zeiterfassung/types'
import { CheckCircle, Delete, Clock, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'

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
