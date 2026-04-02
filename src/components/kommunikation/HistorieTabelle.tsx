'use client'

import { useState } from 'react'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination'
import { MessageCircle, AlertTriangle, RefreshCw } from 'lucide-react'
import { NachrichtDetailSheet } from './NachrichtDetailSheet'
import type { MessageLog, HistoryFilters } from '@/hooks/useKommunikation'

function fmtDateTime(dateStr: string) {
  return new Intl.DateTimeFormat('de-DE', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  }).format(new Date(dateStr))
}

const PAGE_SIZE = 20

const CONTEXT_LABELS: Record<string, string> = {
  manual: 'Manuell',
  aufgabe: 'Aufgabe',
  zeiterfassung: 'Zeiterfassung',
}

const CONTEXT_CLASSES: Record<string, string> = {
  manual: 'bg-muted text-muted-foreground',
  aufgabe: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  zeiterfassung: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
}

const STATUS_LABELS: Record<string, string> = {
  pending: 'Ausstehend',
  sent: 'Gesendet ✓',
  failed: 'Fehlgeschlagen',
}

const STATUS_CLASSES: Record<string, string> = {
  pending: 'bg-muted text-muted-foreground',
  sent: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  failed: 'bg-destructive/10 text-destructive',
}

interface Props {
  logs: MessageLog[]
  total: number
  loading: boolean
  error: string | null
  filters: HistoryFilters
  onFilterChange: (filters: HistoryFilters) => void
  onRetry: () => void
  onResetFilters: () => void
}

export function HistorieTabelle({
  logs,
  total,
  loading,
  error,
  filters,
  onFilterChange,
  onRetry,
  onResetFilters,
}: Props) {
  const [selectedLog, setSelectedLog] = useState<MessageLog | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)

  const page = filters.page ?? 1
  const totalPages = Math.ceil(total / PAGE_SIZE)

  const hasActiveFilters =
    !!filters.recipient_id ||
    !!filters.context ||
    !!filters.status ||
    !!filters.date_range

  const handleRowClick = (log: MessageLog) => {
    setSelectedLog(log)
    setSheetOpen(true)
  }

  const goToPage = (p: number) => {
    onFilterChange({ ...filters, page: p })
  }

  return (
    <>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[140px]">Datum</TableHead>
              <TableHead className="w-[160px]">Empfänger</TableHead>
              <TableHead>Nachricht</TableHead>
              <TableHead className="w-[120px]">Kontext</TableHead>
              <TableHead className="w-[120px]">Absender</TableHead>
              <TableHead className="w-[100px]">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 6 }).map((_, j) => (
                    <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                  ))}
                </TableRow>
              ))
            ) : error ? (
              <TableRow>
                <TableCell colSpan={6} className="py-8">
                  <Alert variant="destructive" className="max-w-md mx-auto">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription className="flex items-center justify-between gap-4">
                      {error}
                      <Button variant="ghost" size="sm" onClick={onRetry} className="gap-1.5 shrink-0">
                        <RefreshCw className="h-3.5 w-3.5" />
                        Erneut versuchen
                      </Button>
                    </AlertDescription>
                  </Alert>
                </TableCell>
              </TableRow>
            ) : logs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-12 text-center">
                  {hasActiveFilters ? (
                    <div className="space-y-2">
                      <p className="text-muted-foreground">Keine Einträge für diesen Filter.</p>
                      <Button variant="ghost" size="sm" onClick={onResetFilters}>
                        Filter zurücksetzen
                      </Button>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-2 text-muted-foreground">
                      <MessageCircle className="h-8 w-8 opacity-30" />
                      <p>Noch keine Nachrichten gesendet</p>
                    </div>
                  )}
                </TableCell>
              </TableRow>
            ) : (
              logs.map((log) => (
                <TableRow
                  key={log.id}
                  onClick={() => handleRowClick(log)}
                  className="cursor-pointer hover:bg-muted/50 transition-colors duration-150"
                >
                  <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                    {fmtDateTime(log.created_at)}
                  </TableCell>
                  <TableCell>
                    <p className="text-sm font-medium">{log.recipient_name ?? '—'}</p>
                    <p className="text-xs text-muted-foreground">{log.recipient_phone}</p>
                  </TableCell>
                  <TableCell className="text-sm text-foreground max-w-[200px]">
                    <span className="line-clamp-2">
                      {log.message_text.length > 80
                        ? `${log.message_text.slice(0, 80)}…`
                        : log.message_text}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Badge className={`text-xs ${CONTEXT_CLASSES[log.context] ?? 'bg-muted text-muted-foreground'}`}>
                      {CONTEXT_LABELS[log.context] ?? log.context}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {log.sent_by_email
                      ? log.sent_by_email.split('@')[0]
                      : '—'}
                  </TableCell>
                  <TableCell>
                    <Badge className={`text-xs ${STATUS_CLASSES[log.status] ?? ''}`}>
                      {STATUS_LABELS[log.status] ?? log.status}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex justify-end px-6 pb-6 pt-4">
          <Pagination>
            <PaginationContent>
              <PaginationItem>
                <PaginationPrevious
                  onClick={() => page > 1 && goToPage(page - 1)}
                  aria-disabled={page <= 1}
                  className={page <= 1 ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                />
              </PaginationItem>
              <PaginationItem>
                <span className="flex h-9 items-center px-4 text-sm">
                  {page} / {totalPages}
                </span>
              </PaginationItem>
              <PaginationItem>
                <PaginationNext
                  onClick={() => page < totalPages && goToPage(page + 1)}
                  aria-disabled={page >= totalPages}
                  className={page >= totalPages ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                />
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        </div>
      )}

      <NachrichtDetailSheet
        log={selectedLog}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
      />
    </>
  )
}
