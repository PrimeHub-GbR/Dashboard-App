'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { MonthStats } from '@/lib/zeiterfassung/types'
import { currentBerlinYearMonth } from '@/lib/zeiterfassung/timezone'

export function useMonthStats(year?: number, month?: number) {
  const now = currentBerlinYearMonth()
  const targetYear = year ?? now.year
  const targetMonth = month ?? now.month

  const [stats, setStats] = useState<MonthStats[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const supabase = createClient()
      const { data, error: dbError } = await supabase.rpc('get_all_employees_month_hours', {
        p_year: targetYear,
        p_month: targetMonth,
      })

      if (dbError) throw new Error(dbError.message)

      const result: MonthStats[] = (data as {
        employee_id: string
        employee_name: string
        employee_color: string
        target_hours_per_month: number
        total_work_minutes: number
        total_break_minutes: number
        entry_count: number
      }[]).map((row) => {
        const netWorkMinutes = Math.max(0, row.total_work_minutes - row.total_break_minutes)
        const targetMinutes = Math.round(row.target_hours_per_month * 60)
        return {
          employee_id: row.employee_id,
          employee_name: row.employee_name,
          employee_color: row.employee_color,
          target_hours_per_month: row.target_hours_per_month,
          total_work_minutes: row.total_work_minutes,
          total_break_minutes: row.total_break_minutes,
          net_work_minutes: netWorkMinutes,
          target_minutes: targetMinutes,
          overtime_minutes: netWorkMinutes - targetMinutes,
          entry_count: row.entry_count,
        }
      })

      setStats(result)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Fehler beim Laden')
    } finally {
      setLoading(false)
    }
  }, [targetYear, targetMonth])

  useEffect(() => { load() }, [load])

  return { stats, loading, error, refresh: load }
}
