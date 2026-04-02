'use client'

import { useState } from 'react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Loader2, AlertTriangle } from 'lucide-react'
import type { MessageContext } from '@/hooks/useKommunikation'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  recipientId: string
  recipientName: string
  phone: string
  prefillText: string
  context: MessageContext
  contextRefId?: string | null
  onSuccess?: () => void
}

export function WhatsAppSendenDialog({
  open,
  onOpenChange,
  recipientId,
  recipientName,
  phone,
  prefillText,
  context,
  contextRefId,
  onSuccess,
}: Props) {
  const [text, setText] = useState(prefillText)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Reset text when dialog opens
  const handleOpenChange = (val: boolean) => {
    if (val) {
      setText(prefillText)
      setError(null)
    }
    onOpenChange(val)
  }

  const handleSend = async () => {
    if (!text.trim() || text.length > 1000) return
    setSending(true)
    setError(null)
    try {
      const res = await fetch('/api/kommunikation/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipient_ids: [recipientId],
          message: text.trim(),
          context,
          context_ref_id: contextRefId ?? null,
        }),
      })

      if (!res.ok) {
        const data = await res.json() as { error?: string }
        setError(data.error ?? 'Unbekannter Fehler')
        return
      }

      onOpenChange(false)
      onSuccess?.()
    } catch {
      setError('Netzwerkfehler — bitte erneut versuchen')
    } finally {
      setSending(false)
    }
  }

  const isOverLimit = text.length > 1000
  const canSend = text.trim().length > 0 && !isOverLimit && !sending

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-[500px]">
        <DialogHeader>
          <DialogTitle>WhatsApp senden</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Empfänger (read-only) */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Empfänger
            </Label>
            <div className="rounded-lg bg-muted px-4 py-3">
              <p className="text-sm font-medium">{recipientName}</p>
              <p className="text-sm text-muted-foreground">{phone}</p>
            </div>
          </div>

          {/* Nachricht */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Nachricht
              </Label>
              <span className={`text-xs tabular-nums ${isOverLimit ? 'text-destructive font-medium' : 'text-muted-foreground'}`}>
                {text.length}/1000
              </span>
            </div>
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              className="min-h-[120px] resize-none"
              disabled={sending}
            />
          </div>

          {/* Fehler-Alert */}
          {error && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>Fehler beim Senden: {error}</AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={sending}
          >
            Abbrechen
          </Button>
          <Button onClick={handleSend} disabled={!canSend}>
            {sending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Wird gesendet…
              </>
            ) : (
              'Senden'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
