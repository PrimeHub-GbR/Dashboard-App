"use client"

import { useCallback } from "react"
import { toast } from "sonner"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Separator } from "@/components/ui/separator"
import { useOrderSync } from "@/hooks/useOrderSync"
import { useUserRole } from "@/hooks/useUserRole"
import { OrdersHeader } from "./OrdersHeader"
import { OrderFileBrowser } from "./OrderFileBrowser"
import { OrderBookSearch } from "./OrderBookSearch"

export function OrdersClient() {
  const { isAdmin, isLoading: isRoleLoading } = useUserRole()
  const { lastSync, isSyncing, syncError, triggerSync } = useOrderSync()

  const handleSync = useCallback(async () => {
    const success = await triggerSync()
    if (success) {
      toast.success("Sync abgeschlossen", {
        description: "Google Drive wurde erfolgreich synchronisiert.",
      })
    } else {
      toast.error("Sync fehlgeschlagen", {
        description:
          "Der Sync konnte nicht gestartet werden. Bitte versuchen Sie es erneut.",
      })
    }
  }, [triggerSync])

  if (isRoleLoading) {
    return (
      <div className="flex flex-col gap-6">
        <div className="h-12 bg-muted/50 animate-pulse rounded" />
        <div className="h-96 bg-muted/50 animate-pulse rounded" />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Header mit Sync */}
      <OrdersHeader
        lastSync={lastSync}
        isSyncing={isSyncing}
        syncError={syncError}
        isAdmin={isAdmin}
        onSync={handleSync}
      />

      {syncError && (
        <Alert variant="destructive">
          <AlertDescription>{syncError}</AlertDescription>
        </Alert>
      )}

      {/* Ordnerstruktur: alle Lieferanten + Dateien zum Download */}
      <div className="rounded-md border bg-muted/20 px-4 py-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
          Bestelldateien herunterladen
        </p>
        <OrderFileBrowser />
      </div>

      <Separator />

      {/* Suche nach Büchern (ISBN/EAN oder Titel) */}
      <OrderBookSearch />
    </div>
  )
}
