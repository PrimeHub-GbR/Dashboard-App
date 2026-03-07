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
import { WorkflowRow } from './WorkflowRow'

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
  n8nBaseUrl: string
}

function formatSecondsSince(s: number): string {
  if (s < 60) return `vor ${s} Sek.`
  const m = Math.floor(s / 60)
  const sec = s % 60
  return sec > 0 ? `vor ${m} Min. ${sec} Sek.` : `vor ${m} Min.`
}

function WorkflowSection({
  title,
  workflows,
  isAdmin,
  n8nBaseUrl,
  onToggle,
  headingClass,
}: {
  title: string
  workflows: WorkflowStat[]
  isAdmin: boolean
  n8nBaseUrl: string
  onToggle: (id: string, currentActive: boolean) => void
  headingClass: string
}) {
  if (workflows.length === 0) return null
  return (
    <div className="space-y-2">
      <h2 className={`text-sm font-semibold uppercase tracking-wide ${headingClass}`}>
        {title} ({workflows.length})
      </h2>
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
              <TableHead className="text-center">n8n</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {workflows.map((workflow) => (
              <WorkflowRow
                key={workflow.id}
                workflow={workflow}
                isAdmin={isAdmin}
                n8nBaseUrl={n8nBaseUrl}
                onToggle={onToggle}
              />
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}

export function WorkflowMonitorClient({ isAdmin, n8nBaseUrl }: WorkflowMonitorClientProps) {
  const [workflows, setWorkflows] = useState<WorkflowStat[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [secondsSince, setSecondsSince] = useState(0)
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
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unbekannter Fehler'
      setError(msg)
    } finally {
      setIsLoading(false)
    }
  }, [])

  // Initial load + 5min auto-refresh
  useEffect(() => {
    fetchWorkflows()
    intervalRef.current = setInterval(fetchWorkflows, 300_000)
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [fetchWorkflows])

  // Tick counter for "Aktualisiert vor X Sek./Min."
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

  const activeWorkflows = workflows.filter((w) => w.active)
  const inactiveWorkflows = workflows.filter((w) => !w.active)

  return (
    <div className="space-y-6">
      {/* Refresh indicator */}
      <div className="text-xs text-muted-foreground text-right">
        {lastUpdated
          ? `Aktualisiert ${formatSecondsSince(secondsSince)}`
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

      {/* Active workflows */}
      <WorkflowSection
        title="Aktive Workflows"
        workflows={activeWorkflows}
        isAdmin={isAdmin}
        n8nBaseUrl={n8nBaseUrl}
        onToggle={handleToggle}
        headingClass="text-green-600 dark:text-green-400"
      />

      {/* Inactive workflows */}
      <WorkflowSection
        title="Inaktive Workflows"
        workflows={inactiveWorkflows}
        isAdmin={isAdmin}
        n8nBaseUrl={n8nBaseUrl}
        onToggle={handleToggle}
        headingClass="text-muted-foreground"
      />
    </div>
  )
}
