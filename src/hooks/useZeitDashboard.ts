'use client'

import { useEffect, useState, useCallback } from 'react'
import { currentBerlinYearMonth } from '@/lib/zeiterfassung/timezone'

interface DailyRow {
  work_date: string
  employee_id: string
  employee_name: string
  employee_color: string
  gross_minutes: number
  break_minutes: number
  net_minutes: number
  entry_count: number
}

interface MonthRow {
  employee_id: string
  employee_name: string
  employee_color: string
  target_hours_per_month: number
  total_work_minutes: number
  total_break_minutes: number
  entry_count: number
}

interface RecentEntry {
  id: string
  employee_id: string
  checked_in_at: string
  checked_out_at: string | null
  break_minutes: number
  employees: { id: string; name: string; color: string } | null
}

interface DashboardData {
  daily: DailyRow[]
  month: MonthRow[]
  live_count: number
  recent: RecentEntry[]
}

export function useZeitDashboard(year?: number, month?: number) {
  const now = currentBerlinYearMonth()
  const y = year ?? now.year
  const m = month ?? now.month

  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/zeiterfassung/dashboard?year=${y}&month=${m}`)
      if (res.ok) {
        const json = await res.json() as DashboardData
        setData(json)
      }
    } finally {
      setLoading(false)
    }
  }, [y, m])

  useEffect(() => { load() }, [load])

  return { data, loading, refresh: load }
}
