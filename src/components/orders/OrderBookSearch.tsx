"use client"

import { useEffect, useRef, useState } from "react"
import { Search, X, Loader2, FileSpreadsheet } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import type { OrderSearchResult } from "@/app/api/orders/search/route"

/**
 * Leitet das Bestelldatum aus dem Dateinamen ab, da die order_date-Spalte
 * nicht befüllt ist. Beispiele:
 *   AvusOrder150625.xlsx     → 15.06.25  (DDMMYY)
 *   A43Order03012026_1.xlsx  → 03.01.2026 (DDMMYYYY)
 *   A43Order0702.xlsx        → 07.02.    (DDMM, kein Jahr)
 */
function parseOrderDate(fileName: string | null): string | null {
  if (!fileName) return null
  const groups = fileName.match(/\d{4,8}/g)
  if (!groups) return null
  // Längste Ziffernfolge ist am ehesten das Datum
  const digits = [...groups].sort((a, b) => b.length - a.length)[0]
  let day = "", month = "", year = ""
  if (digits.length === 8) {
    day = digits.slice(0, 2); month = digits.slice(2, 4); year = digits.slice(4, 8)
  } else if (digits.length === 6) {
    day = digits.slice(0, 2); month = digits.slice(2, 4); year = "20" + digits.slice(4, 6)
  } else if (digits.length === 4) {
    day = digits.slice(0, 2); month = digits.slice(2, 4)
  } else {
    return null
  }
  const dn = parseInt(day, 10), mn = parseInt(month, 10)
  if (dn < 1 || dn > 31 || mn < 1 || mn > 12) return null
  return year ? `${day}.${month}.${year}` : `${day}.${month}.`
}

function formatCurrency(value: number | null): string {
  if (value == null) return "—"
  return value.toLocaleString("de-DE", { style: "currency", currency: "EUR" })
}

export function OrderBookSearch() {
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<OrderSearchResult[]>([])
  const [truncated, setTruncated] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hasSearched, setHasSearched] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    const q = query.trim()
    if (q.length < 2) {
      setResults([])
      setHasSearched(false)
      setError(null)
      return
    }

    const handle = setTimeout(async () => {
      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller
      setIsLoading(true)
      setError(null)
      try {
        const res = await fetch(`/api/orders/search?q=${encodeURIComponent(q)}`, {
          signal: controller.signal,
        })
        if (!res.ok) throw new Error("Suche fehlgeschlagen")
        const json = await res.json() as { results: OrderSearchResult[]; truncated: boolean }
        setResults(json.results)
        setTruncated(json.truncated)
        setHasSearched(true)
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") return
        setError(e instanceof Error ? e.message : "Unbekannter Fehler")
      } finally {
        setIsLoading(false)
      }
    }, 300)

    return () => clearTimeout(handle)
  }, [query])

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-medium">Bücher suchen</h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          Nach ISBN/EAN oder Titel suchen — zeigt, wann und in welchen Bestellungen ein Buch bestellt wurde.
        </p>
      </div>

      {/* Suchfeld */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="ISBN / EAN oder Titel eingeben…"
          className="pl-9 pr-9"
          aria-label="Bücher nach ISBN/EAN oder Titel suchen"
        />
        {query && (
          <button
            onClick={() => setQuery("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            aria-label="Suche zurücksetzen"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Zustände */}
      {error && <p className="text-sm text-destructive">{error}</p>}

      {isLoading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
          <Loader2 className="h-4 w-4 animate-spin" />
          Suche läuft…
        </div>
      )}

      {!isLoading && query.trim().length >= 2 && hasSearched && results.length === 0 && !error && (
        <p className="text-sm text-muted-foreground py-4">
          Keine Treffer für „{query.trim()}".
        </p>
      )}

      {!isLoading && query.trim().length < 2 && (
        <p className="text-sm text-muted-foreground py-4">
          Mindestens 2 Zeichen eingeben, um zu suchen.
        </p>
      )}

      {/* Trefferliste (flach) */}
      {!isLoading && results.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>{results.length} {results.length === 1 ? "Treffer" : "Treffer"}</span>
            {truncated && (
              <Badge variant="secondary" className="text-xs">
                Begrenzt auf 200 — Suche verfeinern
              </Badge>
            )}
          </div>
          <div className="rounded-md border overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Titel</TableHead>
                  <TableHead className="whitespace-nowrap">ISBN / EAN</TableHead>
                  <TableHead>Lieferant</TableHead>
                  <TableHead>Bestellung</TableHead>
                  <TableHead className="whitespace-nowrap">Datum</TableHead>
                  <TableHead className="text-right whitespace-nowrap">Menge</TableHead>
                  <TableHead className="text-right whitespace-nowrap">EK-Preis</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {results.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium max-w-[320px]">
                      <span className="line-clamp-2" title={r.title ?? ""}>{r.title ?? "—"}</span>
                    </TableCell>
                    <TableCell className="font-mono text-xs whitespace-nowrap">{r.ean ?? "—"}</TableCell>
                    <TableCell>{r.supplier ?? "—"}</TableCell>
                    <TableCell>
                      <span className="inline-flex items-center gap-1.5 text-sm" title={r.file_name ?? ""}>
                        <FileSpreadsheet className="h-3.5 w-3.5 text-green-600 shrink-0" />
                        <span className="truncate max-w-[180px]">{r.file_name ?? "—"}</span>
                      </span>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">{parseOrderDate(r.file_name) ?? "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.quantity ?? "—"}</TableCell>
                    <TableCell className="text-right tabular-nums whitespace-nowrap">{formatCurrency(r.cost)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </div>
  )
}
