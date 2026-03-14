'use client'

import { useEffect, useState, useCallback } from 'react'
import { Mail, Calendar, Download, Inbox, Upload, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Table, TableBody, TableCell, TableHead,
  TableHeader, TableRow,
} from '@/components/ui/table'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

const LIEFERANTEN = [
  { key: 'blank',         label: 'Blank' },
  { key: 'a43-kulturgut', label: 'A43-Kulturgut' },
  { key: 'avus',          label: 'Avus' },
]

interface ListEntry {
  id: string
  lieferant: string
  filename: string
  file_path: string
  result_file_path: string | null
  bestelldatum: string
  created_at: string
}

export function LieferantenlistenClient() {
  const [activeTab, setActiveTab]     = useState('blank')
  const [entries, setEntries]         = useState<ListEntry[]>([])
  const [isLoading, setIsLoading]     = useState(true)
  const [uploadOpen, setUploadOpen]   = useState(false)

  const fetchEntries = useCallback(async () => {
    try {
      const res = await fetch('/api/lieferantenlisten')
      if (!res.ok) throw new Error('Fehler beim Laden')
      const data: ListEntry[] = await res.json()
      setEntries(data)
    } catch {
      toast.error('Einträge konnten nicht geladen werden')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => { fetchEntries() }, [fetchEntries])

  const handleDownload = async (id: string, filename: string, type: 'original' | 'result') => {
    try {
      const res = await fetch(`/api/lieferantenlisten/${id}/download?type=${type}`)
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? 'Download fehlgeschlagen')
      }
      const { url } = await res.json()
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      a.click()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Download fehlgeschlagen')
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Lieferantenlisten</h1>
          <p className="text-muted-foreground mt-1">
            Automatisch per E-Mail aktualisierte Listen — sortiert nach Bestelldatum
          </p>
        </div>
        <Button onClick={() => setUploadOpen(true)} className="gap-2">
          <Upload className="h-4 w-4" />
          Manuell hochladen
        </Button>
      </div>

      {/* Info Banner */}
      <Alert>
        <Mail className="h-4 w-4" />
        <AlertDescription>
          Listen werden automatisch per E-Mail aktualisiert. Ältere Bestellungen können manuell hochgeladen werden.
        </AlertDescription>
      </Alert>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          {LIEFERANTEN.map((l) => {
            const count = entries.filter((e) => e.lieferant === l.key).length
            return (
              <TabsTrigger key={l.key} value={l.key}>
                {l.label}
                {count > 0 && (
                  <Badge variant="secondary" className="ml-2 text-[10px] px-1.5 py-0">
                    {count}
                  </Badge>
                )}
              </TabsTrigger>
            )
          })}
        </TabsList>

        {LIEFERANTEN.map((lieferant) => {
          const filtered = entries.filter((e) => e.lieferant === lieferant.key)
          return (
            <TabsContent key={lieferant.key} value={lieferant.key} className="mt-4">
              <div className="space-y-2">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-green-600 dark:text-green-400">
                  {lieferant.label} ({filtered.length})
                </h2>
                <div className="overflow-x-auto rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Dateiname</TableHead>
                        <TableHead>Bestelldatum</TableHead>
                        <TableHead className="text-center">Original</TableHead>
                        <TableHead className="text-center">Gefiltert</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {isLoading ? (
                        <TableRow>
                          <TableCell colSpan={4} className="text-center py-8">
                            <Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" />
                          </TableCell>
                        </TableRow>
                      ) : filtered.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={4}>
                            <EmptyState lieferant={lieferant.label} onUpload={() => setUploadOpen(true)} />
                          </TableCell>
                        </TableRow>
                      ) : (
                        filtered.map((entry) => (
                          <TableRow key={entry.id}>
                            <TableCell className="font-mono text-xs">{entry.filename}</TableCell>
                            <TableCell className="text-muted-foreground">
                              <div className="flex items-center gap-1.5">
                                <Calendar className="h-3.5 w-3.5" />
                                {new Date(entry.bestelldatum).toLocaleDateString('de-DE', {
                                  day: '2-digit', month: '2-digit', year: 'numeric',
                                })}
                              </div>
                            </TableCell>
                            <TableCell className="text-center">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="gap-1.5"
                                onClick={() => handleDownload(entry.id, entry.filename, 'original')}
                              >
                                <Download className="h-3.5 w-3.5" />
                                Download
                              </Button>
                            </TableCell>
                            <TableCell className="text-center">
                              {entry.result_file_path ? (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="gap-1.5"
                                  onClick={() => handleDownload(
                                    entry.id,
                                    entry.filename.replace(/(\.[^.]+)$/, '_gefiltert$1'),
                                    'result'
                                  )}
                                >
                                  <Download className="h-3.5 w-3.5" />
                                  Download
                                </Button>
                              ) : (
                                <span className="text-xs text-muted-foreground/50">—</span>
                              )}
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </TabsContent>
          )
        })}
      </Tabs>

      {/* Upload Dialog */}
      <UploadDialog
        open={uploadOpen}
        defaultLieferant={activeTab}
        onClose={() => setUploadOpen(false)}
        onSuccess={() => {
          setUploadOpen(false)
          fetchEntries()
        }}
      />
    </div>
  )
}

function EmptyState({ lieferant, onUpload }: { lieferant: string; onUpload: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 py-12 text-center">
      <Inbox className="h-8 w-8 text-muted-foreground/50" />
      <div>
        <p className="text-sm font-medium">Noch keine Listen vorhanden</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Automatisch per E-Mail oder{' '}
          <button onClick={onUpload} className="underline hover:text-foreground transition-colors">
            manuell hochladen
          </button>
        </p>
      </div>
      <p className="text-xs text-muted-foreground/60">
        Lieferant: <span className="font-medium text-muted-foreground">{lieferant}</span>
      </p>
    </div>
  )
}

function UploadDialog({
  open,
  defaultLieferant,
  onClose,
  onSuccess,
}: {
  open: boolean
  defaultLieferant: string
  onClose: () => void
  onSuccess: () => void
}) {
  const [lieferant, setLieferant]     = useState(defaultLieferant)
  const [bestelldatum, setBestelldatum] = useState('')
  const [file, setFile]               = useState<File | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Reset when dialog opens
  useEffect(() => {
    if (open) {
      setLieferant(defaultLieferant)
      setBestelldatum('')
      setFile(null)
    }
  }, [open, defaultLieferant])

  const canSubmit = lieferant && bestelldatum && file && !isSubmitting

  const handleSubmit = async () => {
    if (!canSubmit) return
    setIsSubmitting(true)
    try {
      const formData = new FormData()
      formData.append('lieferant', lieferant)
      formData.append('bestelldatum', bestelldatum)
      formData.append('file', file)

      const res = await fetch('/api/lieferantenlisten', {
        method: 'POST',
        body: formData,
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? 'Upload fehlgeschlagen')

      toast.success('Liste erfolgreich hochgeladen')
      onSuccess()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Upload fehlgeschlagen')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!isSubmitting && !o) onClose() }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Liste manuell hochladen</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {/* Lieferant */}
          <div className="space-y-1.5">
            <Label>Lieferant</Label>
            <Select value={lieferant} onValueChange={setLieferant}>
              <SelectTrigger>
                <SelectValue placeholder="Lieferant wählen" />
              </SelectTrigger>
              <SelectContent>
                {LIEFERANTEN.map((l) => (
                  <SelectItem key={l.key} value={l.key}>{l.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Bestelldatum */}
          <div className="space-y-1.5">
            <Label>Bestelldatum</Label>
            <Input
              type="date"
              value={bestelldatum}
              onChange={(e) => setBestelldatum(e.target.value)}
              max={new Date().toISOString().split('T')[0]}
            />
            <p className="text-xs text-muted-foreground">
              Wann ist die Bestellung bei diesem Lieferanten eingegangen?
            </p>
          </div>

          {/* File */}
          <div className="space-y-1.5">
            <Label>Datei</Label>
            <Input
              type="file"
              accept=".csv,.xlsx,.xls"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            {file && (
              <p className="text-xs text-muted-foreground">
                {file.name} · {(file.size / 1024).toFixed(0)} KB
              </p>
            )}
          </div>

          {/* Submit */}
          <Button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="w-full gap-2"
          >
            {isSubmitting ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Wird hochgeladen…</>
            ) : (
              <><Upload className="h-4 w-4" /> Hochladen</>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
