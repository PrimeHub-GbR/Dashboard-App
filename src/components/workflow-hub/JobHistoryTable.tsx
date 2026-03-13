'use client'

import { useState } from 'react'
import { Inbox, Trash2, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { WORKFLOW_CONFIGS } from '@/lib/workflow-config'
import type { Job } from '@/lib/job-types'
import { StatusBadge } from './StatusBadge'
import { DownloadButton } from './DownloadButton'
import { CancelButton } from './CancelButton'

interface JobHistoryTableProps {
  jobs: Job[]
  isLoading: boolean
  error: string | null
  onClear: () => Promise<void>
}

function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso))
}

function extractFilename(url: string | null): string | null {
  if (!url) return null
  const raw = url.split('/').pop() ?? null
  if (!raw) return null
  // Strip leading timestamp prefix (e.g. "1704067200000-filename.csv" → "filename.csv")
  const match = raw.match(/^\d+-(.+)$/)
  return match ? match[1] : raw
}

function SkeletonRows() {
  return (
    <>
      {Array.from({ length: 5 }).map((_, i) => (
        <TableRow key={i}>
          <TableCell><Skeleton className="h-4 w-32" /></TableCell>
          <TableCell><Skeleton className="h-4 w-24" /></TableCell>
          <TableCell><Skeleton className="h-4 w-28" /></TableCell>
          <TableCell><Skeleton className="h-6 w-20 rounded-full" /></TableCell>
          <TableCell><Skeleton className="h-8 w-24" /></TableCell>
        </TableRow>
      ))}
    </>
  )
}

export function JobHistoryTable({ jobs, isLoading, error, onClear }: JobHistoryTableProps) {
  const [isClearing, setIsClearing] = useState(false)

  const hasFinishedJobs = jobs.some(
    (j) => j.status === 'success' || j.status === 'failed' || j.status === 'timeout'
  )

  async function handleClear() {
    setIsClearing(true)
    try {
      const res = await fetch('/api/jobs', { method: 'DELETE' })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        toast.error(body.error ?? 'Verlauf konnte nicht gelöscht werden')
      } else {
        toast.success('Verlauf gelöscht')
        await onClear()
      }
    } catch {
      toast.error('Netzwerkfehler')
    } finally {
      setIsClearing(false)
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle>Verlauf (letzte 30 Tage)</CardTitle>
        {hasFinishedJobs && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <button
                disabled={isClearing}
                className="flex items-center gap-1.5 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-1.5 text-xs font-medium text-rose-300 transition-all hover:bg-rose-500/20 disabled:opacity-50"
              >
                {isClearing ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Trash2 className="h-3.5 w-3.5" />
                )}
                Verlauf löschen
              </button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Verlauf löschen?</AlertDialogTitle>
                <AlertDialogDescription>
                  Alle abgeschlossenen Jobs (erfolgreich, fehlgeschlagen, Timeout) werden
                  unwiderruflich gelöscht. Laufende Jobs bleiben erhalten.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleClear}
                  className="bg-rose-600 hover:bg-rose-500 text-white"
                >
                  Ja, löschen
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Dateiname</TableHead>
              <TableHead>Workflow</TableHead>
              <TableHead>Datum / Uhrzeit</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Aktion</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <SkeletonRows />
            ) : error ? (
              <TableRow>
                <TableCell colSpan={5} className="py-12 text-center text-destructive">
                  Fehler beim Laden der Jobs. Bitte Seite neu laden.
                </TableCell>
              </TableRow>
            ) : jobs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-12 text-center text-muted-foreground">
                  <Inbox className="mx-auto mb-2 h-8 w-8 opacity-40" />
                  <p>Noch keine Jobs in den letzten 30 Tagen</p>
                </TableCell>
              </TableRow>
            ) : (
              jobs.map((job) => {
                const config = WORKFLOW_CONFIGS[job.workflow_key]
                const showDownload = config?.hasResultFile && job.status === 'success'

                return (
                  <TableRow key={job.id}>
                    <TableCell className="max-w-[180px] truncate font-mono text-xs">
                      {extractFilename(job.input_file_url) ?? '—'}
                    </TableCell>
                    <TableCell>{config?.label ?? job.workflow_key}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {formatDateTime(job.created_at)}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={job.status} />
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        {job.status === 'failed' && job.error_message && (
                          <span className="text-xs text-destructive">{job.error_message}</span>
                        )}
                        {job.status === 'timeout' && (
                          <span className="text-xs text-muted-foreground">
                            Job erneut starten
                          </span>
                        )}
                        {(job.status === 'pending' || job.status === 'running') && (
                          <CancelButton jobId={job.id} />
                        )}
                        <DownloadButton jobId={job.id} hasResultFile={!!showDownload} />
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}
