'use client'

import { useMemo, useState } from 'react'
import { Plus, Pencil, Trash2, Check, X } from 'lucide-react'
import { toast } from 'sonner'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import type { Skill } from './types'

interface ManageSkillsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  skills: Skill[]
  onChanged: () => void
}

export function ManageSkillsDialog({ open, onOpenChange, skills, onChanged }: ManageSkillsDialogProps) {
  const [newName, setNewName] = useState('')
  const [newCategory, setNewCategory] = useState('')
  const [saving, setSaving] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editCategory, setEditCategory] = useState('')
  const [deleteSkill, setDeleteSkill] = useState<Skill | null>(null)

  const categories = useMemo(
    () => Array.from(new Set(skills.map((s) => s.category))),
    [skills],
  )

  const grouped = useMemo(() => {
    const map = new Map<string, Skill[]>()
    for (const s of skills) {
      if (!map.has(s.category)) map.set(s.category, [])
      map.get(s.category)!.push(s)
    }
    return Array.from(map.entries())
  }, [skills])

  async function handleCreate() {
    if (!newName.trim()) return
    setSaving(true)
    try {
      const res = await fetch('/api/skill-matrix/skills', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newName.trim(),
          category: (newCategory.trim() || 'Sonstiges'),
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Fehler')
      toast.success(`Skill „${newName.trim()}" angelegt`)
      setNewName('')
      setNewCategory('')
      onChanged()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Fehler beim Anlegen')
    } finally {
      setSaving(false)
    }
  }

  function startEdit(s: Skill) {
    setEditId(s.id)
    setEditName(s.name)
    setEditCategory(s.category)
  }

  async function saveEdit() {
    if (!editId || !editName.trim()) return
    setSaving(true)
    try {
      const res = await fetch(`/api/skill-matrix/skills/${editId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editName.trim(), category: editCategory.trim() || 'Sonstiges' }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Fehler')
      toast.success('Skill aktualisiert')
      setEditId(null)
      onChanged()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Fehler beim Speichern')
    } finally {
      setSaving(false)
    }
  }

  async function confirmDelete() {
    if (!deleteSkill) return
    setSaving(true)
    try {
      const res = await fetch(`/api/skill-matrix/skills/${deleteSkill.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error(json.error || 'Fehler')
      }
      toast.success(`Skill „${deleteSkill.name}" gelöscht`)
      setDeleteSkill(null)
      onChanged()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Fehler beim Löschen')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Skills verwalten</DialogTitle>
            <DialogDescription>
              Lege neue Tätigkeiten an, benenne sie um oder entferne sie. Beim Löschen
              werden auch alle Einträge der Mitarbeiter zu diesem Skill entfernt.
            </DialogDescription>
          </DialogHeader>

          {/* Neuen Skill anlegen */}
          <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
            <Label className="text-xs font-medium text-muted-foreground">Neuer Skill</Label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                placeholder="Bezeichnung (z. B. Etiketten drucken)"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                list="skill-categories"
                onKeyDown={(e) => { if (e.key === 'Enter') handleCreate() }}
              />
              <Input
                placeholder="Kategorie"
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
                list="skill-categories"
                className="sm:w-40"
                onKeyDown={(e) => { if (e.key === 'Enter') handleCreate() }}
              />
              <datalist id="skill-categories">
                {categories.map((c) => <option key={c} value={c} />)}
              </datalist>
              <Button onClick={handleCreate} disabled={saving || !newName.trim()} size="icon" className="shrink-0">
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Liste bestehender Skills */}
          <ScrollArea className="max-h-[45vh] pr-3">
            <div className="space-y-4">
              {grouped.map(([category, items]) => (
                <div key={category}>
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{category}</p>
                  <div className="space-y-1">
                    {items.map((s) => (
                      <div key={s.id} className="flex items-center gap-2 rounded-md border px-2 py-1.5">
                        {editId === s.id ? (
                          <>
                            <Input
                              value={editName}
                              onChange={(e) => setEditName(e.target.value)}
                              className="h-8"
                            />
                            <Input
                              value={editCategory}
                              onChange={(e) => setEditCategory(e.target.value)}
                              className="h-8 w-32"
                              list="skill-categories"
                            />
                            <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0" onClick={saveEdit} disabled={saving}>
                              <Check className="h-4 w-4 text-emerald-600" />
                            </Button>
                            <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0" onClick={() => setEditId(null)}>
                              <X className="h-4 w-4" />
                            </Button>
                          </>
                        ) : (
                          <>
                            <span className="flex-1 text-sm">{s.name}</span>
                            <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0" onClick={() => startEdit(s)}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0 text-destructive hover:text-destructive" onClick={() => setDeleteSkill(s)}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteSkill} onOpenChange={(o) => !o && setDeleteSkill(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Skill löschen?</AlertDialogTitle>
            <AlertDialogDescription>
              „{deleteSkill?.name}" wird endgültig gelöscht. Alle Mitarbeiter-Einträge zu
              diesem Skill gehen verloren. Dies kann nicht rückgängig gemacht werden.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Löschen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
