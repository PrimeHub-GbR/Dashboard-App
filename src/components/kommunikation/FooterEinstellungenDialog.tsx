'use client'

import { useState } from 'react'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Settings, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

interface Props {
  footer: string
  onSaved: (footer: string) => void
}

export function FooterEinstellungenDialog({ footer, onSaved }: Props) {
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState(footer)
  const [saving, setSaving] = useState(false)

  // Beim Öffnen aktuellen Wert übernehmen
  const handleOpenChange = (next: boolean) => {
    if (next) setValue(footer)
    setOpen(next)
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const res = await fetch('/api/kommunikation/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message_footer: value }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: unknown }
        const msg = typeof data.error === 'string' ? data.error : 'Speichern fehlgeschlagen'
        toast.error(msg)
        return
      }
      const data = await res.json() as { message_footer: string }
      onSaved(data.message_footer)
      toast.success('Fußzeile gespeichert')
      setOpen(false)
    } catch {
      toast.error('Netzwerkfehler — bitte erneut versuchen')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Settings className="h-4 w-4" />
          Fußzeile
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Standard-Fußzeile</DialogTitle>
          <DialogDescription>
            Dieser Text wird automatisch an jede gesendete WhatsApp-Nachricht angehängt.
            Leer lassen, um keine Fußzeile anzuhängen.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Fußzeilen-Text
            </Label>
            <span className={`text-xs tabular-nums ${value.length > 500 ? 'text-destructive font-medium' : 'text-muted-foreground'}`}>
              {value.length}/500
            </span>
          </div>
          <Textarea
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="z.B. Bitte antworten Sie nicht auf diese Nachricht…"
            className="min-h-[100px] resize-none"
            maxLength={500}
          />
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={saving}>
            Abbrechen
          </Button>
          <Button onClick={handleSave} disabled={saving || value.length > 500}>
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Speichern…
              </>
            ) : (
              'Speichern'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
