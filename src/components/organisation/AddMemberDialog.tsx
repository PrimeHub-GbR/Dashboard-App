'use client'

import { useState } from 'react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'sonner'
import type { OrgMember, OrgPosition, UserRole } from './types'

interface AddMemberDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  userRole: UserRole
  defaultReportsTo?: string | null
  fixedPosition?: OrgPosition
  availableParents?: OrgMember[]
  onSaved: () => void
}

export function AddMemberDialog({
  open,
  onOpenChange,
  userRole,
  defaultReportsTo,
  fixedPosition,
  availableParents,
  onSaved,
}: AddMemberDialogProps) {
  const [form, setForm] = useState({
    name:       '',
    position:   (fixedPosition ?? 'mitarbeiter') as OrgPosition,
    reports_to: defaultReportsTo ?? null as string | null,
  })
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    if (!form.name.trim()) {
      toast.error('Name ist erforderlich')
      return
    }
    setSaving(true)
    try {
      const res = await fetch('/api/organisation/members', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name:       form.name.trim(),
          position:   form.position,
          reports_to: form.reports_to,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error((err as { error?: string })?.error ?? 'Fehler beim Anlegen')
      }
      toast.success('Mitglied angelegt')
      setForm({ name: '', position: fixedPosition ?? 'mitarbeiter', reports_to: defaultReportsTo ?? null })
      onSaved()
      onOpenChange(false)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Fehler beim Anlegen')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Mitglied hinzufügen</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Name</Label>
            <Input
              value={form.name}
              onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="Vorname Nachname"
            />
          </div>

          {!fixedPosition && userRole === 'admin' && (
            <div className="space-y-2">
              <Label>Position</Label>
              <Select
                value={form.position}
                onValueChange={(v) => setForm(f => ({ ...f, position: v as OrgPosition }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="geschaeftsfuehrer">Geschäftsführer</SelectItem>
                  <SelectItem value="manager">Manager</SelectItem>
                  <SelectItem value="mitarbeiter">Mitarbeiter</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {userRole === 'admin' && availableParents && availableParents.length > 0 && !fixedPosition && (
            <div className="space-y-2">
              <Label>Vorgesetzter</Label>
              <Select
                value={form.reports_to ?? ''}
                onValueChange={(v) => setForm(f => ({ ...f, reports_to: v || null }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="— kein —" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">— kein —</SelectItem>
                  {availableParents.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Abbrechen</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? 'Speichert…' : 'Anlegen'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
