"use client"

import { RefreshCw, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import type { SyncLog } from "@/lib/order-types"

interface OrdersHeaderProps {
  lastSync: SyncLog | null
  isSyncing: boolean
  syncError: string | null
  isAdmin: boolean
  onSync: () => void
}

function formatSyncTime(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMin = Math.floor(diffMs / 60000)

  if (diffMin < 1) return "Gerade eben"
  if (diffMin < 60) return `Vor ${diffMin} Min.`
  const diffHours = Math.floor(diffMin / 60)
  if (diffHours < 24) return `Vor ${diffHours} Std.`
  return date.toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

export function OrdersHeader({
  lastSync,
  isSyncing,
  syncError,
  isAdmin,
  onSync,
}: OrdersHeaderProps) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Bestellungen</h1>
        <div className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
          {lastSync ? (
            <>
              <span>Letzter Sync: {formatSyncTime(lastSync.synced_at)}</span>
              {lastSync.status === "success" && lastSync.rows_imported != null && (
                <Badge variant="secondary" className="text-xs">
                  {lastSync.rows_imported} Zeilen importiert
                </Badge>
              )}
              {lastSync.status === "error" && (
                <Badge variant="destructive" className="text-xs">
                  Sync-Fehler
                </Badge>
              )}
            </>
          ) : (
            <span>Noch kein Sync durchgefuehrt</span>
          )}
        </div>
        {syncError && (
          <p className="mt-1 text-sm text-destructive">{syncError}</p>
        )}
      </div>

      {isAdmin && (
        <Button
          onClick={onSync}
          disabled={isSyncing}
          variant="outline"
          className="shrink-0"
          aria-label="Google Drive synchronisieren"
        >
          {isSyncing ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="mr-2 h-4 w-4" />
          )}
          {isSyncing ? "Synchronisiert..." : "Sync aus Google Drive"}
        </Button>
      )}
    </div>
  )
}
