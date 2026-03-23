'use client'

import { useEffect, useState, useCallback } from 'react'
import type { Employee } from '@/lib/zeiterfassung/types'

export function useEmployees() {
  const [employees, setEmployees] = useState<Omit<Employee, 'pin'>[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/zeiterfassung/employees')
      if (!res.ok) throw new Error('Fehler beim Laden der Mitarbeiter')
      const json = await res.json() as { employees: Omit<Employee, 'pin'>[] }
      setEmployees(json.employees)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unbekannter Fehler')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const createEmployee = useCallback(async (data: {
    name: string
    pin: string
    color: string
    target_hours_per_month: number
  }) => {
    const res = await fetch('/api/zeiterfassung/employees', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    if (!res.ok) {
      const err = await res.json() as { error: unknown }
      throw new Error(JSON.stringify(err.error))
    }
    await load()
    return res.json()
  }, [load])

  const updateEmployee = useCallback(async (id: string, data: Partial<{
    name: string
    pin: string
    color: string
    target_hours_per_month: number
    is_active: boolean
  }>) => {
    const res = await fetch(`/api/zeiterfassung/employees/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    if (!res.ok) throw new Error('Aktualisierung fehlgeschlagen')
    await load()
  }, [load])

  const deleteEmployee = useCallback(async (id: string) => {
    const res = await fetch(`/api/zeiterfassung/employees/${id}`, { method: 'DELETE' })
    if (!res.ok) throw new Error('Löschen fehlgeschlagen')
    await load()
  }, [load])

  return { employees, loading, error, refresh: load, createEmployee, updateEmployee, deleteEmployee }
}
