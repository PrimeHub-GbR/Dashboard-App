'use client'

import { useEffect, useState } from 'react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { OrgNode, OrgNodeType, CreateOrgNodePayload } from '@/hooks/useOrgNodes'
import { Trash2 } from 'lucide-react'

const TYPE_LABELS: Record<OrgNodeType, string> = {
  account: 'Seller-Central-Account',
  store: 'Store / Marktplatz',
  category: 'Kategorie',
  product: 'Produkt',
  node: 'Sonstiges',
}

const COLORS = [
  { label: 'Blau',    value: '#3b82f6' },
  { label: 'Lila',   value: '#8b5cf6' },
  { label: 'Orange', value: '#f59e0b' },
  { label: 'Grün',   value: '#22c55e' },
  { label: 'Rot',    value: '#ef4444' },
  { label: 'Grau',   value: '#94a3b8' },
  { label: 'Pink',   value: '#ec4899' },
  { label: 'Cyan',   value: '#06b6d4' },
]

interface Props {
  open: boolean
  node?: OrgNode | null
  parentNode?: OrgNode | null
  onClose: () => void
  onSave: (payload: CreateOrgNodePayload) => Promise<boolean>
  onDelete?: (id: string) => Promise<boolean>
}

export function OrgNodeDialog({ open, node, parentNode, onClose, onSave, onDelete }: Props) {
  const [name, setName] = useState('')
  const [type, setType] = useState<OrgNodeType>('node')
  const [color, setColor] = useState('#6366f1')
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    if (node) {
      setName(node.name)
      setType(node.type)
      setColor(node.color)
    } else {
      setName('')
      setType(parentNode ? 'node' : 'account')
      setColor(parentNode?.color ?? '#6366f1')
    }
  }, [node, parentNode, open])

  const handleSave = async () => {
    if (!name.trim()) return
    setSaving(true)
    const ok = await onSave({ name: name.trim(), type, color, parent_id: node?.parent_id ?? parentNode?.id ?? null })
    setSaving(false)
    if (ok) onClose()
  }

  const handleDelete = async () => {
    if (!node || !onDelete) return
    setDeleting(true)
    await onDelete(node.id)
    setDeleting(false)
    onClose()
  }

  const isEdit = !!node

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? 'Bereich bearbeiten' : parentNode ? `Unterbereich von "${parentNode.name}"` : 'Neuer Bereich'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Name *</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="z.B. PrimeHub, Books, Katzenklappe..."
              autoFocus
            />
          </div>

          <div className="space-y-1.5">
            <Label>Typ</Label>
            <Select value={type} onValueChange={(v) => setType(v as OrgNodeType)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(TYPE_LABELS).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Farbe</Label>
            <div className="flex flex-wrap gap-2">
              {COLORS.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  title={c.label}
                  onClick={() => setColor(c.value)}
                  className="h-7 w-7 rounded-full border-2 transition-transform hover:scale-110"
                  style={{
                    backgroundColor: c.value,
                    borderColor: color === c.value ? '#0f172a' : 'transparent',
                  }}
                />
              ))}
            </div>
          </div>
        </div>

        <DialogFooter className="flex-col-reverse sm:flex-row gap-2">
          {isEdit && onDelete && (
            <Button
              type="button"
              variant="ghost"
              onClick={handleDelete}
              disabled={deleting}
              className="text-red-600 hover:bg-red-50 hover:text-red-700 mr-auto"
            >
              <Trash2 className="h-4 w-4 mr-1.5" />
              {deleting ? 'Löschen...' : 'Löschen'}
            </Button>
          )}
          <Button type="button" variant="outline" onClick={onClose}>Abbrechen</Button>
          <Button type="button" onClick={handleSave} disabled={saving || !name.trim()}>
            {saving ? 'Speichern...' : isEdit ? 'Speichern' : 'Erstellen'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
