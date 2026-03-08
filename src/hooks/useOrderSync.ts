"use client"

import { useCallback, useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"
import type { SyncLog } from "@/lib/order-types"

interface UseOrderSyncReturn {
  lastSync: SyncLog | null
  isSyncing: boolean
  syncError: string | null
  triggerSync: () => Promise<boolean>
}

export function useOrderSync(onSyncComplete?: () => Promise<void>): UseOrderSyncReturn {
  const [lastSync, setLastSync] = useState<SyncLog | null>(null)
  const [isSyncing, setIsSyncing] = useState(false)
  const [syncError, setSyncError] = useState<string | null>(null)

  // Fetch last sync log
  const fetchLastSync = useCallback(async () => {
    const { data } = await supabase
      .from("sync_log")
      .select("*")
      .eq("workflow_key", "google-drive-sync")
      .order("synced_at", { ascending: false })
      .limit(1)
      .maybeSingle()

    if (data) {
      setLastSync(data as SyncLog)
    }
  }, [])

  useEffect(() => {
    fetchLastSync()
  }, [fetchLastSync])

  const triggerSync = useCallback(async (): Promise<boolean> => {
    setIsSyncing(true)
    setSyncError(null)

    try {
      const response = await fetch("/api/orders/sync", {
        method: "POST",
      })

      if (!response.ok) {
        const body = await response.json().catch(() => ({}))
        throw new Error(body.error ?? "Sync fehlgeschlagen")
      }

      // Refresh sync log and data
      await fetchLastSync()
      if (onSyncComplete) {
        await onSyncComplete()
      }
      return true
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Sync fehlgeschlagen"
      setSyncError(message)
      return false
    } finally {
      setIsSyncing(false)
    }
  }, [fetchLastSync, onSyncComplete])

  return { lastSync, isSyncing, syncError, triggerSync }
}
