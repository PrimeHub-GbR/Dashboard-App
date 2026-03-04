'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { toast } from 'sonner'
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination'
import { WorkflowRow } from './WorkflowRow'

const PAGE_SIZE = 20

export interface WorkflowStat {
  id: string
  name: string
  active: boolean
  lastRunAt: string | null
  lastRunSuccess: boolean | null
  executionsLast30Days: number
  errorRateLast30Days: number | null
}

interface WorkflowMonitorClientProps {
  isAdmin: boolean
}

export function WorkflowMonitorClient({ isAdmin }: WorkflowMonitorClientProps) {
  const [workflows, setWorkflows] = useState<WorkflowStat[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [secondsSince, setSecondsSince] = useState(0)
  const [page, setPage] = useState(1)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetchWorkflows = useCallback(async () => {
    try {
      const res = await fetch('/api/n8n/workflows')
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? `HTTP ${res.status}`)
      }
      const data: WorkflowStat[] = await res.json()
      setWorkflows(data)
      setError(null)
      setLastUpdated(new Date())
      setSecondsSince(0)
      setPage(1)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unbekannter Fehler'
      setError(msg)
    } finally {
      setIsLoading(false)
    }
  }, [])

  // Initial load + 30s auto-refresh
  useEffect(() => {
    fetchWorkflows()
    intervalRef.current = setInterval(fetchWorkflows, 30_000)
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [fetchWorkflows])

  // Tick counter for "Aktualisiert vor X Sek."
  useEffect(() => {
    tickRef.current = setInterval(() => {
      setSecondsSince((s) => s + 1)
    }, 1_000)
    return () => {
      if (tickRef.current) clearInterval(tickRef.current)
    }
  }, [])

  const handleToggle = useCallback(
    async (id: string, currentActive: boolean) => {
      // Optimistic update
      setWorkflows((prev) =>
        prev.map((w) => (w.id === id ? { ...w, active: !currentActive } : w))
      )

      try {
        const res = await fetch(`/api/n8n/workflows/${id}/toggle`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ active: !currentActive }),
        })
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          throw new Error(body.error ?? `HTTP ${res.status}`)
        }
        toast.success(
          `Workflow ${!currentActive ? 'aktiviert' : 'deaktiviert'}`
        )
      } catch (err) {
        // Rollback
        setWorkflows((prev) =>
          prev.map((w) => (w.id === id ? { ...w, active: currentActive } : w))
        )
        const msg = err instanceof Error ? err.message : 'Unbekannter Fehler'
        toast.error(`Toggle fehlgeschlagen: ${msg}`)
      }
    },
    []
  )

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full rounded" />
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Refresh indicator */}
      <div className="text-xs text-muted-foreground text-right">
        {lastUpdated
          ? `Aktualisiert vor ${secondsSince} Sek.`
          : 'Noch nicht geladen'}
      </div>

      {/* Error banner */}
      {error && (
        <Alert variant="destructive">
          <AlertDescription>
            n8n nicht erreichbar: {error}
            {workflows.length > 0 && ' — Letzter bekannter Stand wird angezeigt.'}
          </AlertDescription>
        </Alert>
      )}

      {/* Empty state */}
      {!error && workflows.length === 0 && (
        <p className="text-center text-muted-foreground py-12">
          Keine Workflows gefunden.
        </p>
      )}

      {/* Table */}
      {workflows.length > 0 && (() => {
        const totalPages = Math.ceil(workflows.length / PAGE_SIZE)
        const paged = workflows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
        return (
          <>
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Letzte Ausführung</TableHead>
                    <TableHead className="text-right">Ausführungen (30T)</TableHead>
                    <TableHead className="text-right">Fehlerquote</TableHead>
                    <TableHead className="text-center">Aktiv</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paged.map((workflow) => (
                    <WorkflowRow
                      key={workflow.id}
                      workflow={workflow}
                      isAdmin={isAdmin}
                      onToggle={handleToggle}
                    />
                  ))}
                </TableBody>
              </Table>
            </div>
            {totalPages > 1 && (
              <Pagination>
                <PaginationContent>
                  <PaginationItem>
                    <PaginationPrevious
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      aria-disabled={page === 1}
                      className={page === 1 ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                    />
                  </PaginationItem>
                  <PaginationItem className="text-sm px-4 flex items-center">
                    {page} / {totalPages}
                  </PaginationItem>
                  <PaginationItem>
                    <PaginationNext
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      aria-disabled={page === totalPages}
                      className={page === totalPages ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                    />
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
            )}
          </>
        )
      })()}
    </div>
  )
}
