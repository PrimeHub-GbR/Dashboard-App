'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import {
  BookOpen, Wifi, WifiOff, Play, RefreshCw, Download,
  Clock, CheckCircle2, XCircle, Loader2, Settings2, AlertCircle,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import {
  Card, CardContent, CardHeader, CardTitle,
} from '@/components/ui/card'
import {
  Table, TableBody, TableCell, TableHead,
  TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'

interface RebuySettings {
  id: string
  schedule: string
  container_url: string | null
}

interface RebuyScrape {
  id: string
  scrape_date: string | null
  file_path: string | null
  status: 'pending' | 'running' | 'success' | 'failed'
  row_count: number | null
  progress_pages: number | null
  total_pages: number | null
  eta_seconds: number | null
  started_at: string | null
  finished_at: string | null
  error_message: string | null
  created_at: string
}

const SCHEDULE_OPTIONS = [
  { value: 'Sun *-*-* 02:00:00', label: 'Jeden Sonntag (02:00 Uhr)' },
  { value: '*-*-* 02:00:00', label: 'Täglich (02:00 Uhr)' },
  { value: 'Mon,Thu *-*-* 02:00:00', label: 'Mo + Do (02:00 Uhr)' },
  { value: '*-*-1 02:00:00', label: 'Jeden 1. des Monats' },
  { value: 'manual', label: 'Manuell (kein Auto-Run)' },
]

function formatEta(seconds: number): string {
  if (seconds < 60) return `${seconds} Sek.`
  if (seconds < 3600) return `${Math.round(seconds / 60)} Min.`
  const h = Math.floor(seconds / 3600)
  const m = Math.round((seconds % 3600) / 60)
  return `${h}h ${m}min`
}

function formatDuration(startedAt: string | null, finishedAt: string | null): string {
  if (!startedAt) return '—'
  const start = new Date(startedAt)
  const end = finishedAt ? new Date(finishedAt) : new Date()
  const secs = Math.round((end.getTime() - start.getTime()) / 1000)
  return formatEta(secs)
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString('de-DE', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  })
}

function StatusBadge({ status }: { status: RebuyScrape['status'] }) {
  if (status === 'running') return <Badge className="bg-blue-500 text-white"><Loader2 className="h-3 w-3 mr-1 animate-spin" />Läuft</Badge>
  if (status === 'success') return <Badge className="bg-green-600 text-white"><CheckCircle2 className="h-3 w-3 mr-1" />Fertig</Badge>
  if (status === 'failed') return <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" />Fehler</Badge>
  return <Badge variant="secondary"><Clock className="h-3 w-3 mr-1" />Ausstehend</Badge>
}

export default function RebuyClient() {
  const [scrapes, setScrapes] = useState<RebuyScrape[]>([])
  const [settings, setSettings] = useState<RebuySettings | null>(null)
  const [containerOnline, setContainerOnline] = useState<boolean | null>(null)
  const [containerReason, setContainerReason] = useState<string>('')
  const [isLoading, setIsLoading] = useState(true)
  const [isTriggeringNow, setIsTriggeringNow] = useState(false)
  const [isSavingSettings, setIsSavingSettings] = useState(false)
  const [editSchedule, setEditSchedule] = useState('')
  const [editContainerUrl, setEditContainerUrl] = useState('')
  const [downloadingId, setDownloadingId] = useState<string | null>(null)
  const pollRef = useRef<NodeJS.Timeout | null>(null)

  const loadScrapes = useCallback(async () => {
    const res = await fetch('/api/rebuy')
    if (res.ok) {
      const data: RebuyScrape[] = await res.json()
      setScrapes(data)
      return data
    }
    return []
  }, [])

  const loadSettings = useCallback(async () => {
    const res = await fetch('/api/rebuy/settings')
    if (res.ok) {
      const data: RebuySettings = await res.json()
      setSettings(data)
      setEditSchedule(data.schedule)
      setEditContainerUrl(data.container_url ?? '')
    }
  }, [])

  const checkContainer = useCallback(async () => {
    const res = await fetch('/api/rebuy/container')
    if (res.ok) {
      const data = await res.json()
      setContainerOnline(data.online ?? false)
      setContainerReason(data.reason ?? '')
    } else {
      setContainerOnline(false)
      setContainerReason('API-Fehler')
    }
  }, [])

  // Initiales Laden
  useEffect(() => {
    Promise.all([loadScrapes(), loadSettings(), checkContainer()]).finally(() =>
      setIsLoading(false)
    )
  }, [loadScrapes, loadSettings, checkContainer])

  // Live-Polling wenn Scrape läuft
  useEffect(() => {
    const hasRunning = scrapes.some((s) => s.status === 'running' || s.status === 'pending')

    if (hasRunning && !pollRef.current) {
      pollRef.current = setInterval(async () => {
        const updated = await loadScrapes()
        const stillRunning = updated.some((s) => s.status === 'running' || s.status === 'pending')
        if (!stillRunning && pollRef.current) {
          clearInterval(pollRef.current)
          pollRef.current = null
        }
      }, 10_000)
    } else if (!hasRunning && pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }

    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [scrapes, loadScrapes])

  const handleTrigger = async () => {
    setIsTriggeringNow(true)
    try {
      const res = await fetch('/api/rebuy/trigger', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error ?? 'Fehler beim Starten')
        return
      }
      toast.success('Scrape gestartet!')
      await loadScrapes()
    } catch {
      toast.error('Netzwerkfehler')
    } finally {
      setIsTriggeringNow(false)
    }
  }

  const handleSaveSettings = async () => {
    setIsSavingSettings(true)
    try {
      const res = await fetch('/api/rebuy/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          schedule: editSchedule,
          container_url: editContainerUrl || '',
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error ?? 'Fehler beim Speichern')
        return
      }
      setSettings(data)
      toast.success('Einstellungen gespeichert')
      // Container-Status neu prüfen falls URL geändert
      checkContainer()
    } catch {
      toast.error('Netzwerkfehler')
    } finally {
      setIsSavingSettings(false)
    }
  }

  const handleDownload = async (scrape: RebuyScrape) => {
    setDownloadingId(scrape.id)
    try {
      const res = await fetch(`/api/rebuy/${scrape.id}/download`)
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error ?? 'Download fehlgeschlagen')
        return
      }
      const a = document.createElement('a')
      a.href = data.url
      a.download = `rebuy-buecher-${scrape.scrape_date ?? scrape.created_at.slice(0, 10)}.xlsx`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
    } catch {
      toast.error('Netzwerkfehler beim Download')
    } finally {
      setDownloadingId(null)
    }
  }

  const latestScrape = scrapes[0] ?? null
  const activeScrape = scrapes.find((s) => s.status === 'running' || s.status === 'pending') ?? null
  const progressPercent = activeScrape?.total_pages && activeScrape.total_pages > 0
    ? Math.round(((activeScrape.progress_pages ?? 0) / activeScrape.total_pages) * 100)
    : 0

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <BookOpen className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold">Rebuy Buch-Scraper</h1>
      </div>

      {/* Stale-Warnung */}
      {latestScrape && latestScrape.status === 'success' && latestScrape.scrape_date && (() => {
        const daysSince = Math.floor((Date.now() - new Date(latestScrape.scrape_date).getTime()) / 86400000)
        return daysSince > 8 ? (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Letzter Scrape vor {daysSince} Tagen — der Container ist möglicherweise ausgefallen.
            </AlertDescription>
          </Alert>
        ) : null
      })()}

      {/* Top Row: 3 Karten */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

        {/* Karte 1: Container-Status */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              {containerOnline === true
                ? <Wifi className="h-4 w-4 text-green-500" />
                : containerOnline === false
                  ? <WifiOff className="h-4 w-4 text-red-500" />
                  : <Loader2 className="h-4 w-4 animate-spin" />
              }
              Container-Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            {containerOnline === null
              ? <p className="text-sm text-muted-foreground">Prüfe…</p>
              : containerOnline
                ? (
                  <div className="space-y-1">
                    <p className="font-semibold text-green-600">Online</p>
                    {settings?.container_url && (
                      <p className="text-xs text-muted-foreground truncate">{settings.container_url}</p>
                    )}
                  </div>
                )
                : (
                  <div className="space-y-1">
                    <p className="font-semibold text-red-600">Offline</p>
                    {containerReason && <p className="text-xs text-muted-foreground">{containerReason}</p>}
                    {!settings?.container_url && (
                      <p className="text-xs text-muted-foreground">Keine Container-URL konfiguriert</p>
                    )}
                  </div>
                )
            }
            <Button
              variant="ghost"
              size="sm"
              className="mt-2 h-7 px-2 text-xs"
              onClick={checkContainer}
            >
              <RefreshCw className="h-3 w-3 mr-1" />
              Prüfen
            </Button>
          </CardContent>
        </Card>

        {/* Karte 2: Scraping-Status / Letztes Ergebnis */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {activeScrape ? 'Scraping läuft…' : 'Letztes Ergebnis'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {activeScrape ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">
                    {activeScrape.progress_pages ?? 0} / {activeScrape.total_pages ?? '?'} Seiten
                  </span>
                  <span className="font-medium">{progressPercent}%</span>
                </div>
                <Progress value={progressPercent} className="h-2" />
                {activeScrape.eta_seconds != null && (
                  <p className="text-xs text-muted-foreground">
                    ETA: ~{formatEta(activeScrape.eta_seconds)}
                  </p>
                )}
              </div>
            ) : latestScrape?.status === 'success' ? (
              <div className="space-y-2">
                <p className="font-semibold text-green-600">
                  {latestScrape.row_count?.toLocaleString('de-DE')} Bücher
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatDate(latestScrape.scrape_date)}
                </p>
                <Button
                  size="sm"
                  className="h-7 bg-green-600 hover:bg-green-700 text-white text-xs"
                  onClick={() => handleDownload(latestScrape)}
                  disabled={downloadingId === latestScrape.id}
                >
                  {downloadingId === latestScrape.id
                    ? <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                    : <Download className="h-3 w-3 mr-1" />
                  }
                  Excel herunterladen
                </Button>
              </div>
            ) : latestScrape?.status === 'failed' ? (
              <div className="space-y-1">
                <p className="font-semibold text-red-600">Letzter Scrape fehlgeschlagen</p>
                {latestScrape.error_message && (
                  <p className="text-xs text-muted-foreground">{latestScrape.error_message}</p>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Noch kein Scrape durchgeführt</p>
            )}
          </CardContent>
        </Card>

        {/* Karte 3: Einstellungen + Manuell starten */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Settings2 className="h-4 w-4" />
              Einstellungen
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs">Intervall</Label>
              <Select value={editSchedule} onValueChange={setEditSchedule}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Intervall wählen" />
                </SelectTrigger>
                <SelectContent>
                  {SCHEDULE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value} className="text-xs">
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Container-URL</Label>
              <Input
                className="h-8 text-xs"
                placeholder="https://rebuy-scraper.domain.com"
                value={editContainerUrl}
                onChange={(e) => setEditContainerUrl(e.target.value)}
              />
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs flex-1"
                onClick={handleSaveSettings}
                disabled={isSavingSettings}
              >
                {isSavingSettings ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Speichern'}
              </Button>
              <Button
                size="sm"
                className="h-7 text-xs flex-1"
                onClick={handleTrigger}
                disabled={isTriggeringNow || !!activeScrape || !containerOnline}
              >
                {isTriggeringNow
                  ? <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                  : <Play className="h-3 w-3 mr-1" />
                }
                Jetzt starten
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Archiv-Tabelle */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Scrape-Verlauf</CardTitle>
        </CardHeader>
        <CardContent>
          {scrapes.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              Noch keine Scrapes vorhanden. Starte den ersten Scrape über &quot;Jetzt starten&quot;.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Datum</TableHead>
                  <TableHead>Bücher</TableHead>
                  <TableHead>Dauer</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Download</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {scrapes.map((scrape) => (
                  <TableRow key={scrape.id}>
                    <TableCell className="text-sm">
                      {formatDate(scrape.scrape_date ?? scrape.created_at)}
                    </TableCell>
                    <TableCell className="text-sm">
                      {scrape.row_count != null
                        ? scrape.row_count.toLocaleString('de-DE')
                        : scrape.status === 'running' && scrape.total_pages
                          ? <span className="text-muted-foreground text-xs">{scrape.progress_pages ?? 0}/{scrape.total_pages} Seiten</span>
                          : '—'
                      }
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {scrape.status === 'running'
                        ? scrape.eta_seconds != null
                          ? <span className="text-blue-600 text-xs">~{formatEta(scrape.eta_seconds)} verbleibend</span>
                          : <span className="text-xs">läuft…</span>
                        : formatDuration(scrape.started_at, scrape.finished_at)
                      }
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={scrape.status} />
                    </TableCell>
                    <TableCell className="text-right">
                      {scrape.status === 'success' && scrape.file_path ? (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs hover:bg-green-50 hover:border-green-400 hover:text-green-700"
                          onClick={() => handleDownload(scrape)}
                          disabled={downloadingId === scrape.id}
                        >
                          {downloadingId === scrape.id
                            ? <Loader2 className="h-3 w-3 animate-spin" />
                            : <Download className="h-3 w-3" />
                          }
                        </Button>
                      ) : (
                        <span className="text-muted-foreground text-xs">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
