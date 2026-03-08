import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import type { Job } from '@/lib/job-types'
import { useJobPolling } from './useJobPolling'

interface UseRepricerJobsReturn {
  jobs: Job[]
  isLoading: boolean
  error: string | null
  refresh: () => Promise<void>
}

const THIRTY_DAYS_AGO = () => {
  const d = new Date()
  d.setDate(d.getDate() - 30)
  return d.toISOString()
}

export function useRepricerJobs(): UseRepricerJobsReturn {
  const [jobs, setJobs] = useState<Job[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isRealtimeConnected, setIsRealtimeConnected] = useState(false)

  const refresh = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data, error: fetchError } = await supabase
      .from('jobs')
      .select('*')
      .eq('workflow_key', 'repricer-updater')
      .eq('user_id', user.id)
      .gte('created_at', THIRTY_DAYS_AGO())
      .order('created_at', { ascending: false })
      .limit(20)

    if (fetchError) {
      setError('Repricer-Jobs konnten nicht geladen werden')
      return
    }

    setJobs(data as Job[])
  }, [])

  // Initial fetch
  useEffect(() => {
    refresh().finally(() => setIsLoading(false))
  }, [refresh])

  // Supabase Realtime subscription filtered to repricer-updater
  useEffect(() => {
    const channel = supabase
      .channel('repricer-jobs-changes')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'jobs',
          filter: 'workflow_key=eq.repricer-updater',
        },
        (payload) => {
          const newJob = payload.new as Job
          setJobs((prev) => [newJob, ...prev])
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'jobs',
          filter: 'workflow_key=eq.repricer-updater',
        },
        (payload) => {
          const updated = payload.new as Job
          setJobs((prev) => prev.map((j) => (j.id === updated.id ? updated : j)))

          if (updated.status === 'success') {
            toast.success('Repricer-Job abgeschlossen — Download verfuegbar')
          } else if (updated.status === 'failed') {
            toast.error(`Repricer-Job fehlgeschlagen: ${updated.error_message ?? 'Unbekannter Fehler'}`)
          } else if (updated.status === 'timeout') {
            toast.warning('Repricer-Job: Timeout nach 10 Minuten')
          }
        }
      )
      .subscribe((status) => {
        setIsRealtimeConnected(status === 'SUBSCRIBED')
      })

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  // Polling fallback when Realtime is not connected
  useJobPolling({
    enabled: !isRealtimeConnected,
    onPoll: refresh,
    intervalMs: 3000,
  })

  return { jobs, isLoading, error, refresh }
}
