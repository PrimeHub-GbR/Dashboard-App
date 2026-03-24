'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import type { KioskCheckinResult, Employee } from '@/lib/zeiterfassung/types'

export type KioskStep = 'select' | 'pin' | 'set_pin' | 'set_pin_confirm' | 'success' | 'personal'

const KIOSK_TOKEN = process.env.NEXT_PUBLIC_KIOSK_TOKEN ?? ''
const PERSONAL_VIEW_SECONDS = 30

export function useKioskCheckin() {
  const [step, setStep] = useState<KioskStep>('select')
  const [selectedEmployee, setSelectedEmployee] = useState<Pick<Employee, 'id' | 'name' | 'color'> | null>(null)
  const [pin, setPin] = useState('')
  const [firstPin, setFirstPin] = useState('') // gespeicherte erste PIN-Eingabe beim Set-PIN-Flow
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

  const resetFull = useCallback(() => {
    setStep('select')
    setSelectedEmployee(null)
    setPin('')
    setFirstPin('')
    setResult(null)
    setError(null)
    setLoading(false)
    submitting.current = false
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

      const json = await res.json() as KioskCheckinResult & { error?: string }

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

  // Refs auf aktuelle Versionen
  const submitRef = useRef(submitWithPin)
  useEffect(() => { submitRef.current = submitWithPin }, [submitWithPin])

  const submitSetPinRef = useRef(submitSetPin)
  useEffect(() => { submitSetPinRef.current = submitSetPin }, [submitSetPin])

  const selectEmployee = useCallback((emp: Pick<Employee, 'id' | 'name' | 'color'>) => {
    setSelectedEmployee(emp)
    setPin('')
    setFirstPin('')
    setError(null)
    submitting.current = false
    setStep('pin')
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

  return {
    step,
    selectedEmployee,
    pin,
    result,
    error,
    loading,
    personalViewSeconds: PERSONAL_VIEW_SECONDS,
    selectEmployee,
    appendDigit,
    deleteDigit,
    backToSetPin,
    reset: resetFull,
  }
}
