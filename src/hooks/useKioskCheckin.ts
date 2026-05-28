'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import type { KioskCheckinResult, ForgotCheckoutResponse, Employee } from '@/lib/zeiterfassung/types'

export type KioskStep =
  | 'select'
  | 'pin'
  | 'set_pin'
  | 'set_pin_confirm'
  | 'success'
  | 'personal'
  | 'change_pin_old'
  | 'change_pin_new'
  | 'change_pin_confirm'
  | 'change_pin_success'
  | 'forgot_checkout'

interface ForgotEntry {
  id: string
  checked_in_at: string
  max_hours: number
}

const KIOSK_TOKEN = process.env.NEXT_PUBLIC_KIOSK_TOKEN ?? ''
const PERSONAL_VIEW_SECONDS = 30

interface UseKioskCheckinOptions {
  onReset?: () => void
}

export function useKioskCheckin(opts?: UseKioskCheckinOptions) {
  const [step, setStep] = useState<KioskStep>('select')
  const [selectedEmployee, setSelectedEmployee] = useState<Pick<Employee, 'id' | 'name' | 'color'> | null>(null)
  const [pin, setPin] = useState('')
  const [firstPin, setFirstPin] = useState('') // gespeicherte erste PIN-Eingabe beim Set-PIN-Flow
  const [changeOldPin, setChangeOldPin] = useState('') // alte PIN beim PIN-ändern-Flow
  const [changeNewPin, setChangeNewPin] = useState('') // neue PIN beim PIN-ändern-Flow
  const [forgotEntry, setForgotEntry] = useState<ForgotEntry | null>(null) // vergessene Abmeldung
  const [result, setResult] = useState<KioskCheckinResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  // Prevent double submission
  const submitting = useRef(false)
  // Hold latest employee ref to avoid stale closure
  const employeeRef = useRef(selectedEmployee)
  useEffect(() => { employeeRef.current = selectedEmployee }, [selectedEmployee])

  // Ref für aktuellen Step (für appendDigit closure)
  const stepRef = useRef(step)
  useEffect(() => { stepRef.current = step }, [step])

  // Ref für firstPin
  const firstPinRef = useRef(firstPin)
  useEffect(() => { firstPinRef.current = firstPin }, [firstPin])

  // Refs für PIN-ändern-Flow (gegen Stale-Closures in appendDigit)
  const changeOldPinRef = useRef(changeOldPin)
  useEffect(() => { changeOldPinRef.current = changeOldPin }, [changeOldPin])
  const changeNewPinRef = useRef(changeNewPin)
  useEffect(() => { changeNewPinRef.current = changeNewPin }, [changeNewPin])

  // Refs für vergessene Abmeldung (forgotEntry + kurzlebige PIN, nie ins DOM)
  const forgotEntryRef = useRef(forgotEntry)
  useEffect(() => { forgotEntryRef.current = forgotEntry }, [forgotEntry])
  const resolvePinRef = useRef('')

  // Ref für onReset-Callback (gegen Stale-Closures)
  const onResetRef = useRef(opts?.onReset)
  useEffect(() => { onResetRef.current = opts?.onReset }, [opts?.onReset])

  const resetFull = useCallback(() => {
    setStep('select')
    setSelectedEmployee(null)
    setPin('')
    setFirstPin('')
    setChangeOldPin('')
    setChangeNewPin('')
    setForgotEntry(null)
    resolvePinRef.current = ''
    setResult(null)
    setError(null)
    setLoading(false)
    submitting.current = false
    onResetRef.current?.()
  }, [])

  // Normaler Check-in/out via Toggle
  const submitWithPin = useCallback(async (pinValue: string) => {
    const employee = employeeRef.current
    if (!employee || pinValue.length < 4 || submitting.current) return
    submitting.current = true
    setLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/zeiterfassung/toggle', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-kiosk-token': KIOSK_TOKEN,
        },
        body: JSON.stringify({ employee_id: employee.id, pin: pinValue }),
      })

      const json = await res.json() as (KioskCheckinResult | ForgotCheckoutResponse) & { error?: string }

      if (res.status === 428 && json.error === 'PIN_NOT_SET') {
        // PIN noch nicht gesetzt → in Set-PIN-Flow wechseln
        setPin('')
        setFirstPin('')
        setStep('set_pin')
        submitting.current = false
        setLoading(false)
        return
      }

      if (!res.ok) {
        setError(json.error ?? 'Unbekannter Fehler')
        setPin('')
        submitting.current = false
        return
      }

      // Vergessene Abmeldung erkannt → Korrektur-Dialog statt regulärem Checkout
      if (json.type === 'forgot_checkout') {
        setForgotEntry({
          id: json.open_entry.id,
          checked_in_at: json.open_entry.checked_in_at,
          max_hours: json.max_hours,
        })
        resolvePinRef.current = pinValue
        setPin('')
        setStep('forgot_checkout')
        submitting.current = false
        setLoading(false)
        return
      }

      setResult(json)
      setStep('success')
      setTimeout(() => setStep('personal'), 5000)
    } catch {
      setError('Verbindungsfehler — bitte erneut versuchen')
      setPin('')
      submitting.current = false
    } finally {
      setLoading(false)
    }
  }, [])

  // PIN setzen (erster Kiosk-Besuch oder nach Admin-Reset)
  const submitSetPin = useCallback(async (newPin: string, confirmPin: string) => {
    const employee = employeeRef.current
    if (!employee || submitting.current) return

    if (newPin !== confirmPin) {
      setError('PINs stimmen nicht überein — bitte erneut versuchen')
      setPin('')
      setFirstPin('')
      setStep('set_pin')
      return
    }

    submitting.current = true
    setLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/zeiterfassung/set-pin', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-kiosk-token': KIOSK_TOKEN,
        },
        body: JSON.stringify({ employee_id: employee.id, pin: newPin }),
      })

      const json = await res.json() as { success?: boolean; error?: string }

      if (!res.ok) {
        setError(json.error ?? 'PIN konnte nicht gespeichert werden')
        setPin('')
        setFirstPin('')
        setStep('set_pin')
        submitting.current = false
        setLoading(false)
        return
      }

      // PIN gesetzt → jetzt normal einstempeln
      submitting.current = false
      setLoading(false)
      await submitWithPin(newPin)
    } catch {
      setError('Verbindungsfehler — bitte erneut versuchen')
      setPin('')
      setFirstPin('')
      setStep('set_pin')
      submitting.current = false
      setLoading(false)
    }
  }, [submitWithPin])

  // PIN ändern (alte PIN → neue PIN, als Ergänzung zum Admin-Reset)
  const submitChangePin = useCallback(async (oldPin: string, newPin: string, confirmPin: string) => {
    const employee = employeeRef.current
    if (!employee || submitting.current) return

    if (newPin !== confirmPin) {
      setError('Neue PINs stimmen nicht überein — bitte erneut versuchen')
      setPin('')
      setChangeNewPin('')
      setStep('change_pin_new')
      return
    }

    submitting.current = true
    setLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/zeiterfassung/change-pin', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-kiosk-token': KIOSK_TOKEN,
        },
        body: JSON.stringify({ employee_id: employee.id, old_pin: oldPin, new_pin: newPin }),
      })

      const json = await res.json() as { success?: boolean; error?: string }

      if (res.status === 401) {
        // Alte PIN falsch → Flow von vorne beginnen
        setError('Alte PIN ist falsch')
        setPin('')
        setChangeOldPin('')
        setChangeNewPin('')
        setStep('change_pin_old')
        submitting.current = false
        setLoading(false)
        return
      }

      if (!res.ok) {
        setError(json.error ?? 'PIN konnte nicht geändert werden')
        setPin('')
        setChangeNewPin('')
        setStep('change_pin_new')
        submitting.current = false
        setLoading(false)
        return
      }

      // Erfolg → kurzer Bestätigungs-Screen, dann zurück zur PIN-Eingabe
      setPin('')
      setChangeOldPin('')
      setChangeNewPin('')
      setStep('change_pin_success')
      submitting.current = false
      setLoading(false)
      setTimeout(() => setStep('pin'), 2000)
    } catch {
      setError('Verbindungsfehler — bitte erneut versuchen')
      setPin('')
      setChangeNewPin('')
      setStep('change_pin_new')
      submitting.current = false
      setLoading(false)
    }
  }, [])

  // Vergessene Abmeldung auflösen: echte Endzeit nachtragen, dann ggf. neu einstempeln
  const submitResolve = useCallback(async (actualCheckoutISO: string, startNewShift: boolean) => {
    const employee = employeeRef.current
    const entry = forgotEntryRef.current
    if (!employee || !entry || submitting.current) return
    submitting.current = true
    setLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/zeiterfassung/resolve-checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-kiosk-token': KIOSK_TOKEN,
        },
        body: JSON.stringify({
          employee_id: employee.id,
          pin: resolvePinRef.current,
          entry_id: entry.id,
          actual_checkout: actualCheckoutISO,
          acknowledged: true,
          start_new_shift: startNewShift,
        }),
      })

      const json = await res.json() as KioskCheckinResult & { error?: string }

      if (!res.ok) {
        setError(json.error ?? 'Korrektur fehlgeschlagen')
        submitting.current = false
        setLoading(false)
        return
      }

      resolvePinRef.current = ''
      setForgotEntry(null)
      setResult(json)
      setStep('success')
      submitting.current = false
      setLoading(false)
      setTimeout(() => setStep('personal'), 5000)
    } catch {
      setError('Verbindungsfehler — bitte erneut versuchen')
      submitting.current = false
      setLoading(false)
    }
  }, [])

  // Refs auf aktuelle Versionen
  const submitRef = useRef(submitWithPin)
  useEffect(() => { submitRef.current = submitWithPin }, [submitWithPin])

  const submitSetPinRef = useRef(submitSetPin)
  useEffect(() => { submitSetPinRef.current = submitSetPin }, [submitSetPin])

  const submitChangePinRef = useRef(submitChangePin)
  useEffect(() => { submitChangePinRef.current = submitChangePin }, [submitChangePin])

  const selectEmployee = useCallback((emp: Pick<Employee, 'id' | 'name' | 'color'>, pinIsSet = true) => {
    setSelectedEmployee(emp)
    setPin('')
    setFirstPin('')
    setError(null)
    submitting.current = false
    // Direkt zum PIN-Setup wenn noch keine PIN hinterlegt
    setStep(pinIsSet ? 'pin' : 'set_pin')
  }, [])

  const appendDigit = useCallback((digit: string) => {
    setError(null)
    setPin(prev => {
      if (prev.length >= 8) return prev
      const next = prev + digit
      const currentStep = stepRef.current

      if (next.length === 4) {
        if (currentStep === 'pin') {
          // Normaler Check-in/out
          setTimeout(() => submitRef.current(next), 50)
        } else if (currentStep === 'set_pin') {
          // Erste PIN-Eingabe abgeschlossen → zur Bestätigung wechseln
          setTimeout(() => {
            setFirstPin(next)
            setPin('')
            setStep('set_pin_confirm')
          }, 50)
          return next
        } else if (currentStep === 'set_pin_confirm') {
          // Bestätigung abgeschlossen → PINs vergleichen und setzen
          setTimeout(() => submitSetPinRef.current(firstPinRef.current, next), 50)
        } else if (currentStep === 'change_pin_old') {
          // Alte PIN eingegeben → neue PIN vergeben
          setTimeout(() => {
            setChangeOldPin(next)
            setPin('')
            setStep('change_pin_new')
          }, 50)
          return next
        } else if (currentStep === 'change_pin_new') {
          // Neue PIN eingegeben → bestätigen
          setTimeout(() => {
            setChangeNewPin(next)
            setPin('')
            setStep('change_pin_confirm')
          }, 50)
          return next
        } else if (currentStep === 'change_pin_confirm') {
          // Bestätigung abgeschlossen → an Server senden
          setTimeout(() => submitChangePinRef.current(changeOldPinRef.current, changeNewPinRef.current, next), 50)
        }
      }
      return next
    })
  }, [])

  const deleteDigit = useCallback(() => {
    setPin(prev => prev.slice(0, -1))
    setError(null)
  }, [])

  // Im set_pin_confirm-Step: zurück zur ersten Eingabe
  const backToSetPin = useCallback(() => {
    setPin('')
    setFirstPin('')
    setError(null)
    setStep('set_pin')
  }, [])

  // PIN-ändern-Flow starten (vom pin-Screen)
  const startChangePin = useCallback(() => {
    setPin('')
    setChangeOldPin('')
    setChangeNewPin('')
    setError(null)
    submitting.current = false
    setStep('change_pin_old')
  }, [])

  // Im change_pin_confirm-Step: zurück zur Neueingabe
  const backToChangeNew = useCallback(() => {
    setPin('')
    setChangeNewPin('')
    setError(null)
    setStep('change_pin_new')
  }, [])

  return {
    step,
    selectedEmployee,
    pin,
    result,
    error,
    loading,
    forgotEntry,
    personalViewSeconds: PERSONAL_VIEW_SECONDS,
    selectEmployee,
    appendDigit,
    deleteDigit,
    backToSetPin,
    startChangePin,
    backToChangeNew,
    submitResolve,
    reset: resetFull,
  }
}
