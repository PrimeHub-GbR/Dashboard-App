'use client'

import { useState, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { Separator } from '@/components/ui/separator'
import { Loader2 } from 'lucide-react'
import { EmpfaengerSelector, type SelectableEmployee } from './EmpfaengerSelector'
import { useKommunikation } from '@/hooks/useKommunikation'

interface Props {
  employees: SelectableEmployee[]
  onMessageSent?: () => void
}

export function NachrichtFormular({ employees, onMessageSent }: Props) {
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [allSelected, setAllSelected] = useState(false)
  const [message, setMessage] = useState('')
  const [debounced, setDebounced] = useState(false)
  const { sending, sendMessage } = useKommunikation()

  const activeWithPhone = employees.filter((e) => e.is_active !== false && !!e.phone)
  const allActiveIds = activeWithPhone.map((e) => e.id)

  const effectiveRecipients = allSelected ? allActiveIds : selectedIds
  const recipientCount = effectiveRecipients.length

  const canSend =
    recipientCount > 0 &&
    message.trim().length > 0 &&
    message.length <= 1000 &&
    !sending &&
    !debounced

  const handleAllChange = (checked: boolean) => {
    setAllSelected(checked)
    if (checked) setSelectedIds([])
  }

  const handleSend = useCallback(async () => {
    if (!canSend) return

    setDebounced(true)
    const ok = await sendMessage({
      recipient_ids: effectiveRecipients,
      message: message.trim(),
      context: 'manual',
    })

    if (ok) {
      setSelectedIds([])
      setAllSelected(false)
      setMessage('')
      onMessageSent?.()
    }

    // 3s Debounce
    setTimeout(() => setDebounced(false), 3000)
  }, [canSend, sendMessage, effectiveRecipients, message, onMessageSent])

  const isOverLimit = message.length > 1000

  return (
    <div className="rounded-xl border border-border bg-card p-6 space-y-4">
      <h2 className="text-lg font-medium text-foreground">Neue Nachricht</h2>
      <Separator />

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

      {/* An alle senden */}
      <div className="flex items-center gap-2">
        <Checkbox
          id="an-alle"
          checked={allSelected}
          onCheckedChange={(v) => handleAllChange(v === true)}
        />
        <label
          htmlFor="an-alle"
          className="text-sm cursor-pointer select-none"
        >
          An alle Mitarbeiter senden
          {allSelected && activeWithPhone.length > 0 && (
            <span className="ml-1 text-muted-foreground">({activeWithPhone.length})</span>
          )}
        </label>
      </div>

      {/* Nachricht */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Nachricht *
          </Label>
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
      </div>

      {/* Vorschau */}
      {recipientCount > 0 && message.trim().length > 0 && (
        <p className="text-sm text-muted-foreground">
          Wird an {recipientCount} {recipientCount === 1 ? 'Empfänger' : 'Empfängern'} gesendet
        </p>
      )}

      {/* Senden */}
      <div className="flex justify-end">
        <Button
          onClick={handleSend}
          disabled={!canSend}
          className="w-full sm:w-auto"
        >
          {sending ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Wird gesendet…
            </>
          ) : (
            'Senden'
          )}
        </Button>
      </div>
    </div>
  )
}
