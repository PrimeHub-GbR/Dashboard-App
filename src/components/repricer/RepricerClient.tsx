'use client'

import { useState } from 'react'
import { Loader2, Inbox } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
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
import { FileDropZone } from '@/components/workflow-hub/FileDropZone'
import { ActiveJobsBanner } from '@/components/workflow-hub/ActiveJobsBanner'
import { StatusBadge } from '@/components/workflow-hub/StatusBadge'
import { DownloadButton } from '@/components/workflow-hub/DownloadButton'
import { useRepricerJobs } from '@/hooks/useRepricerJobs'
import { RepricerSummary } from './RepricerSummary'

const REPRICER_CONFIG = WORKFLOW_CONFIGS['repricer-updater']

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
  const match = raw.match(/^\d+-(.+)$/)
  return match ? match[1] : raw
}

function SkeletonRows() {
  return (
    <>
      {Array.from({ length: 4 }).map((_, i) => (
        <TableRow key={i}>
          <TableCell><Skeleton className="h-4 w-32" /></TableCell>
          <TableCell><Skeleton className="h-4 w-24" /></TableCell>
          <TableCell><Skeleton className="h-6 w-20 rounded-full" /></TableCell>
          <TableCell><Skeleton className="h-4 w-36" /></TableCell>
          <TableCell><Skeleton className="h-8 w-24" /></TableCell>
        </TableRow>
      ))}
    </>
  )
}

export function RepricerClient() {
  const { jobs, isLoading, error } = useRepricerJobs()
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)

  const activeJobs = jobs.filter(
    (j) => j.status === 'pending' || j.status === 'running'
  )

  async function handleSubmit() {
    if (!selectedFile) return

    setIsSubmitting(true)
    setUploadProgress(0)

    try {
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest()
        const formData = new FormData()
        formData.append('workflow_key', 'repricer-updater')
        formData.append('file', selectedFile)

        xhr.upload.addEventListener('progress', (e) => {
          if (e.lengthComputable) {
            setUploadProgress(Math.round((e.loaded / e.total) * 100))
          }
        })

        xhr.addEventListener('load', () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve()
          } else {
            try {
              const body = JSON.parse(xhr.responseText)
              reject(new Error(body.error ?? 'Fehler beim Starten des Jobs'))
            } catch {
              reject(new Error('Fehler beim Starten des Jobs'))
            }
          }
        })

        xhr.addEventListener('error', () => reject(new Error('Netzwerkfehler')))

        xhr.open('POST', '/api/jobs')
        xhr.send(formData)
      })

      toast.success('Repricer-Job gestartet — Status wird aktualisiert')
      setSelectedFile(null)
      setUploadProgress(0)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Fehler beim Starten des Jobs')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Upload Card */}
      <Card>
        <CardHeader>
          <CardTitle>CSV hochladen</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <FileDropZone
            config={REPRICER_CONFIG}
            file={selectedFile}
            onFileChange={setSelectedFile}
          />

          {isSubmitting && uploadProgress > 0 && (
            <Progress value={uploadProgress} className="h-2" />
          )}

          <Button
            onClick={handleSubmit}
            disabled={!selectedFile || isSubmitting}
            className="w-full sm:w-auto sm:self-end"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="animate-spin" />
                Wird hochgeladen...
              </>
            ) : (
              'Verarbeitung starten'
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Active Jobs Banner */}
      <ActiveJobsBanner jobs={activeJobs} />

      {/* Jobs History Table */}
      <Card>
        <CardHeader>
          <CardTitle>Verlauf (letzte 20 Jobs)</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Dateiname</TableHead>
                <TableHead>Datum / Uhrzeit</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Zusammenfassung</TableHead>
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
                    <p>Noch keine Repricer-Jobs vorhanden</p>
                  </TableCell>
                </TableRow>
              ) : (
                jobs.map((job) => {
                  const showDownload = job.status === 'success'

                  return (
                    <TableRow key={job.id}>
                      <TableCell className="max-w-[180px] truncate font-mono text-xs">
                        {extractFilename(job.input_file_url) ?? '--'}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {formatDateTime(job.created_at)}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={job.status} />
                      </TableCell>
                      <TableCell>
                        <RepricerSummary job={job} />
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1">
                          {job.status === 'failed' && job.error_message && (
                            <span className="text-xs text-destructive">{job.error_message}</span>
                          )}
                          {job.status === 'timeout' && (
                            <span className="text-xs text-muted-foreground">
                              Timeout nach 10 Min
                            </span>
                          )}
                          <DownloadButton jobId={job.id} hasResultFile={showDownload} />
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
    </div>
  )
}
