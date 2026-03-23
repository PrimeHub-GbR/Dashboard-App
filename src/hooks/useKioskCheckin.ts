'use client'

import { useState, useCallback } from 'react'
import type { KioskCheckinResult, Employee } from '@/lib/zeiterfassung/types'

type KioskStep = 'select' | 'pin' | 'result'

const KIOSK_TOKEN = process.env.NEXT_PUBLIC_KIOSK_TOKEN ?? ''

export function useKioskCheckin() {
  const [step, setStep] = useState<KioskStep>('select')
  const [selectedEmployee, setSelectedEmployee] = useState<Pick<Employee, 'id' | 'name' | 'color'> | null>(null)
  const [pin, setPin] = useState('')
  const [result, setResult] = useState<KioskCheckinResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const selectEmployee = useCallback((emp: Pick<Employee, 'id' | 'name' | 'color'>) => {
    setSelectedEmployee(emp)
    setPin('')
    setError(null)
    setStep('pin')
  }, [])

  const appendDigit = useCallback((digit: string) => {
    setPin(prev => prev.length < 8 ? prev + digit : prev)
    setError(null)
  }, [])

  const deleteDigit = useCallback(() => {
    setPin(prev => prev.slice(0, -1))
    setError(null)
  }, [])

  const submit = useCallback(async (isCheckout: boolean) => {
    if (!selectedEmployee || pin.length < 4) return
    setLoading(true)
    setError(null)

    const endpoint = isCheckout ? '/api/zeiterfassung/checkout' : '/api/zeiterfassung/checkin'

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-kiosk-token': KIOSK_TOKEN,
        },
        body: JSON.stringify({ employee_id: selectedEmployee.id, pin }),
      })

      const json = await res.json() as KioskCheckinResult & { error?: string }

      if (!res.ok) {
        setError(json.error ?? 'Unbekannter Fehler')
        setPin('')
        return
      }

      setResult(json)
      setStep('result')

      // Nach 4 Sekunden zurücksetzen
      setTimeout(() => {
        setStep('select')
        setSelectedEmployee(null)
        setPin('')
        setResult(null)
        setError(null)
      }, 4000)
    } catch {
      setError('Verbindungsfehler — bitte erneut versuchen')
      setPin('')
    } finally {
      setLoading(false)
    }
  }, [selectedEmployee, pin])

  const reset = useCallback(() => {
    setStep('select')
    setSelectedEmployee(null)
    setPin('')
    setResult(null)
    setError(null)
  }, [])

  return {
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
  }
}
