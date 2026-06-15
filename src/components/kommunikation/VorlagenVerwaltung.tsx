'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Plus, RefreshCw, Trash2, Loader2, Info } from 'lucide-react'
import { useTemplates, countVars, type WhatsAppTemplate, type CreateTemplateInput } from '@/hooks/useTemplates'

const STATUS_META: Record<string, { label: string; className: string }> = {
  APPROVED: { label: 'Genehmigt', className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' },
  PENDING: { label: 'In Prüfung', className: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' },
  LOCAL_PENDING: { label: 'Wird eingereicht…', className: 'bg-muted text-muted-foreground' },
  REJECTED: { label: 'Abgelehnt', className: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300' },
  ERROR: { label: 'Fehler', className: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300' },
  PAUSED: { label: 'Pausiert', className: 'bg-muted text-muted-foreground' },
  DISABLED: { label: 'Deaktiviert', className: 'bg-muted text-muted-foreground' },
}

function StatusBadge({ status }: { status: string }) {
  const meta = STATUS_META[status] ?? { label: status, className: 'bg-muted text-muted-foreground' }
  return <Badge className={`${meta.className} border-0 font-medium`}>{meta.label}</Badge>
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[äöü]/g, (c) => ({ ä: 'ae', ö: 'oe', ü: 'ue' }[c] ?? c))
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60)
}

export function VorlagenVerwaltung() {
  const { templates, loading, refreshing, create, remove, refresh } = useTemplates()

  return (
    <div className="rounded-xl border border-border bg-card p-6 space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-medium text-foreground">Vorlagen</h2>
          <p className="text-xs text-muted-foreground">
            Genehmigte Vorlagen erreichen Mitarbeiter auch ohne vorherigen Kontakt (24h-Fenster).
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={refresh} disabled={refreshing}>
            {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            <span className="hidden sm:inline">Status</span>
          </Button>
          <NeueVorlageDialog onCreate={create} existingNames={templates.map((t) => t.name)} />
        </div>
      </div>
      <Separator />

      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      ) : templates.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">
          Noch keine Vorlagen. Lege deine erste Vorlage an.
        </p>
      ) : (
        <ul className="space-y-3">
          {templates.map((t) => (
            <li key={t.id} className="rounded-lg border border-border p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-foreground">{t.display_name || t.name}</span>
                    <StatusBadge status={t.status} />
                    <Badge variant="outline" className="text-[10px]">{t.category}</Badge>
                  </div>
                  <p className="mt-1 font-mono text-[11px] text-muted-foreground">{t.name}</p>
                  <p className="mt-2 whitespace-pre-wrap text-sm text-foreground/80">{t.body_text}</p>
                  {t.status === 'REJECTED' && t.status_detail && (
                    <p className="mt-2 text-xs text-red-600 dark:text-red-400">
                      Ablehnungsgrund: {t.status_detail}
                    </p>
                  )}
                  {t.status === 'ERROR' && t.status_detail && (
                    <p className="mt-2 text-xs text-red-600 dark:text-red-400">{t.status_detail}</p>
                  )}
                </div>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-destructive">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Vorlage löschen?</AlertDialogTitle>
                      <AlertDialogDescription>
                        „{t.display_name || t.name}" wird auch bei Meta gelöscht und kann nicht mehr zum Senden verwendet werden.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                      <AlertDialogAction
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        onClick={() => void remove(t.id)}
                      >
                        Löschen
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function NeueVorlageDialog({
  onCreate,
  existingNames,
}: {
  onCreate: (input: CreateTemplateInput) => Promise<boolean>
  existingNames: string[]
}) {
  const [open, setOpen] = useState(false)
  const [displayName, setDisplayName] = useState('')
  const [name, setName] = useState('')
  const [nameTouched, setNameTouched] = useState(false)
  const [category, setCategory] = useState<'UTILITY' | 'MARKETING'>('UTILITY')
  const [body, setBody] = useState('')
  const [examples, setExamples] = useState<string[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const varCount = countVars(body)
  const trimmed = body.trim()
  const startsOrEndsWithVar = /^\{\{\d+\}\}/.test(trimmed) || /\{\{\d+\}\}$/.test(trimmed)

  // Beispielwert-Felder an die Anzahl Platzhalter anpassen.
  useEffect(() => {
    setExamples((prev) => {
      if (prev.length === varCount) return prev
      return Array.from({ length: varCount }, (_, i) => prev[i] ?? '')
    })
  }, [varCount])

  const effectiveName = nameTouched ? name : slugify(displayName)
  const nameValid = /^[a-z0-9_]{3,512}$/.test(effectiveName)
  const nameDuplicate = existingNames.includes(effectiveName)

  const canSubmit =
    displayName.trim().length > 0 &&
    nameValid &&
    !nameDuplicate &&
    body.trim().length > 0 &&
    !startsOrEndsWithVar &&
    examples.every((e) => e.trim().length > 0) &&
    !submitting

  const reset = () => {
    setDisplayName(''); setName(''); setNameTouched(false); setCategory('UTILITY')
    setBody(''); setExamples([]); setError(null)
  }

  const handleSubmit = async () => {
    setError(null)
    setSubmitting(true)
    const ok = await onCreate({
      name: effectiveName,
      display_name: displayName.trim(),
      category,
      language: 'de',
      body_text: body.trim(),
      example_values: examples.map((e) => e.trim()),
    })
    setSubmitting(false)
    if (ok) {
      reset()
      setOpen(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset() }}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="h-4 w-4" />
          Neue Vorlage
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Neue Vorlage</DialogTitle>
          <DialogDescription>
            Wird zur Genehmigung an Meta gesendet (meist Minuten). Platzhalter mit {'{{1}}'}, {'{{2}}'} …
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="t-display">Name *</Label>
            <Input
              id="t-display"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="z. B. PrimeHub Info"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="t-name">Technischer Name (für Meta) *</Label>
            <Input
              id="t-name"
              value={effectiveName}
              onChange={(e) => { setNameTouched(true); setName(e.target.value.toLowerCase()) }}
              placeholder="primehub_info"
              className="font-mono text-sm"
            />
            {!nameValid && effectiveName.length > 0 && (
              <p className="text-xs text-destructive">Nur Kleinbuchstaben, Ziffern und Unterstriche (min. 3 Zeichen).</p>
            )}
            {nameDuplicate && <p className="text-xs text-destructive">Dieser Name ist bereits vergeben.</p>}
          </div>

          <div className="space-y-1.5">
            <Label>Kategorie *</Label>
            <Select value={category} onValueChange={(v) => setCategory(v as 'UTILITY' | 'MARKETING')}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="UTILITY">Utility (Benachrichtigung / Info)</SelectItem>
                <SelectItem value="MARKETING">Marketing (Werbung)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="t-body">Text *</Label>
            <Textarea
              id="t-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Hallo {{1}}, hier eine Info aus dem Dashboard: {{2}}."
              className="min-h-[100px]"
              maxLength={1024}
            />
            <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
              <Info className="mt-0.5 h-3 w-3 shrink-0" />
              Platzhalter mit {'{{1}}'} usw. — sie dürfen nicht ganz am Anfang oder Ende stehen.
            </p>
            {startsOrEndsWithVar && (
              <p className="text-xs text-destructive">Ein Platzhalter darf nicht am Anfang oder Ende stehen.</p>
            )}
          </div>

          {varCount > 0 && (
            <div className="space-y-2 rounded-lg bg-muted/40 p-3">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                Beispielwerte (für Metas Prüfung)
              </Label>
              {Array.from({ length: varCount }, (_, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="w-10 font-mono text-xs text-muted-foreground">{`{{${i + 1}}}`}</span>
                  <Input
                    value={examples[i] ?? ''}
                    onChange={(e) => {
                      const next = [...examples]
                      next[i] = e.target.value
                      setExamples(next)
                    }}
                    placeholder={`Beispiel für {{${i + 1}}}`}
                    className="h-8"
                  />
                </div>
              ))}
            </div>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => { reset(); setOpen(false) }}>Abbrechen</Button>
          <Button onClick={handleSubmit} disabled={!canSubmit}>
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Zur Prüfung einreichen
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
