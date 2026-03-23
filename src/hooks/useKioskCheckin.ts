'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import type { KioskCheckinResult, Employee } from '@/lib/zeiterfassung/types'

type KioskStep = 'select' | 'pin' | 'success' | 'personal'

const KIOSK_TOKEN = process.env.NEXT_PUBLIC_KIOSK_TOKEN ?? ''
const PERSONAL_VIEW_SECONDS = 30

export function useKioskCheckin() {
  const [step, setStep] = useState<KioskStep>('select')
  const [selectedEmployee, setSelectedEmployee] = useState<Pick<Employee, 'id' | 'name' | 'color'> | null>(null)
  const [pin, setPin] = useState('')
  const [result, setResult] = useState<KioskCheckinResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  // Prevent double submission
  const submitting = useRef(false)
  // Hold latest employee ref to avoid stale closure
  const employeeRef = useRef(selectedEmployee)
  useEffect(() => { employeeRef.current = selectedEmployee }, [selectedEmployee])

  const resetFull = useCallback(() => {
    setStep('select')
    setSelectedEmployee(null)
    setPin('')
    setResult(null)
    setError(null)
    setLoading(false)
    submitting.current = false
  }, [])

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

      if (!res.ok) {
        setError(json.error ?? 'Unbekannter Fehler')
        setPin('')
        submitting.current = false
        return
      }

      setResult(json)
      setStep('success')

      // Nach 10s: Personal View zeigen
      setTimeout(() => setStep('personal'), 10000)

      // Nach 10s + 30s: Auto-Reset
      setTimeout(() => resetFull(), (10 + PERSONAL_VIEW_SECONDS) * 1000)
    } catch {
      setError('Verbindungsfehler — bitte erneut versuchen')
      setPin('')
      submitting.current = false
    } finally {
      setLoading(false)
    }
  }, [resetFull])

  // Ref to always have the latest submitWithPin
  const submitRef = useRef(submitWithPin)
  useEffect(() => { submitRef.current = submitWithPin }, [submitWithPin])

  const selectEmployee = useCallback((emp: Pick<Employee, 'id' | 'name' | 'color'>) => {
    setSelectedEmployee(emp)
    setPin('')
    setError(null)
    submitting.current = false
    setStep('pin')
  }, [])

  const appendDigit = useCallback((digit: string) => {
    setError(null)
    setPin(prev => {
      if (prev.length >= 8) return prev
      const next = prev + digit
      // Auto-submit when 4 digits reached
      if (next.length === 4) {
        setTimeout(() => submitRef.current(next), 50)
      }
      return next
    })
  }, [])

  const deleteDigit = useCallback(() => {
    setPin(prev => prev.slice(0, -1))
    setError(null)
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
    reset: resetFull,
  }
}
