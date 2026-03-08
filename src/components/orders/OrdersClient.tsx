"use client"

import { useCallback } from "react"
import { Save, Undo2, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Separator } from "@/components/ui/separator"
import { useOrders } from "@/hooks/useOrders"
import { useOrderSync } from "@/hooks/useOrderSync"
import { useOrderEdits } from "@/hooks/useOrderEdits"
import { useUserRole } from "@/hooks/useUserRole"
import { PAGE_SIZE } from "@/lib/order-types"
import { OrdersHeader } from "./OrdersHeader"
import { OrdersSearch } from "./OrdersSearch"
import { OrdersFilters } from "./OrdersFilters"
import { OrderDataTable } from "./OrderDataTable"
import { OrdersPagination } from "./OrdersPagination"
import { OrdersEmptyState } from "./OrdersEmptyState"
import { OrderFileBrowser } from "./OrderFileBrowser"

export function OrdersClient() {
  const { isAdmin, isLoading: isRoleLoading } = useUserRole()

  const {
    orders,
    totalCount,
    unfilteredCount,
    isLoading,
    error,
    filters,
    setFilters,
    resetFilters,
    page,
    setPage,
    totalPages,
    refresh,
    suppliers,
    statuses,
    sortState,
    setSortState,
  } = useOrders()

  const { lastSync, isSyncing, syncError, triggerSync } = useOrderSync(refresh)

  const {
    hasPendingEdits,
    editCell,
    discardAll,
    saveAll,
    isSaving,
    saveError,
    getEditedValue,
    isEdited,
  } = useOrderEdits()

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

  const handleSaveEdits = useCallback(async () => {
    const success = await saveAll()
    if (success) {
      toast.success("Aenderungen gespeichert", {
        description: "Alle Bearbeitungen wurden erfolgreich gespeichert.",
      })
      await refresh()
    } else {
      toast.error("Fehler beim Speichern", {
        description: "Einige Aenderungen konnten nicht gespeichert werden.",
      })
    }
  }, [saveAll, refresh])

  const handleDiscardEdits = useCallback(() => {
    discardAll()
    toast.info("Aenderungen verworfen")
  }, [discardAll])

  const handleSearchChange = useCallback(
    (search: string) => {
      setFilters({ ...filters, search })
    },
    [filters, setFilters]
  )

  // Show loading skeleton while role is resolving
  if (isRoleLoading) {
    return (
      <div className="flex flex-col gap-6">
        <div className="h-12 bg-muted/50 animate-pulse rounded" />
        <div className="h-96 bg-muted/50 animate-pulse rounded" />
      </div>
    )
  }

  // Check if this is a first-load with no data (empty state)
  const showEmptyState = !isLoading && totalCount === 0 && !filters.search && !filters.status && !filters.supplier && !filters.dateFrom && !filters.dateTo

  return (
    <div className="flex flex-col gap-6">
      {/* Header with sync */}
      <OrdersHeader
        lastSync={lastSync}
        isSyncing={isSyncing}
        syncError={syncError}
        isAdmin={isAdmin}
        onSync={handleSync}
      />

      {/* Error alert */}
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Save error alert */}
      {saveError && (
        <Alert variant="destructive">
          <AlertDescription>{saveError}</AlertDescription>
        </Alert>
      )}

      {showEmptyState ? (
        <OrdersEmptyState
          isAdmin={isAdmin}
          isSyncing={isSyncing}
          onSync={handleSync}
        />
      ) : (
        <>
          {/* Toolbar: Search + Filters + Edit actions */}
          <div className="flex flex-col gap-4">
            <div className="flex flex-col sm:flex-row sm:items-center gap-4">
              <div className="flex-1">
                <OrdersSearch
                  value={filters.search}
                  onChange={handleSearchChange}
                  resultCount={totalCount}
                  totalCount={unfilteredCount}
                />
              </div>

              {/* Pending edits actions */}
              {hasPendingEdits && isAdmin && (
                <div className="flex items-center gap-2 shrink-0">
                  <Button
                    variant="default"
                    size="sm"
                    onClick={handleSaveEdits}
                    disabled={isSaving}
                    className="h-9"
                  >
                    {isSaving ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Save className="mr-2 h-4 w-4" />
                    )}
                    Aenderungen speichern
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleDiscardEdits}
                    disabled={isSaving}
                    className="h-9"
                  >
                    <Undo2 className="mr-2 h-4 w-4" />
                    Verwerfen
                  </Button>
                </div>
              )}
            </div>

            <OrdersFilters
              filters={filters}
              onFiltersChange={setFilters}
              onReset={resetFilters}
              suppliers={suppliers}
              statuses={statuses}
            />
          </div>

          {/* File browser: AVUS / BLANK / KULTURGUT */}
          <div className="rounded-md border bg-muted/20 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
              Dateien herunterladen
            </p>
            <OrderFileBrowser />
          </div>

          <Separator />

          {/* Data table */}
          <OrderDataTable
            orders={orders}
            isLoading={isLoading}
            isAdmin={isAdmin}
            getEditedValue={getEditedValue}
            isEdited={isEdited}
            onEdit={editCell}
            sortState={sortState}
            onSortChange={setSortState}
          />

          {/* Pagination */}
          <OrdersPagination
            page={page}
            totalPages={totalPages}
            totalCount={totalCount}
            pageSize={PAGE_SIZE}
            onPageChange={setPage}
          />
        </>
      )}
    </div>
  )
}
