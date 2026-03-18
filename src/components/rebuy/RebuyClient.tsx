'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import {
  BookOpen, Wifi, WifiOff, Play, RefreshCw, Download,
  Clock, CheckCircle2, XCircle, Loader2, Settings2, AlertCircle,
  Square, Info, Trash2, Terminal, ChevronDown, ChevronUp, Shield, ShieldOff,
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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Checkbox } from '@/components/ui/checkbox'

interface RebuySettings {
  id: string
  schedule: string
  container_url: string | null
  backup_proxy_url: string | null
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

// ─── Schedule helpers ─────────────────────────────────────────────────────────

const WEEKDAYS = [
  { value: 'Mon', label: 'Mo' },
  { value: 'Tue', label: 'Di' },
  { value: 'Wed', label: 'Mi' },
  { value: 'Thu', label: 'Do' },
  { value: 'Fri', label: 'Fr' },
  { value: 'Sat', label: 'Sa' },
  { value: 'Sun', label: 'So' },
]

function buildSchedule(days: string[], time: string): string {
  if (days.length === 0) return 'manual'
  return `${days.join(',')} *-*-* ${time}:00`
}

function parseSchedule(schedule: string): { days: string[]; time: string } {
  if (!schedule || schedule === 'manual') return { days: [], time: '02:00' }
  // e.g. "Sun *-*-* 02:00:00" or "Mon,Thu *-*-* 02:00:00"
  const match = schedule.match(/^([\w,]+)\s+\*-\*-\*\s+(\d{2}:\d{2})/)
  if (match) return { days: match[1].split(','), time: match[2] }
  // "*-*-* 02:00:00" → all days
  if (schedule.startsWith('*-*-*')) {
    const timeMatch = schedule.match(/(\d{2}:\d{2})/)
    return { days: WEEKDAYS.map((d) => d.value), time: timeMatch?.[1] ?? '02:00' }
  }
  return { days: ['Sun'], time: '02:00' }
}

function scheduleLabel(schedule: string): string {
  if (!schedule || schedule === 'manual') return 'Manuell'
  const { days, time } = parseSchedule(schedule)
  if (days.length === 0) return 'Manuell'
  const dayLabels = days.map((d) => WEEKDAYS.find((w) => w.value === d)?.label ?? d)
  return `${dayLabels.join(', ')} um ${time} Uhr`
}

// ─── Log helpers ──────────────────────────────────────────────────────────────

type LogLevel = 'error' | 'warning' | 'info'

interface LogEntry {
  raw: string
  level: LogLevel
  timestamp: string
  message: string
}

const LOG_RE = /^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}),\d{3} (INFO|WARNING|ERROR|CRITICAL|DEBUG)\s+(.+)$/

function classifyLine(line: string): LogLevel {
  if (/ ERROR | CRITICAL /i.test(line) || /Traceback|Exception/.test(line)) return 'error'
  if (/ WARNING /i.test(line) || /\b429\b|rate.?limit/i.test(line)) return 'warning'
  return 'info'
}

function parseLogLines(lines: string[]): LogEntry[] {
  return [...lines].reverse().map((raw) => {
    const m = LOG_RE.exec(raw)
    return {
      raw,
      level: classifyLine(raw),
      timestamp: m ? m[1] : '',
      message: m ? m[3] : raw,
    }
  })
}

// ─── Formatters ───────────────────────────────────────────────────────────────

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

// ─── Component ────────────────────────────────────────────────────────────────

export default function RebuyClient() {
  const [scrapes, setScrapes] = useState<RebuyScrape[]>([])
  const [settings, setSettings] = useState<RebuySettings | null>(null)
  const [containerOnline, setContainerOnline] = useState<boolean | null>(null)
  const [containerReason, setContainerReason] = useState<string>('')
  const [backupProxyConfigured, setBackupProxyConfigured] = useState<boolean | null>(null)
  const [usingProxy, setUsingProxy] = useState<boolean>(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isTriggeringNow, setIsTriggeringNow] = useState(false)
  const [isCancelling, setIsCancelling] = useState(false)
  const [isSavingSettings, setIsSavingSettings] = useState(false)
  const [isCheckingContainer, setIsCheckingContainer] = useState(false)
  const [editDays, setEditDays] = useState<string[]>(['Sun'])
  const [editTime, setEditTime] = useState('02:00')
  const [editContainerUrl, setEditContainerUrl] = useState('')
  const [editBackupProxyUrl, setEditBackupProxyUrl] = useState('')
  const [downloadingId, setDownloadingId] = useState<string | null>(null)
  const [isClearingHistory, setIsClearingHistory] = useState(false)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [showLogs, setShowLogs] = useState(false)
  const [logEntries, setLogEntries] = useState<LogEntry[]>([])
  const [logFilter, setLogFilter] = useState<LogLevel | 'all'>('all')
  const [isLoadingLogs, setIsLoadingLogs] = useState(false)
  const [isClearingLogs, setIsClearingLogs] = useState(false)
  const [logError, setLogError] = useState<string | null>(null)
  const logHasErrors = logEntries.some((e) => e.level === 'error')
  const pollRef = useRef<NodeJS.Timeout | null>(null)
  const logPollRef = useRef<NodeJS.Timeout | null>(null)

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
      const parsed = parseSchedule(data.schedule)
      setEditDays(parsed.days)
      setEditTime(parsed.time)
      setEditContainerUrl(data.container_url ?? '')
      setEditBackupProxyUrl(data.backup_proxy_url ?? '')
    }
  }, [])

  const checkContainer = useCallback(async (showFeedback = false) => {
    if (showFeedback) setIsCheckingContainer(true)
    try {
      const res = await fetch('/api/rebuy/container')
      if (res.ok) {
        const data = await res.json()
        setContainerOnline(data.online ?? false)
        setContainerReason(data.reason ?? '')
        if (data.backup_proxy_configured !== undefined) setBackupProxyConfigured(data.backup_proxy_configured)
        if (data.using_proxy !== undefined) setUsingProxy(data.using_proxy)
        if (showFeedback) {
          if (data.online) toast.success('Container ist online und erreichbar')
          else toast.error(`Container offline: ${data.reason ?? 'Nicht erreichbar'}`)
        }
      } else {
        setContainerOnline(false)
        setContainerReason('API-Fehler')
        if (showFeedback) toast.error('Verbindungsfehler beim Container-Check')
      }
    } finally {
      if (showFeedback) setIsCheckingContainer(false)
    }
  }, [])

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

  const loadLogs = useCallback(async () => {
    setIsLoadingLogs(true)
    setLogError(null)
    try {
      const res = await fetch('/api/rebuy/logs')
      const data = await res.json()
      if (data.error && !data.lines?.length) {
        setLogError(data.error)
      } else {
        setLogEntries(parseLogLines(data.lines ?? []))
      }
    } catch {
      setLogError('Netzwerkfehler')
    } finally {
      setIsLoadingLogs(false)
    }
  }, [])

  // Logs-Polling: alle 15s wenn Panel offen und Scrape läuft
  useEffect(() => {
    if (showLogs) {
      loadLogs()
      const hasRunning = scrapes.some((s) => s.status === 'running' || s.status === 'pending')
      if (hasRunning) {
        logPollRef.current = setInterval(loadLogs, 15_000)
      }
    } else {
      if (logPollRef.current) {
        clearInterval(logPollRef.current)
        logPollRef.current = null
      }
    }
    return () => {
      if (logPollRef.current) clearInterval(logPollRef.current)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showLogs])

  const handleClearLogs = async () => {
    setIsClearingLogs(true)
    try {
      const res = await fetch('/api/rebuy/logs/clear', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error ?? 'Fehler beim Leeren'); return }
      setLogEntries([])
      toast.success('Logs geleert')
    } catch {
      toast.error('Netzwerkfehler')
    } finally {
      setIsClearingLogs(false)
    }
  }

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

  const handleCancel = async () => {
    if (!confirm('Scrape wirklich abbrechen?')) return
    setIsCancelling(true)
    try {
      const res = await fetch('/api/rebuy/cancel', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error ?? 'Fehler beim Abbrechen')
        return
      }
      toast.success('Scrape abgebrochen')
      await loadScrapes()
    } catch {
      toast.error('Netzwerkfehler')
    } finally {
      setIsCancelling(false)
    }
  }

  const toggleDay = (day: string) => {
    setEditDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    )
  }

  const handleSaveSettings = async () => {
    setIsSavingSettings(true)
    try {
      const schedule = buildSchedule(editDays, editTime)
      const res = await fetch('/api/rebuy/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ schedule, container_url: editContainerUrl || '', backup_proxy_url: editBackupProxyUrl }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error ?? 'Fehler beim Speichern')
        return
      }
      setSettings(data)
      toast.success('Einstellungen gespeichert')
      checkContainer(false)
    } catch {
      toast.error('Netzwerkfehler')
    } finally {
      setIsSavingSettings(false)
    }
  }

  const handleClearHistory = async () => {
    if (!confirm('Verlauf wirklich leeren? Alle Einträge (inkl. Fehler-Logs) werden gelöscht.')) return
    setIsClearingHistory(true)
    try {
      const res = await fetch('/api/rebuy/clear-history', { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error ?? 'Fehler beim Löschen')
        return
      }
      toast.success('Verlauf geleert')
      await loadScrapes()
    } catch {
      toast.error('Netzwerkfehler')
    } finally {
      setIsClearingHistory(false)
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

  const activeScrape = scrapes.find((s) => s.status === 'running' || s.status === 'pending') ?? null
  const completedScrapes = scrapes.filter((s) => s.status === 'success' || s.status === 'failed')
  const latestSuccess = completedScrapes.find((s) => s.status === 'success') ?? null
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
      {latestSuccess && latestSuccess.scrape_date && (() => {
        const daysSince = Math.floor((Date.now() - new Date(latestSuccess.scrape_date).getTime()) / 86400000)
        return daysSince > 8 ? (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Letzter Scrape vor {daysSince} Tagen — der Container ist möglicherweise ausgefallen.
            </AlertDescription>
          </Alert>
        ) : null
      })()}

      {/* Aktiver Scrape — Fortschrittsanzeige (nur wenn läuft) */}
      {activeScrape && (() => {
        const pages = activeScrape.progress_pages ?? 0
        const total = activeScrape.total_pages ?? 0
        const isPreparing = pages === 0
        // ETA nur anzeigen wenn pages > 0 und eta realistisch (<= 72h)
        const showEta = !isPreparing && activeScrape.eta_seconds != null && activeScrape.eta_seconds > 0
        return (
          <Card className="border-blue-500/40 bg-blue-500/5">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center justify-between">
                <span className="flex items-center gap-2 text-blue-600">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {isPreparing ? 'Vorbereitung läuft…' : 'Scraping läuft…'}
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2 text-xs text-red-600 hover:bg-red-50 hover:text-red-700"
                  onClick={handleCancel}
                  disabled={isCancelling}
                >
                  {isCancelling
                    ? <Loader2 className="h-3 w-3 animate-spin" />
                    : <><Square className="h-3 w-3 mr-1" />Abbrechen</>
                  }
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {isPreparing ? (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">
                    Der Scraper zählt alle Formate und Jahre auf rebuy.de — das dauert 30–90 Minuten bevor die erste Seite erscheint.
                  </p>
                  <Progress value={null} className="h-2.5 animate-pulse" />
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">
                      {pages.toLocaleString('de-DE')} / {total > 0 ? total.toLocaleString('de-DE') : '?'} Seiten
                    </span>
                    <span className="font-semibold">{progressPercent}%</span>
                  </div>
                  <Progress value={progressPercent} className="h-2.5" />
                </>
              )}
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Gestartet: {formatDate(activeScrape.started_at)} · Laufzeit: {formatDuration(activeScrape.started_at, null)}</span>
                {showEta && (
                  <span className="font-medium text-blue-600">
                    Fertig in ca. {formatEta(activeScrape.eta_seconds!)}
                  </span>
                )}
                {!isPreparing && !showEta && activeScrape.eta_seconds != null && activeScrape.eta_seconds > 0 && (
                  <span className="text-muted-foreground">Restzeit wird berechnet…</span>
                )}
              </div>
            </CardContent>
          </Card>
        )
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
          <CardContent className="space-y-3">
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

            {/* Proxy-Status */}
            {containerOnline === true && backupProxyConfigured !== null && (
              <div className={[
                'flex items-start gap-1.5 rounded-md px-2 py-1.5 text-[11px]',
                usingProxy
                  ? 'bg-amber-50 text-amber-700'
                  : backupProxyConfigured
                    ? 'bg-blue-50 text-blue-700'
                    : 'bg-muted/50 text-muted-foreground',
              ].join(' ')}>
                {usingProxy
                  ? <Shield className="h-3 w-3 mt-0.5 shrink-0" />
                  : backupProxyConfigured
                    ? <ShieldOff className="h-3 w-3 mt-0.5 shrink-0" />
                    : <ShieldOff className="h-3 w-3 mt-0.5 shrink-0" />
                }
                <span>
                  {usingProxy
                    ? <><strong>DataImpulse Proxy aktiv</strong> — Scraper nutzt Backup-IP</>
                    : backupProxyConfigured
                      ? <><strong>Home-IP aktiv</strong> — wechselt bei 5× 429 automatisch zu DataImpulse</>
                      : 'Kein Backup-Proxy konfiguriert'
                  }
                </span>
              </div>
            )}

            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs w-fit"
              onClick={() => checkContainer(true)}
              disabled={isCheckingContainer}
            >
              {isCheckingContainer
                ? <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                : <RefreshCw className="h-3 w-3 mr-1" />
              }
              Prüfen
            </Button>
          </CardContent>
        </Card>

        {/* Karte 2: Letztes Ergebnis */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Letztes Ergebnis
            </CardTitle>
          </CardHeader>
          <CardContent>
            {latestSuccess ? (
              <div className="space-y-2">
                <p className="font-semibold text-green-600">
                  {latestSuccess.row_count?.toLocaleString('de-DE')} Einträge
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatDate(latestSuccess.scrape_date)} · Preise: Brutto (inkl. MwSt.)
                </p>
                <Button
                  size="sm"
                  className="h-7 bg-green-600 hover:bg-green-700 text-white text-xs"
                  onClick={() => handleDownload(latestSuccess)}
                  disabled={downloadingId === latestSuccess.id}
                >
                  {downloadingId === latestSuccess.id
                    ? <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                    : <Download className="h-3 w-3 mr-1" />
                  }
                  Excel herunterladen
                </Button>
              </div>
            ) : activeScrape ? (
              <p className="text-sm text-muted-foreground">Scrape läuft — noch kein fertiges Ergebnis</p>
            ) : (
              <p className="text-sm text-muted-foreground">Noch kein Scrape abgeschlossen</p>
            )}
          </CardContent>
        </Card>

        {/* Karte 3: Einstellungen */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Settings2 className="h-4 w-4" />
              Einstellungen
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* Wochentage */}
            <div className="space-y-1.5">
              <Label className="text-xs">Automatisch scrapen an:</Label>
              <div className="flex flex-wrap gap-1.5">
                {WEEKDAYS.map((day) => (
                  <label
                    key={day.value}
                    className="flex items-center gap-1 cursor-pointer select-none"
                  >
                    <Checkbox
                      checked={editDays.includes(day.value)}
                      onCheckedChange={() => toggleDay(day.value)}
                      className="h-3.5 w-3.5"
                    />
                    <span className="text-xs">{day.label}</span>
                  </label>
                ))}
              </div>
              {editDays.length === 0 && (
                <p className="text-xs text-muted-foreground">Kein Auto-Run (nur manuell)</p>
              )}
            </div>

            {/* Uhrzeit */}
            {editDays.length > 0 && (
              <div className="space-y-1">
                <Label className="text-xs">Uhrzeit (Uhr)</Label>
                <Input
                  type="time"
                  className="h-7 text-xs w-28"
                  value={editTime}
                  onChange={(e) => setEditTime(e.target.value)}
                />
              </div>
            )}

            {/* Dauer-Hinweis */}
            <div className="flex items-start gap-1.5 rounded-md bg-muted/50 px-2 py-1.5">
              <Info className="h-3 w-3 mt-0.5 shrink-0 text-muted-foreground" />
              <p className="text-[11px] text-muted-foreground leading-snug">
                Ein vollständiger Scrape dauert <strong>2–3 Tage</strong> (mit DataImpulse-Proxy). Für wöchentliche Nutzung empfehlen wir <strong>Freitag</strong>, damit die Datei am Montag bereitsteht.
              </p>
            </div>

            {/* Erweitert */}
            <button
              type="button"
              className="text-[11px] text-muted-foreground hover:text-foreground flex items-center gap-1"
              onClick={() => setShowAdvanced((v) => !v)}
            >
              {showAdvanced ? '▾' : '▸'} Erweitert
            </button>
            {showAdvanced && (
              <div className="space-y-3">
                <div className="space-y-1">
                  <Label className="text-xs">Container-URL</Label>
                  <Input
                    className="h-8 text-xs"
                    placeholder="https://rebuy-scraper.domain.com"
                    value={editContainerUrl}
                    onChange={(e) => setEditContainerUrl(e.target.value)}
                  />
                  <p className="text-[10px] text-muted-foreground">
                    Cloudflare-Tunnel-URL des Scraper-Containers. Nur ändern wenn sich die URL ändert.
                  </p>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Backup-Proxy-URL <span className="text-muted-foreground">(optional)</span></Label>
                  <Input
                    className="h-8 text-xs"
                    placeholder="http://user:pass@gw.dataimpulse.com:823"
                    value={editBackupProxyUrl}
                    onChange={(e) => setEditBackupProxyUrl(e.target.value)}
                  />
                  <p className="text-[10px] text-muted-foreground leading-snug">
                    Alle Anfragen laufen direkt über diesen Proxy (per-Request IP-Rotation). Empfehlung: DataImpulse.com (~$2/GB, kein Ablaufdatum).
                  </p>
                </div>
              </div>
            )}

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

      {/* Logs-Panel */}
      <div className="space-y-2">
        <button
          type="button"
          onClick={() => setShowLogs((v) => !v)}
          className={[
            'flex items-center gap-2 text-sm font-medium px-3 py-1.5 rounded-md border transition-all',
            logHasErrors && !showLogs
              ? 'border-red-400 text-red-600 bg-red-50 animate-pulse hover:animate-none'
              : 'border-border text-muted-foreground hover:text-foreground hover:bg-muted/50',
          ].join(' ')}
        >
          <Terminal className="h-4 w-4" />
          Container-Logs
          {logHasErrors && !showLogs && (
            <span className="ml-1 h-2 w-2 rounded-full bg-red-500" />
          )}
          {showLogs ? <ChevronUp className="h-3 w-3 ml-1" /> : <ChevronDown className="h-3 w-3 ml-1" />}
        </button>

        {showLogs && (
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <CardTitle className="text-sm font-medium">Container-Logs</CardTitle>
                  {logEntries.length > 0 && (
                    <span className="text-xs text-muted-foreground">({logEntries.length} Einträge)</span>
                  )}
                </div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {(['all', 'error', 'warning', 'info'] as const).map((f) => {
                    const count = f === 'all' ? logEntries.length : logEntries.filter((e) => e.level === f).length
                    const labels = { all: 'Alle', error: 'Fehler', warning: 'Warnung', info: 'Info' }
                    const colors: Record<string, string> = {
                      all: logFilter === 'all' ? 'bg-foreground text-background' : 'hover:bg-muted',
                      error: logFilter === 'error' ? 'bg-red-600 text-white' : 'text-red-600 hover:bg-red-50',
                      warning: logFilter === 'warning' ? 'bg-amber-500 text-white' : 'text-amber-600 hover:bg-amber-50',
                      info: logFilter === 'info' ? 'bg-muted text-foreground' : 'hover:bg-muted',
                    }
                    return (
                      <button key={f} type="button" onClick={() => setLogFilter(f)}
                        className={`text-[11px] px-2 py-0.5 rounded border border-transparent transition-colors ${colors[f]}`}>
                        {labels[f]}{count > 0 ? ` (${count})` : ''}
                      </button>
                    )
                  })}
                  <button type="button" onClick={loadLogs} disabled={isLoadingLogs}
                    className="text-muted-foreground hover:text-foreground transition-colors" title="Aktualisieren">
                    <RefreshCw className={`h-3.5 w-3.5 ${isLoadingLogs ? 'animate-spin' : ''}`} />
                  </button>
                  <button type="button" onClick={handleClearLogs} disabled={isClearingLogs || logEntries.length === 0}
                    className="text-[11px] px-2 py-0.5 rounded border border-transparent text-red-500 hover:bg-red-50 hover:text-red-700 transition-colors disabled:opacity-40">
                    {isClearingLogs ? <Loader2 className="h-3 w-3 animate-spin" /> : <><Trash2 className="h-3 w-3 inline mr-0.5" />Leeren</>}
                  </button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {logError ? (
                <p className="text-sm text-red-500 py-4 text-center px-4">{logError}</p>
              ) : logEntries.length === 0 ? (
                <p className="text-sm text-muted-foreground py-6 text-center">
                  {isLoadingLogs ? 'Lade Logs…' : 'Keine Log-Einträge vorhanden'}
                </p>
              ) : (
                <div className="max-h-96 overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead className="w-20 text-xs py-2">Art</TableHead>
                        <TableHead className="w-36 text-xs py-2">Datum</TableHead>
                        <TableHead className="text-xs py-2">Meldung</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {logEntries
                        .filter((e) => logFilter === 'all' || e.level === logFilter)
                        .map((entry, i) => (
                          <TableRow key={i} className="hover:bg-muted/30">
                            <TableCell className="py-1.5">
                              {entry.level === 'error' && (
                                <span className="inline-flex items-center gap-1 text-[10px] font-medium text-red-600 bg-red-50 rounded px-1.5 py-0.5">
                                  <XCircle className="h-2.5 w-2.5" />Fehler
                                </span>
                              )}
                              {entry.level === 'warning' && (
                                <span className="inline-flex items-center gap-1 text-[10px] font-medium text-amber-600 bg-amber-50 rounded px-1.5 py-0.5">
                                  <AlertCircle className="h-2.5 w-2.5" />Warnung
                                </span>
                              )}
                              {entry.level === 'info' && (
                                <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground bg-muted rounded px-1.5 py-0.5">
                                  <Info className="h-2.5 w-2.5" />Info
                                </span>
                              )}
                            </TableCell>
                            <TableCell className="py-1.5 text-xs text-muted-foreground font-mono whitespace-nowrap">
                              {entry.timestamp || '—'}
                            </TableCell>
                            <TableCell className="py-1.5 text-xs font-mono break-all">
                              {entry.message}
                            </TableCell>
                          </TableRow>
                        ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Archiv-Tabelle — nur abgeschlossene Scrapes */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Scrape-Verlauf</CardTitle>
          {completedScrapes.length > 0 && (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-xs text-muted-foreground hover:text-red-600 hover:bg-red-50"
              onClick={handleClearHistory}
              disabled={isClearingHistory}
            >
              {isClearingHistory
                ? <Loader2 className="h-3 w-3 animate-spin mr-1" />
                : <Trash2 className="h-3 w-3 mr-1" />
              }
              Verlauf leeren
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {completedScrapes.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              Noch kein abgeschlossener Scrape vorhanden. Starte den ersten Scrape über &quot;Jetzt starten&quot;.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Datum</TableHead>
                  <TableHead>Einträge</TableHead>
                  <TableHead>Dauer</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Download</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {completedScrapes.map((scrape) => (
                  <TableRow key={scrape.id}>
                    <TableCell className="text-sm">
                      {formatDate(scrape.scrape_date ?? scrape.created_at)}
                    </TableCell>
                    <TableCell className="text-sm">
                      {scrape.row_count != null
                        ? scrape.row_count.toLocaleString('de-DE')
                        : '—'
                      }
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDuration(scrape.started_at, scrape.finished_at)}
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
