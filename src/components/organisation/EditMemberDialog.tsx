'use client'

import { useState, useEffect } from 'react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { toast } from 'sonner'
import type { OrgMember, UserRole } from './types'
import { POSITION_LABELS } from './types'

interface EditMemberDialogProps {
  member: OrgMember | null
  open: boolean
  onOpenChange: (open: boolean) => void
  userRole: UserRole
  onSaved: () => void
}

export function EditMemberDialog({ member, open, onOpenChange, userRole, onSaved }: EditMemberDialogProps) {
  const [form, setForm] = useState({
    name:         '',
    birth_date:   '',
    work_address: '',
    home_address: '',
  })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (member) {
      setForm({
        name:         member.name,
        birth_date:   member.birth_date ?? '',
        work_address: member.work_address ?? '',
        home_address: member.home_address ?? '',
      })
    }
  }, [member])

  const isGF = member?.position === 'geschaeftsfuehrer'
  const isReadOnly = isGF && userRole !== 'admin'

  async function handleSave() {
    if (!member) return
    setSaving(true)
    try {
      const body: Record<string, string | null> = {
        name:         form.name.trim(),
        birth_date:   form.birth_date || null,
        work_address: form.work_address.trim() || null,
        home_address: form.home_address.trim() || null,
      }

      const res = await fetch(`/api/organisation/members/${member.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error((err as { error?: string })?.error ?? 'Fehler beim Speichern')
      }

      toast.success('Daten gespeichert')
      onSaved()
      onOpenChange(false)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Fehler beim Speichern')
    } finally {
      setSaving(false)
    }
  }

  if (!member) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {member.name}
            <span className="ml-2 text-sm font-normal text-muted-foreground">
              · {POSITION_LABELS[member.position]}
            </span>
          </DialogTitle>
        </DialogHeader>

        {isReadOnly ? (
          <div className="py-4 text-sm text-muted-foreground">
            Geschäftsführer-Daten können nur vom Admin bearbeitet werden.
          </div>
        ) : (
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="Vorname Nachname"
              />
            </div>

            <div className="space-y-2">
              <Label>Geburtsdatum</Label>
              <Input
                type="date"
                value={form.birth_date}
                onChange={(e) => setForm(f => ({ ...f, birth_date: e.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <Label>Geschäftsadresse</Label>
              <Textarea
                value={form.work_address}
                onChange={(e) => setForm(f => ({ ...f, work_address: e.target.value }))}
                placeholder="Straße, PLZ, Ort"
                rows={2}
              />
            </div>

            <div className="space-y-2">
              <Label>Heimadresse</Label>
              <Textarea
                value={form.home_address}
                onChange={(e) => setForm(f => ({ ...f, home_address: e.target.value }))}
                placeholder="Straße, PLZ, Ort"
                rows={2}
              />
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {isReadOnly ? 'Schließen' : 'Abbrechen'}
          </Button>
          {!isReadOnly && (
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Speichert…' : 'Speichern'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
