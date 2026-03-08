"use client"

import { useEffect, useState } from "react"
import { Folder, FolderOpen, FileSpreadsheet, Download, ChevronRight, ChevronDown } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"

interface OrderFileEntry {
  file_id: string
  file_name: string
  supplier: string | null
  order_date: string | null
}

interface SupplierGroup {
  supplier: string
  files: OrderFileEntry[]
}

function formatDate(value: string | null): string {
  if (!value) return ""
  const d = new Date(value)
  if (isNaN(d.getTime())) return value
  return d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" })
}

export function OrderFileBrowser() {
  const [groups, setGroups] = useState<SupplierGroup[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [openFolders, setOpenFolders] = useState<Set<string>>(new Set())

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/orders/file-list")
        if (!res.ok) throw new Error("Fehler beim Laden der Dateiliste")
        const json = await res.json()
        const files: OrderFileEntry[] = json.files ?? []

        // Group by supplier
        const map = new Map<string, OrderFileEntry[]>()
        for (const f of files) {
          const key = f.supplier ?? "Unbekannt"
          if (!map.has(key)) map.set(key, [])
          map.get(key)!.push(f)
        }

        const grouped: SupplierGroup[] = Array.from(map.entries())
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([supplier, supplierFiles]) => ({ supplier, files: supplierFiles }))

        setGroups(grouped)
        // Open all folders by default
        setOpenFolders(new Set(grouped.map((g) => g.supplier)))
      } catch (e) {
        setError(e instanceof Error ? e.message : "Unbekannter Fehler")
      } finally {
        setIsLoading(false)
      }
    }
    load()
  }, [])

  function toggleFolder(supplier: string) {
    setOpenFolders((prev) => {
      const next = new Set(prev)
      if (next.has(supplier)) next.delete(supplier)
      else next.add(supplier)
      return next
    })
  }

  if (isLoading) {
    return (
      <div className="space-y-2 py-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-9 w-full rounded-md" />
        ))}
      </div>
    )
  }

  if (error) {
    return <p className="text-sm text-destructive py-2">{error}</p>
  }

  if (groups.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-2">
        Keine Dateien gefunden. Bitte zuerst einen Sync durchführen.
      </p>
    )
  }

  return (
    <div className="space-y-1">
      {groups.map((group) => {
        const isOpen = openFolders.has(group.supplier)
        return (
          <Collapsible
            key={group.supplier}
            open={isOpen}
            onOpenChange={() => toggleFolder(group.supplier)}
          >
            <CollapsibleTrigger asChild>
              <button
                className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm font-medium hover:bg-muted/60 transition-colors"
                aria-label={`Ordner ${group.supplier} ${isOpen ? "schließen" : "öffnen"}`}
              >
                {isOpen ? (
                  <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                )}
                {isOpen ? (
                  <FolderOpen className="h-4 w-4 text-amber-500 shrink-0" />
                ) : (
                  <Folder className="h-4 w-4 text-amber-500 shrink-0" />
                )}
                <span>{group.supplier}</span>
                <span className="ml-auto text-xs text-muted-foreground">
                  {group.files.length} {group.files.length === 1 ? "Datei" : "Dateien"}
                </span>
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <ul className="ml-9 mt-0.5 space-y-0.5 border-l border-border pl-3">
                {group.files.map((file) => (
                  <li
                    key={file.file_id}
                    className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted/40 transition-colors"
                  >
                    <FileSpreadsheet className="h-4 w-4 text-green-600 shrink-0" />
                    <span className="flex-1 truncate" title={file.file_name}>
                      {file.file_name}
                    </span>
                    {file.order_date && (
                      <span className="text-xs text-muted-foreground whitespace-nowrap">
                        {formatDate(file.order_date)}
                      </span>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0 shrink-0"
                      title={`${file.file_name} herunterladen`}
                      aria-label={`${file.file_name} herunterladen`}
                      onClick={() => window.open(`/api/orders/files/${file.file_id}`, "_blank")}
                    >
                      <Download className="h-3.5 w-3.5" />
                    </Button>
                  </li>
                ))}
              </ul>
            </CollapsibleContent>
          </Collapsible>
        )
      })}
    </div>
  )
}
