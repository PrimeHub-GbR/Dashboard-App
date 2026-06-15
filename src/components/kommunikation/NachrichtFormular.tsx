'use client'

import { useState, useCallback, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Separator } from '@/components/ui/separator'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Loader2, MessageSquareText, LayoutTemplate } from 'lucide-react'
import { EmpfaengerSelector, type SelectableEmployee } from './EmpfaengerSelector'
import { useKommunikation } from '@/hooks/useKommunikation'
import { useTemplates, countVars, renderTemplate } from '@/hooks/useTemplates'
import { cn } from '@/lib/utils'

interface Props {
  employees: SelectableEmployee[]
  onMessageSent?: () => void
  footer?: string
}

type Mode = 'text' | 'template'

export function NachrichtFormular({ employees, onMessageSent, footer }: Props) {
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [allSelected, setAllSelected] = useState(false)
  const [mode, setMode] = useState<Mode>('text')
  const [message, setMessage] = useState('')
  const [templateId, setTemplateId] = useState<string>('')
  const [templateValues, setTemplateValues] = useState<string[]>([])
  const [debounced, setDebounced] = useState(false)
  const { sending, sendMessage } = useKommunikation()
  const { templates } = useTemplates()

  const approved = useMemo(() => templates.filter((t) => t.status === 'APPROVED'), [templates])
  const selectedTemplate = approved.find((t) => t.id === templateId)
  const tplVarCount = selectedTemplate ? countVars(selectedTemplate.body_text) : 0

  const activeWithPhone = employees.filter((e) => e.is_active !== false && !!e.phone)
  const allActiveIds = activeWithPhone.map((e) => e.id)
  const effectiveRecipients = allSelected ? allActiveIds : selectedIds
  const recipientCount = effectiveRecipients.length

  const templateReady =
    !!selectedTemplate &&
    Array.from({ length: tplVarCount }).every((_, i) => (templateValues[i] ?? '').trim().length > 0)

  const canSend =
    recipientCount > 0 &&
    !sending &&
    !debounced &&
    (mode === 'text'
      ? message.trim().length > 0 && message.length <= 1000
      : templateReady)

  const handleAllChange = (checked: boolean) => {
    setAllSelected(checked)
    if (checked) setSelectedIds([])
  }

  const selectTemplate = (id: string) => {
    setTemplateId(id)
    const tpl = approved.find((t) => t.id === id)
    setTemplateValues(Array.from({ length: tpl ? countVars(tpl.body_text) : 0 }, () => ''))
  }

  const handleSend = useCallback(async () => {
    if (!canSend) return
    setDebounced(true)

    const ok = mode === 'template' && selectedTemplate
      ? await sendMessage({
          recipient_ids: effectiveRecipients,
          message: renderTemplate(selectedTemplate.body_text, templateValues),
          context: 'manual',
          template_name: selectedTemplate.name,
          template_language: selectedTemplate.language,
          template_params: templateValues.map((v) => v.trim()),
        })
      : await sendMessage({
          recipient_ids: effectiveRecipients,
          message: message.trim(),
          context: 'manual',
        })

    if (ok) {
      setSelectedIds([])
      setAllSelected(false)
      setMessage('')
      setTemplateValues(Array.from({ length: tplVarCount }, () => ''))
      onMessageSent?.()
    }
    setTimeout(() => setDebounced(false), 3000)
  }, [canSend, mode, selectedTemplate, sendMessage, effectiveRecipients, templateValues, message, tplVarCount, onMessageSent])

  const isOverLimit = message.length > 1000

  return (
    <div className="rounded-xl border border-border bg-card p-6 space-y-4">
      <h2 className="text-lg font-medium text-foreground">Neue Nachricht</h2>
      <Separator />

      {/* Modus-Umschalter */}
      <div className="grid grid-cols-2 gap-2 rounded-lg bg-muted/50 p-1">
        <button
          type="button"
          onClick={() => setMode('text')}
          className={cn(
            'flex items-center justify-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
            mode === 'text' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground'
          )}
        >
          <MessageSquareText className="h-4 w-4" />
          Freier Text
        </button>
        <button
          type="button"
          onClick={() => setMode('template')}
          className={cn(
            'flex items-center justify-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
            mode === 'template' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground'
          )}
        >
          <LayoutTemplate className="h-4 w-4" />
          Vorlage
        </button>
      </div>

      {mode === 'text' ? (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-900/20 dark:text-amber-300">
          Freier Text erreicht nur Mitarbeiter, die in den letzten 24 h geschrieben haben. Für proaktive
          Nachrichten eine <strong>Vorlage</strong> nutzen.
        </p>
      ) : null}

      {/* Empfänger */}
      <div className="space-y-1.5">
        <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Empfänger *
        </Label>
        <EmpfaengerSelector
          employees={employees}
          selected={selectedIds}
          onChange={setSelectedIds}
          disabled={allSelected}
        />
      </div>

      <div className="flex items-center gap-2">
        <Checkbox id="an-alle" checked={allSelected} onCheckedChange={(v) => handleAllChange(v === true)} />
        <label htmlFor="an-alle" className="text-sm cursor-pointer select-none">
          An alle Mitarbeiter senden
          {allSelected && activeWithPhone.length > 0 && (
            <span className="ml-1 text-muted-foreground">({activeWithPhone.length})</span>
          )}
        </label>
      </div>

      {mode === 'text' ? (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Nachricht *</Label>
            <span className={`text-xs tabular-nums ${isOverLimit ? 'text-destructive font-medium' : 'text-muted-foreground'}`}>
              {message.length}/1000
            </span>
          </div>
          <Textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Nachricht eingeben…"
            className="min-h-[100px] resize-none"
            maxLength={1000}
          />
          {footer && footer.trim().length > 0 && (
            <p className="rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
              <span className="font-medium text-foreground/70">Automatischer Zusatz:</span> {footer}
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Vorlage *</Label>
            {approved.length === 0 ? (
              <p className="rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
                Noch keine genehmigte Vorlage vorhanden. Lege im Tab „Vorlagen" eine an (Meta-Genehmigung nötig).
              </p>
            ) : (
              <Select value={templateId} onValueChange={selectTemplate}>
                <SelectTrigger><SelectValue placeholder="Vorlage wählen…" /></SelectTrigger>
                <SelectContent>
                  {approved.map((t) => (
                    <SelectItem key={t.id} value={t.id}>{t.display_name || t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {selectedTemplate && tplVarCount > 0 && (
            <div className="space-y-2 rounded-lg bg-muted/40 p-3">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">Platzhalter ausfüllen</Label>
              {Array.from({ length: tplVarCount }, (_, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="w-10 font-mono text-xs text-muted-foreground">{`{{${i + 1}}}`}</span>
                  <Input
                    value={templateValues[i] ?? ''}
                    onChange={(e) => {
                      const next = [...templateValues]
                      next[i] = e.target.value
                      setTemplateValues(next)
                    }}
                    placeholder={`Wert für {{${i + 1}}}`}
                    className="h-8"
                  />
                </div>
              ))}
            </div>
          )}

          {selectedTemplate && (
            <div className="space-y-1.5">
              <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Vorschau</Label>
              <p className="whitespace-pre-wrap rounded-md border border-border bg-background px-3 py-2 text-sm">
                {renderTemplate(selectedTemplate.body_text, templateValues)}
              </p>
            </div>
          )}
        </div>
      )}

      {recipientCount > 0 && canSend && (
        <p className="text-sm text-muted-foreground">
          Wird an {recipientCount} {recipientCount === 1 ? 'Empfänger' : 'Empfängern'} gesendet
        </p>
      )}

      <div className="flex justify-end">
        <Button onClick={handleSend} disabled={!canSend} className="w-full sm:w-auto">
          {sending ? (<><Loader2 className="h-4 w-4 animate-spin" />Wird gesendet…</>) : 'Senden'}
        </Button>
      </div>
    </div>
  )
}
