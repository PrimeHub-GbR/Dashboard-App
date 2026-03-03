'use client'

import { Inbox } from 'lucide-react'
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
import { WORKFLOW_CONFIGS } from '@/lib/workflow-config'
import type { Job } from '@/lib/job-types'
import { StatusBadge } from './StatusBadge'
import { DownloadButton } from './DownloadButton'

interface JobHistoryTableProps {
  jobs: Job[]
  isLoading: boolean
  error: string | null
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

export function JobHistoryTable({ jobs, isLoading, error }: JobHistoryTableProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Verlauf (letzte 30 Tage)</CardTitle>
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
