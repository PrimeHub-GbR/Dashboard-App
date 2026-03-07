"use client"

import { useCallback, useState } from "react"
import { Download, Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { usePrices } from "@/hooks/usePrices"
import { useUserRole } from "@/hooks/useUserRole"
import { PRICES_PAGE_SIZE } from "@/lib/price-types"
import { PricesTable } from "./PricesTable"
import { EanAsinMapManager } from "./EanAsinMapManager"
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react"

export function PricesClient() {
  const {
    prices,
    totalCount,
    isLoading,
    error,
    search,
    setSearch,
    page,
    setPage,
    totalPages,
    refresh,
  } = usePrices()

  const { isAdmin } = useUserRole()
  const [isExporting, setIsExporting] = useState(false)

  const handleExport = useCallback(async () => {
    setIsExporting(true)
    try {
      const params = new URLSearchParams()
      if (search) params.set("q", search)
      const res = await fetch(`/api/prices/export?${params}`)
      if (!res.ok) return
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `preisdatenbank_${new Date().toISOString().slice(0, 10)}.csv`
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } finally {
      setIsExporting(false)
    }
  }, [search])

  const from = (page - 1) * PRICES_PAGE_SIZE + 1
  const to = Math.min(page * PRICES_PAGE_SIZE, totalCount)

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Preisdatenbank</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {isLoading ? "Lade…" : `${totalCount.toLocaleString("de-DE")} Produkte`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isAdmin && <EanAsinMapManager onMappingChange={refresh} />}
          <Button variant="outline" size="sm" onClick={handleExport} disabled={isLoading || isExporting || totalCount === 0}>
            <Download className="mr-2 h-4 w-4" />
            {isExporting ? "Exportiere…" : "CSV Export"}
          </Button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="EAN oder ASIN suchen…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
          aria-label="Suche nach EAN oder ASIN"
        />
      </div>

      {/* Table */}
      <PricesTable prices={prices} isLoading={isLoading} />

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-2">
          <p className="text-sm text-muted-foreground">
            {from}–{to} von {totalCount.toLocaleString("de-DE")} Einträgen
          </p>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setPage(1)} disabled={page <= 1} aria-label="Erste Seite">
              <ChevronsLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setPage(page - 1)} disabled={page <= 1} aria-label="Vorherige Seite">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="px-3 text-sm font-medium">Seite {page} von {totalPages}</span>
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setPage(page + 1)} disabled={page >= totalPages} aria-label="Naechste Seite">
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setPage(totalPages)} disabled={page >= totalPages} aria-label="Letzte Seite">
              <ChevronsRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
