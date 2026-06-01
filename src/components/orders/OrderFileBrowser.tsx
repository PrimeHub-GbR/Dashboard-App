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

/**
 * Leitet das Datum aus dem Dateinamen ab (das echte Drive-Upload-Datum wird
 * nicht gespeichert). Liefert ein Anzeige-Label und einen Sortierschlüssel
 * (YYYYMMDD). Dateien ohne erkennbares Jahr bekommen Schlüssel 0 → ans Ende.
 *   AvusOrder150625.xlsx     → 15.06.25  (DDMMYY)
 *   BlankOrder25082025.xlsx  → 25.08.2025 (DDMMYYYY)
 *   A43Order0702.xlsx        → 07.02.    (kein Jahr → Schlüssel 0)
 */
function parseFileDate(fileName: string): { label: string | null; sortKey: number } {
  const groups = fileName.match(/\d{4,8}/g)
  if (!groups) return { label: null, sortKey: 0 }
  const digits = [...groups].sort((a, b) => b.length - a.length)[0]
  let day = "", month = "", year = ""
  if (digits.length === 8) {
    day = digits.slice(0, 2); month = digits.slice(2, 4); year = digits.slice(4, 8)
  } else if (digits.length === 6) {
    day = digits.slice(0, 2); month = digits.slice(2, 4); year = "20" + digits.slice(4, 6)
  } else if (digits.length === 4) {
    day = digits.slice(0, 2); month = digits.slice(2, 4)
  } else {
    return { label: null, sortKey: 0 }
  }
  const dn = parseInt(day, 10), mn = parseInt(month, 10)
  if (dn < 1 || dn > 31 || mn < 1 || mn > 12) return { label: null, sortKey: 0 }
  return {
    label: year ? `${day}.${month}.${year}` : `${day}.${month}.`,
    sortKey: year ? parseInt(`${year}${month}${day}`, 10) : 0,
  }
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
          .map(([supplier, supplierFiles]) => ({
            supplier,
            // Neueste zuerst (nach Datum im Dateinamen), dann alphabetisch
            files: [...supplierFiles].sort((a, b) => {
              const ka = parseFileDate(a.file_name).sortKey
              const kb = parseFileDate(b.file_name).sortKey
              if (kb !== ka) return kb - ka
              return a.file_name.localeCompare(b.file_name)
            }),
          }))

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
    <div className="grid grid-cols-1 gap-x-4 gap-y-1 md:grid-cols-2 xl:grid-cols-3 items-start">
      {groups.map((group) => {
        const isOpen = openFolders.has(group.supplier)
        return (
          <Collapsible
            key={group.supplier}
            open={isOpen}
            onOpenChange={() => toggleFolder(group.supplier)}
            className="rounded-lg border border-border/60 bg-background/40"
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
              <ul className="ml-6 mb-2 mr-2 mt-0.5 space-y-0.5 border-l border-border pl-3">
                {group.files.map((file) => {
                  const dateLabel = parseFileDate(file.file_name).label
                  return (
                  <li
                    key={file.file_id}
                    className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted/40 transition-colors"
                  >
                    <FileSpreadsheet className="h-4 w-4 text-green-600 shrink-0" />
                    <span className="flex-1 truncate" title={file.file_name}>
                      {file.file_name}
                    </span>
                    {dateLabel && (
                      <span className="text-xs text-muted-foreground whitespace-nowrap">
                        {dateLabel}
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
                  )
                })}
              </ul>
            </CollapsibleContent>
          </Collapsible>
        )
      })}
    </div>
  )
}
