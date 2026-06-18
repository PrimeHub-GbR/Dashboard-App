'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { CompanyInfo } from '@/lib/manager'

interface CompanyInfoDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  info?: CompanyInfo | null
  onSaved: () => void
}

export function CompanyInfoDialog({ open, onOpenChange, info, onSaved }: CompanyInfoDialogProps) {
  const isEdit = !!info
  const [label, setLabel] = useState('')
  const [value, setValue] = useState('')
  const [category, setCategory] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    if (info) {
      setLabel(info.label)
      setValue(info.value ?? '')
      setCategory(info.category ?? '')
    } else {
      setLabel('')
      setValue('')
      setCategory('')
    }
  }, [open, info])

  async function handleSave() {
    if (!label.trim()) {
      toast.error('Bitte eine Bezeichnung eingeben')
      return
    }
    setSaving(true)
    try {
      const payload = {
        label: label.trim(),
        value: value.trim(),
        category: category.trim(),
      }
      const url = isEdit ? `/api/manager/company-info/${info!.id}` : '/api/manager/company-info'
      const res = await fetch(url, {
        method: isEdit ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        toast.error(isEdit ? 'Aktualisieren fehlgeschlagen' : 'Erstellen fehlgeschlagen')
        return
      }
      toast.success(isEdit ? 'Eintrag aktualisiert' : 'Eintrag angelegt')
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
          <DialogTitle>{isEdit ? 'Eintrag bearbeiten' : 'Neuer Eintrag'}</DialogTitle>
          <DialogDescription>Firmeninfos zum schnellen Nachschlagen &amp; Kopieren.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="info-label">Bezeichnung</Label>
            <Input
              id="info-label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="z. B. USt-IdNr."
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="info-value">Wert</Label>
            <Textarea
              id="info-value"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="z. B. DE123456789"
              rows={2}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="info-category">Kategorie</Label>
            <Input
              id="info-category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="z. B. Steuer, Bank, Allgemein"
            />
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
