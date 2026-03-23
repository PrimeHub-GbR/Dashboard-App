'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { LiveCheckin } from '@/lib/zeiterfassung/types'

export function useLiveCheckins() {
  const [checkins, setCheckins] = useState<LiveCheckin[]>([])
  const [loading, setLoading] = useState(true)

  const fetchOpenEntries = useCallback(async () => {
    const supabase = createClient()
    const { data, error } = await supabase
      .from('time_entries')
      .select('id, employee_id, checked_in_at, employees(id, name, color)')
      .is('checked_out_at', null)
      .order('checked_in_at', { ascending: true })

    if (error || !data) return

    const now = Date.now()
    const result: LiveCheckin[] = data.map((row) => {
      const emp = Array.isArray(row.employees) ? row.employees[0] : row.employees
      const durationMinutes = Math.floor(
        (now - new Date(row.checked_in_at).getTime()) / 60_000
      )
      return {
        entry_id: row.id,
        employee_id: row.employee_id,
        employee_name: emp?.name ?? 'Unbekannt',
        employee_color: emp?.color ?? '#22c55e',
        checked_in_at: row.checked_in_at,
        duration_minutes: durationMinutes,
        arbzg_warning: durationMinutes >= 360,
      }
    })

    setCheckins(result)
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchOpenEntries()

    const supabase = createClient()
    const channel = supabase
      .channel('live-checkins')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'time_entries' },
        () => fetchOpenEntries()
      )
      .subscribe()

    // Polling-Fallback alle 10s (für ArbZG-Timer und Verbindungsunterbrechungen)
    const interval = setInterval(fetchOpenEntries, 10_000)

    return () => {
      supabase.removeChannel(channel)
      clearInterval(interval)
    }
  }, [fetchOpenEntries])

  return { checkins, loading, refresh: fetchOpenEntries }
}
