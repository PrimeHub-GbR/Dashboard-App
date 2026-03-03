import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import type { Job } from '@/lib/job-types'
import { useJobPolling } from './useJobPolling'

interface UseJobsReturn {
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

export function useJobs(): UseJobsReturn {
  const [jobs, setJobs] = useState<Job[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isRealtimeConnected, setIsRealtimeConnected] = useState(false)

  const refresh = useCallback(async () => {
    const { data, error: fetchError } = await supabase
      .from('jobs')
      .select('*')
      .gte('created_at', THIRTY_DAYS_AGO())
      .order('created_at', { ascending: false })
      .limit(200)

    if (fetchError) {
      setError('Jobs konnten nicht geladen werden')
      return
    }

    setJobs(data as Job[])
  }, [])

  // Initial fetch
  useEffect(() => {
    refresh().finally(() => setIsLoading(false))
  }, [refresh])

  // Supabase Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel('jobs-changes')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'jobs' },
        (payload) => {
          const newJob = payload.new as Job
          setJobs((prev) => [newJob, ...prev])
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'jobs' },
        (payload) => {
          const updated = payload.new as Job
          setJobs((prev) => prev.map((j) => (j.id === updated.id ? updated : j)))

          if (updated.status === 'success') {
            toast.success('Job abgeschlossen — Download verfügbar')
          } else if (updated.status === 'failed') {
            toast.error(`Job fehlgeschlagen: ${updated.error_message ?? 'Unbekannter Fehler'}`)
          } else if (updated.status === 'timeout') {
            toast.warning('Job-Timeout nach 5 Minuten')
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
