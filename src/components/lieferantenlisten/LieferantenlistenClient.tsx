'use client'

import { useEffect, useState, useCallback } from 'react'
import { Mail, Calendar, Download, Inbox, Upload, Loader2, Trash2, Percent } from 'lucide-react'
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
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
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
  listendatum: string
  created_at: string
  rabatt_prozent: number | null
}

type RabattMap = Record<string, number>
type SavingMap = Record<string, boolean>

export function LieferantenlistenClient() {
  const [activeTab, setActiveTab]       = useState('blank')
  const [entries, setEntries]           = useState<ListEntry[]>([])
  const [isLoading, setIsLoading]       = useState(true)
  const [uploadOpen, setUploadOpen]     = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<ListEntry | null>(null)
  const [isDeleting, setIsDeleting]     = useState(false)
  const [rabatte, setRabatte]           = useState<RabattMap>({ blank: 0, 'a43-kulturgut': 0, avus: 0 })
  const [savingKey, setSavingKey]       = useState<SavingMap>({})

  const fetchSettings = useCallback(async () => {
    try {
      const res = await fetch('/api/lieferantenlisten/settings')
      if (!res.ok) return
      const data: RabattMap = await res.json()
      setRabatte(data)
    } catch { /* non-critical */ }
  }, [])

  const handleSaveRabatt = useCallback(async (key: string) => {
    setSavingKey((prev) => ({ ...prev, [key]: true }))
    try {
      const res = await fetch('/api/lieferantenlisten/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lieferant: key, rabatt_prozent: rabatte[key] }),
      })
      if (!res.ok) throw new Error()
      toast.success('Rabatt gespeichert')
    } catch {
      toast.error('Speichern fehlgeschlagen')
    } finally {
      setSavingKey((prev) => ({ ...prev, [key]: false }))
    }
  }, [rabatte])

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

  useEffect(() => { fetchEntries(); fetchSettings() }, [fetchEntries, fetchSettings])

  const handleDelete = useCallback(async (entry: ListEntry) => {
    setIsDeleting(true)
    try {
      const res = await fetch(`/api/lieferantenlisten/${entry.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? 'Löschen fehlgeschlagen')
      }
      setEntries((prev) => prev.filter((e) => e.id !== entry.id))
      toast.success('Eintrag gelöscht')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Löschen fehlgeschlagen')
    } finally {
      setIsDeleting(false)
      setDeleteTarget(null)
    }
  }, [])

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

      {/* Rabatt-Einstellungen */}
      <div className="rounded-md border p-4 space-y-3">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Percent className="h-4 w-4 text-muted-foreground" />
          Rabatt-Einstellungen
        </div>
        <div className="grid gap-2">
          {LIEFERANTEN.map((l) => (
            <div key={l.key} className="flex items-center gap-3">
              <span className="w-36 text-sm text-muted-foreground">{l.label}</span>
              <div className="flex items-center gap-1.5">
                <Input
                  type="number"
                  min={0}
                  max={100}
                  step={0.5}
                  value={rabatte[l.key] ?? 0}
                  onChange={(e) =>
                    setRabatte((prev) => ({ ...prev, [l.key]: parseFloat(e.target.value) || 0 }))
                  }
                  className="w-20 text-right"
                />
                <span className="text-sm text-muted-foreground">%</span>
              </div>
              <Button
                size="sm"
                variant="outline"
                disabled={!!savingKey[l.key]}
                onClick={() => handleSaveRabatt(l.key)}
              >
                {savingKey[l.key] ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Speichern'}
              </Button>
            </div>
          ))}
        </div>
      </div>

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
                        <TableHead>Listendatum</TableHead>
                        <TableHead className="text-center">Rabatt</TableHead>
                        <TableHead className="text-center">Original</TableHead>
                        <TableHead className="text-center">Gefiltert</TableHead>
                        <TableHead className="w-10"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {isLoading ? (
                        <TableRow>
                          <TableCell colSpan={6} className="text-center py-8">
                            <Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" />
                          </TableCell>
                        </TableRow>
                      ) : filtered.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={6}>
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
                                {new Date(entry.listendatum).toLocaleDateString('de-DE', {
                                  day: '2-digit', month: '2-digit', year: 'numeric',
                                })}
                              </div>
                            </TableCell>
                            <TableCell className="text-center">
                              {entry.rabatt_prozent != null ? (
                                <Badge variant="secondary" className="gap-1">
                                  <Percent className="h-3 w-3" />
                                  {entry.rabatt_prozent}
                                </Badge>
                              ) : (
                                <span className="text-xs text-muted-foreground/50">—</span>
                              )}
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
                            <TableCell className="text-center">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-muted-foreground hover:text-destructive"
                                onClick={() => setDeleteTarget(entry)}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
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

      {/* Delete Confirmation */}
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => { if (!open && !isDeleting) setDeleteTarget(null) }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eintrag wirklich löschen?</AlertDialogTitle>
            <AlertDialogDescription>
              <span className="font-mono text-xs">{deleteTarget?.filename}</span> wird dauerhaft
              gelöscht — inklusive aller gespeicherten Dateien. Diese Aktion kann nicht rückgängig
              gemacht werden.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteTarget && handleDelete(deleteTarget)}
              disabled={isDeleting}
              className="bg-destructive hover:bg-destructive/90"
            >
              {isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Löschen'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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
  const [listendatum, setBestelldatum] = useState('')
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

  const canSubmit = lieferant && listendatum && file && !isSubmitting

  const handleSubmit = async () => {
    if (!canSubmit) return
    setIsSubmitting(true)
    try {
      const formData = new FormData()
      formData.append('lieferant', lieferant)
      formData.append('listendatum', listendatum)
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

          {/* Listendatum */}
          <div className="space-y-1.5">
            <Label>Listendatum</Label>
            <Input
              type="date"
              value={listendatum}
              onChange={(e) => setBestelldatum(e.target.value)}
              max={new Date().toISOString().split('T')[0]}
            />
            <p className="text-xs text-muted-foreground">
              An welchem Tag wurde diese Liste versandt?
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
