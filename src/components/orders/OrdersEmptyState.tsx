"use client"

import { FileSpreadsheet, RefreshCw, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"

interface OrdersEmptyStateProps {
  isAdmin: boolean
  isSyncing: boolean
  onSync: () => void
}

export function OrdersEmptyState({
  isAdmin,
  isSyncing,
  onSync,
}: OrdersEmptyStateProps) {
  return (
    <Card className="border-dashed">
      <CardContent className="flex flex-col items-center justify-center py-16 text-center">
        <div className="rounded-full bg-muted p-4 mb-4">
          <FileSpreadsheet className="h-10 w-10 text-muted-foreground" />
        </div>
        <h3 className="text-lg font-semibold mb-1">
          Keine Bestellungen vorhanden
        </h3>
        <p className="text-sm text-muted-foreground max-w-md mb-6">
          {isAdmin
            ? "Es wurden noch keine Bestellungen aus Google Drive importiert. Starten Sie den ersten Sync, um Excel-Dateien zu importieren."
            : "Es wurden noch keine Bestellungen importiert. Bitte wenden Sie sich an einen Administrator."}
        </p>
        {isAdmin && (
          <Button onClick={onSync} disabled={isSyncing} size="lg">
            {isSyncing ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            {isSyncing ? "Synchronisiert..." : "Ersten Sync starten"}
          </Button>
        )}
      </CardContent>
    </Card>
  )
}
