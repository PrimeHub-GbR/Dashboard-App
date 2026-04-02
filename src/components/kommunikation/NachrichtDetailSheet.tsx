'use client'

import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { AlertTriangle } from 'lucide-react'
import type { MessageLog } from '@/hooks/useKommunikation'

function fmt(dateStr: string) {
  return new Intl.DateTimeFormat('de-DE', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  }).format(new Date(dateStr))
}

function fmtDate(dateStr: string) {
  return new Intl.DateTimeFormat('de-DE', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  }).format(new Date(dateStr))
}

function fmtTime(dateStr: string) {
  return new Intl.DateTimeFormat('de-DE', {
    hour: '2-digit', minute: '2-digit',
  }).format(new Date(dateStr))
}

interface Props {
  log: MessageLog | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

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

export function NachrichtDetailSheet({ log, open, onOpenChange }: Props) {
  if (!log) return null

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-[480px] overflow-y-auto">
        <SheetHeader className="mb-6">
          <SheetTitle>
            Nachricht vom {fmtDate(log.created_at)}
            <span className="ml-1 text-muted-foreground font-normal text-sm">
              {fmtTime(log.created_at)} Uhr
            </span>
          </SheetTitle>
        </SheetHeader>

        <div className="space-y-5">
          {/* Empfänger */}
          <div className="space-y-1">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Empfänger
            </p>
            <p className="text-sm font-medium">{log.recipient_name ?? '—'}</p>
            <p className="text-sm text-muted-foreground">{log.recipient_phone}</p>
          </div>

          {/* Kontext */}
          <div className="space-y-1.5">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Kontext
            </p>
            <Badge className={CONTEXT_CLASSES[log.context] ?? 'bg-muted text-muted-foreground'}>
              {CONTEXT_LABELS[log.context] ?? log.context}
            </Badge>
          </div>

          {/* Absender */}
          <div className="space-y-1">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Absender
            </p>
            <p className="text-sm text-foreground">{log.sent_by_email ?? '—'}</p>
          </div>

          {/* Status */}
          <div className="space-y-1.5">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Status
            </p>
            <div className="flex items-center gap-2">
              <Badge className={STATUS_CLASSES[log.status] ?? ''}>
                {STATUS_LABELS[log.status] ?? log.status}
              </Badge>
              {log.n8n_triggered_at && (
                <span className="text-xs text-muted-foreground">
                  {fmt(log.n8n_triggered_at)}
                </span>
              )}
            </div>
            {log.status === 'failed' && log.error_message && (
              <Alert variant="destructive" className="mt-2">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>{log.error_message}</AlertDescription>
              </Alert>
            )}
          </div>

          {/* Nachrichtentext */}
          <div className="space-y-1.5">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Nachricht
            </p>
            <div className="rounded-lg bg-muted p-4 text-sm text-foreground whitespace-pre-wrap">
              {log.message_text}
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
