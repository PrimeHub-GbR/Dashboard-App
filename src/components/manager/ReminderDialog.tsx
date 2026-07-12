'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Reminder, Recurrence, RecipientOption, RECURRENCE_OPTIONS } from '@/lib/manager'

interface ReminderDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Wenn gesetzt: Bearbeiten-Modus, sonst Neu-Modus. */
  reminder?: Reminder | null
  onSaved: () => void
}

function todayIso() {
  return new Date().toISOString().slice(0, 10)
}

export function ReminderDialog({ open, onOpenChange, reminder, onSaved }: ReminderDialogProps) {
  const isEdit = !!reminder
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [nextDueDate, setNextDueDate] = useState(todayIso())
  const [recurrence, setRecurrence] = useState<Recurrence>('monthly')
  const [remindDaysBefore, setRemindDaysBefore] = useState('7')
  const [options, setOptions] = useState<RecipientOption[]>([])
  const [optionsLoading, setOptionsLoading] = useState(false)
  const [recipientIds, setRecipientIds] = useState<string[]>([])
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    if (reminder) {
      setTitle(reminder.title)
      setDescription(reminder.description ?? '')
      setNextDueDate(reminder.next_due_date)
      setRecurrence(reminder.recurrence)
      setRemindDaysBefore(String(reminder.remind_days_before))
      setRecipientIds(reminder.recipient_ids ?? [])
    } else {
      setTitle('')
      setDescription('')
      setNextDueDate(todayIso())
      setRecurrence('monthly')
      setRemindDaysBefore('7')
      setRecipientIds([])
    }
    // Empfänger-Optionen (aktive GF + Manager) laden.
    let cancelled = false
    setOptionsLoading(true)
    fetch('/api/manager/recipient-options')
      .then((res) => res.json())
      .then((json) => {
        if (cancelled) return
        const opts = (json.options ?? []) as RecipientOption[]
        setOptions(opts)
        // Neu-Modus: alle GF vorauswählen (entspricht dem alten Verhalten).
        if (!reminder) {
          setRecipientIds(opts.filter((o) => o.position === 'geschaeftsfuehrer').map((o) => o.id))
        }
      })
      .catch(() => { if (!cancelled) setOptions([]) })
      .finally(() => { if (!cancelled) setOptionsLoading(false) })
    return () => { cancelled = true }
  }, [open, reminder])

  function toggleRecipient(id: string, checked: boolean) {
    setRecipientIds((prev) =>
      checked ? [...prev.filter((x) => x !== id), id] : prev.filter((x) => x !== id)
    )
  }

  async function handleSave() {
    if (!title.trim()) {
      toast.error('Bitte einen Titel eingeben')
      return
    }
    if (recipientIds.length === 0) {
      toast.error('Bitte mindestens einen Empfänger wählen')
      return
    }
    setSaving(true)
    try {
      const payload = {
        title: title.trim(),
        description: description.trim(),
        next_due_date: nextDueDate,
        recurrence,
        remind_days_before: Number(remindDaysBefore) || 0,
        recipient_ids: recipientIds,
      }
      const url = isEdit ? `/api/manager/reminders/${reminder!.id}` : '/api/manager/reminders'
      const res = await fetch(url, {
        method: isEdit ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        toast.error(isEdit ? 'Aktualisieren fehlgeschlagen' : 'Erstellen fehlgeschlagen')
        return
      }
      toast.success(isEdit ? 'Frist aktualisiert' : 'Frist angelegt')
      onOpenChange(false)
      onSaved()
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Frist bearbeiten' : 'Neue Frist'}</DialogTitle>
          <DialogDescription>
            Pflichtfristen — Pop-up, Push &amp; WhatsApp gehen an die gewählten
            Empfänger (GF/Manager). Abhaken gilt geteilt für alle Empfänger.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="reminder-title">Titel</Label>
            <Input
              id="reminder-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="z. B. Umsatzsteuervoranmeldung"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="reminder-desc">Beschreibung</Label>
            <Textarea
              id="reminder-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optionale Details"
              rows={3}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="reminder-date">Stichtag</Label>
              <Input
                id="reminder-date"
                type="date"
                value={nextDueDate}
                onChange={(e) => setNextDueDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="reminder-days">Tage vorher erinnern</Label>
              <Input
                id="reminder-days"
                type="number"
                min={0}
                max={365}
                value={remindDaysBefore}
                onChange={(e) => setRemindDaysBefore(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Rhythmus</Label>
            <Select value={recurrence} onValueChange={(v) => setRecurrence(v as Recurrence)}>
              <SelectTrigger>
                <SelectValue placeholder="Rhythmus wählen" />
              </SelectTrigger>
              <SelectContent>
                {RECURRENCE_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Empfänger (mindestens 1)</Label>
            {optionsLoading ? (
              <p className="text-sm text-muted-foreground">Lädt…</p>
            ) : options.length === 0 ? (
              <p className="text-sm text-muted-foreground">Keine GF/Manager gefunden.</p>
            ) : (
              <div className="space-y-2 rounded-md border p-3">
                {options.map((o) => (
                  <label key={o.id} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={recipientIds.includes(o.id)}
                      onCheckedChange={(checked) => toggleRecipient(o.id, checked === true)}
                    />
                    <span>
                      {o.name}
                      {o.position === 'geschaeftsfuehrer' && (
                        <span className="text-muted-foreground"> (GF)</span>
                      )}
                    </span>
                  </label>
                ))}
              </div>
            )}
            {recipientIds.length === 0 && !optionsLoading && (
              <p className="text-xs text-destructive">Bitte mindestens einen Empfänger wählen.</p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Abbrechen
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? 'Speichern…' : 'Speichern'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
