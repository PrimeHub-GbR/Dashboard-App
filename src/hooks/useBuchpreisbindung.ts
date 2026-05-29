'use client'

import { useState, useEffect, useCallback, useRef } from 'react'

export interface BuchpreischeckSeller {
  id: string
  user_id: string
  amazon_seller_id: string
  seller_name: string | null
  is_active: boolean
  schedule_mode: 'weekly' | 'interval'
  run_time: string
  interval_minutes: number
  active_weekdays: string[]
  max_pages: number | null
  next_run_at: string | null
  last_run_at: string | null
  created_at: string
}

export interface BuchpreischeckRun {
  id: string
  seller_id: string
  amazon_seller_id: string
  status: 'running' | 'success' | 'failed' | 'timeout'
  triggered_by: 'scheduler' | 'manual'
  total_items: number | null
  violations_count: number | null
  excel_file_path: string | null
  error_message: string | null
  proxy_bytes: number | null
  pages_scraped: number | null
  scrapeops_credits: number | null
  started_at: string
  completed_at: string | null
  created_at: string
}

export interface BuchpreischeckItem {
  id: string
  run_id: string
  isbn13: string
  asin: string | null
  title: string | null
  amazon_price: number | null
  vlb_price: number | null
  amazon_url: string | null
  is_compliant: boolean | null
  created_at: string
}

export function useSellers() {
  const [sellers, setSellers] = useState<BuchpreischeckSeller[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetch_ = useCallback(async () => {
    try {
      const res = await fetch('/api/buchpreisbindung/sellers')
      if (!res.ok) throw new Error('Fehler beim Laden')
      setSellers(await res.json())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Fehler')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => { fetch_() }, [fetch_])

  const addSeller = useCallback(async (payload: {
    amazon_seller_id: string
    seller_name?: string
    schedule_mode: 'weekly' | 'interval'
    run_time: string
    interval_minutes: number
    active_weekdays: string[]
    max_pages: number | null
  }) => {
    const res = await fetch('/api/buchpreisbindung/sellers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error ?? 'Fehler')
    setSellers(prev => [data, ...prev])
    return data as BuchpreischeckSeller
  }, [])

  const updateSeller = useCallback(async (id: string, updates: Partial<BuchpreischeckSeller>) => {
    const res = await fetch(`/api/buchpreisbindung/sellers/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error ?? 'Fehler')
    setSellers(prev => prev.map(s => s.id === id ? data : s))
    return data as BuchpreischeckSeller
  }, [])

  const deleteSeller = useCallback(async (id: string) => {
    const res = await fetch(`/api/buchpreisbindung/sellers/${id}`, { method: 'DELETE' })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error ?? 'Fehler')
    setSellers(prev => prev.filter(s => s.id !== id))
  }, [])

  const clearSellerRuns = useCallback(async (id: string) => {
    const res = await fetch(`/api/buchpreisbindung/sellers/${id}/runs`, { method: 'DELETE' })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error ?? 'Fehler')
    setSellers(prev => prev.map(s => s.id === id ? { ...s, last_run_at: null } : s))
    return data as { ok: boolean; deletedRuns: number }
  }, [])

  return { sellers, isLoading, error, addSeller, updateSeller, deleteSeller, clearSellerRuns, refetch: fetch_ }
}

export function useRuns(sellerId: string | null) {
  const [runs, setRuns] = useState<BuchpreischeckRun[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetch_ = useCallback(async () => {
    if (!sellerId) return
    setIsLoading(true)
    try {
      const res = await fetch(`/api/buchpreisbindung/runs?seller_id=${sellerId}`)
      if (res.ok) setRuns(await res.json())
    } finally {
      setIsLoading(false)
    }
  }, [sellerId])

  useEffect(() => {
    if (!sellerId) { setRuns([]); return }
    fetch_()
  }, [sellerId, fetch_])

  // Poll every 2s while running, stop when done
  useEffect(() => {
    const hasRunning = runs.some(r => r.status === 'running')
    if (hasRunning && !pollingRef.current) {
      pollingRef.current = setInterval(fetch_, 2000)
    } else if (!hasRunning && pollingRef.current) {
      clearInterval(pollingRef.current)
      pollingRef.current = null
    }
    return () => {
      if (pollingRef.current) { clearInterval(pollingRef.current); pollingRef.current = null }
    }
  }, [runs, fetch_])

  return { runs, isLoading, refetch: fetch_, setRuns }
}

export function useLastRunItems(runId: string | null) {
  const [items, setItems] = useState<BuchpreischeckItem[]>([])
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    if (!runId) { setItems([]); return }
    setIsLoading(true)
    fetch(`/api/buchpreisbindung/runs/${runId}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data?.items) setItems(data.items) })
      .finally(() => setIsLoading(false))
  }, [runId])

  return { items, isLoading }
}
