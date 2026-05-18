'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Loader2, ExternalLink, CheckCircle2, XCircle, AlertCircle, Clock } from 'lucide-react'
import type { BuchpreischeckRun, BuchpreischeckItem } from '@/hooks/useBuchpreisbindung'

interface Props {
  runs: BuchpreischeckRun[]
  items: BuchpreischeckItem[]
  isLoading: boolean
  selectedSellerId: string | null
}

function RunStatusBadge({ status }: { status: BuchpreischeckRun['status'] }) {
  if (status === 'running') return (
    <Badge variant="outline" className="border-blue-500/30 text-blue-400 gap-1">
      <Loader2 className="h-3 w-3 animate-spin" />Läuft
    </Badge>
  )
  if (status === 'success') return (
    <Badge variant="outline" className="border-green-500/30 text-green-400 gap-1">
      <CheckCircle2 className="h-3 w-3" />Fertig
    </Badge>
  )
  if (status === 'failed') return (
    <Badge variant="outline" className="border-red-500/30 text-red-400 gap-1">
      <XCircle className="h-3 w-3" />Fehler
    </Badge>
  )
  return (
    <Badge variant="outline" className="border-yellow-500/30 text-yellow-400 gap-1">
      <Clock className="h-3 w-3" />Timeout
    </Badge>
  )
}

export function LastRunSection({ runs, items, isLoading, selectedSellerId }: Props) {
  const [filter, setFilter] = useState<'all' | 'violations'>('all')

  if (!selectedSellerId) {
    return (
      <Card className="bg-[#0f1e14] border-white/10">
        <CardContent className="py-10 text-center text-white/30 text-sm">
          Wähle einen Händler aus, um Ergebnisse zu sehen.
        </CardContent>
      </Card>
    )
  }

  const lastRun = runs.find(r => r.status !== 'running') ?? runs[0] ?? null
  const runningRun = runs.find(r => r.status === 'running') ?? null
  const displayRun = runningRun ?? lastRun

  const filteredItems = filter === 'violations'
    ? items.filter(i => i.is_compliant === false)
    : items

  const formatPrice = (price: number | null) => {
    if (price == null) return '—'
    return price.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })
  }

  return (
    <Card className="bg-[#0f1e14] border-white/10">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="text-white text-base">Letzter Durchlauf</CardTitle>
          {displayRun && (
            <div className="flex items-center gap-3 text-xs text-white/40">
              <RunStatusBadge status={displayRun.status} />
              <span>{new Date(displayRun.started_at).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })}</span>
              {displayRun.total_items != null && (
                <span>{displayRun.total_items} Titel</span>
              )}
              {displayRun.violations_count != null && (
                <span className={displayRun.violations_count > 0 ? 'text-red-400 font-medium' : 'text-green-400'}>
                  {displayRun.violations_count} {displayRun.violations_count === 1 ? 'Verstoß' : 'Verstöße'}
                </span>
              )}
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {(isLoading && items.length === 0) && (
          <div className="flex items-center justify-center py-10 gap-2 text-white/40">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-sm">Lade Ergebnisse…</span>
          </div>
        )}

        {!isLoading && !displayRun && (
          <p className="text-sm text-white/30 py-8 text-center">Noch keine Prüfung durchgeführt.</p>
        )}

        {displayRun?.status === 'running' && (
          <div className="flex items-center justify-center py-10 gap-2 text-blue-400">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="text-sm">Prüfung läuft — Amazon und VLB werden abgefragt…</span>
          </div>
        )}

        {displayRun?.status === 'failed' && (
          <div className="flex items-center gap-2 py-4 px-3 rounded-lg bg-red-500/10 border border-red-500/20">
            <AlertCircle className="h-4 w-4 text-red-400 shrink-0" />
            <p className="text-sm text-red-300">{displayRun.error_message ?? 'Unbekannter Fehler'}</p>
          </div>
        )}

        {items.length > 0 && displayRun?.status === 'success' && (
          <>
            {/* Filter */}
            <div className="flex gap-2 mb-3">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setFilter('all')}
                className={filter === 'all' ? 'bg-white/10 text-white' : 'text-white/40 hover:text-white/60'}
              >
                Alle ({items.length})
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setFilter('violations')}
                className={filter === 'violations'
                  ? 'bg-red-500/15 text-red-400'
                  : 'text-white/40 hover:text-white/60'}
              >
                Nur Verstöße ({items.filter(i => i.is_compliant === false).length})
              </Button>
            </div>

            <div className="rounded-lg overflow-hidden border border-white/8">
              <Table>
                <TableHeader>
                  <TableRow className="border-white/8 hover:bg-transparent">
                    <TableHead className="text-white/40 text-xs">ISBN13</TableHead>
                    <TableHead className="text-white/40 text-xs">Buchtitel</TableHead>
                    <TableHead className="text-white/40 text-xs text-right">Verkäufer</TableHead>
                    <TableHead className="text-white/40 text-xs text-right">VLB (BBP)</TableHead>
                    <TableHead className="text-white/40 text-xs text-center">Status</TableHead>
                    <TableHead className="text-white/40 text-xs"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredItems.map(item => (
                    <TableRow key={item.id} className="border-white/5 hover:bg-white/3">
                      <TableCell className="text-xs font-mono text-white/60">{item.isbn13}</TableCell>
                      <TableCell className="text-xs text-white/80 max-w-[200px] truncate" title={item.title ?? undefined}>
                        {item.title ?? '—'}
                      </TableCell>
                      <TableCell className="text-xs text-white/70 text-right">{formatPrice(item.amazon_price)}</TableCell>
                      <TableCell className="text-xs text-white/70 text-right">{formatPrice(item.vlb_price)}</TableCell>
                      <TableCell className="text-center">
                        {item.is_compliant === true && (
                          <span className="inline-flex items-center gap-1 text-xs text-green-400">
                            <CheckCircle2 className="h-3.5 w-3.5" />OK
                          </span>
                        )}
                        {item.is_compliant === false && (
                          <span className="inline-flex items-center gap-1 text-xs text-red-400 font-medium">
                            <XCircle className="h-3.5 w-3.5" />VERSTOSS
                          </span>
                        )}
                        {item.is_compliant == null && (
                          <span className="text-xs text-white/30">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {item.amazon_url && (
                          <a
                            href={item.amazon_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-white/20 hover:text-white/60 transition-colors"
                            title="Amazon-Produktseite öffnen"
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                  {filteredItems.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-white/30 text-sm py-6">
                        {filter === 'violations' ? 'Keine Verstöße gefunden ✅' : 'Keine Ergebnisse'}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
