'use client'

import { useEffect, useState } from 'react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { AssigneeSelector } from './AssigneeSelector'
import { Task, TaskPriority, TaskStatus, CreateTaskPayload } from '@/hooks/useAufgaben'
import { CheckCircle2, Trash2 } from 'lucide-react'

interface Employee {
  id: string
  name: string
  color: string
}

interface Props {
  open: boolean
  task?: Task | null
  employees: Employee[]
  onClose: () => void
  onSave: (payload: CreateTaskPayload) => Promise<boolean>
  onDelete?: (id: string) => Promise<boolean>
  onComplete?: (id: string) => Promise<boolean>
}

const defaultPayload = (): CreateTaskPayload => ({
  title: '',
  description: '',
  status: 'todo',
  priority: 'medium',
  due_date: null,
  reminder_at: null,
  reminder_email: null,
  assignee_ids: [],
})

export function AufgabenDialog({ open, task, employees, onClose, onSave, onDelete, onComplete }: Props) {
  const [form, setForm] = useState<CreateTaskPayload>(defaultPayload())
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    if (task) {
      setForm({
        title: task.title,
        description: task.description ?? '',
        status: task.status,
        priority: task.priority,
        due_date: task.due_date ?? null,
        reminder_at: task.reminder_at ? task.reminder_at.slice(0, 16) : null,
        reminder_email: task.reminder_email ?? null,
        assignee_ids: task.assignees.map((a) => a.id),
      })
    } else {
      setForm(defaultPayload())
    }
  }, [task, open])

  const set = <K extends keyof CreateTaskPayload>(key: K, value: CreateTaskPayload[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }))

  const handleSave = async () => {
    if (!form.title.trim()) return
    setSaving(true)
    const ok = await onSave(form)
    setSaving(false)
    if (ok) onClose()
  }

  const handleDelete = async () => {
    if (!task || !onDelete) return
    setDeleting(true)
    await onDelete(task.id)
    setDeleting(false)
    onClose()
  }

  const handleComplete = async () => {
    if (!task || !onComplete) return
    await onComplete(task.id)
    onClose()
  }

  const isEdit = !!task
  const isDone = task?.status === 'done'

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="bg-[#0f1f16] border-white/15 text-white max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-white">
            {isEdit ? 'Aufgabe bearbeiten' : 'Neue Aufgabe'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Titel */}
          <div className="space-y-1.5">
            <Label className="text-white/60 text-xs">Titel *</Label>
            <Input
              value={form.title}
              onChange={(e) => set('title', e.target.value)}
              placeholder="Aufgabentitel eingeben..."
              className="bg-white/5 border-white/15 text-white placeholder:text-white/30 focus:border-emerald-500/50"
            />
          </div>

          {/* Beschreibung */}
          <div className="space-y-1.5">
            <Label className="text-white/60 text-xs">Beschreibung</Label>
            <Textarea
              value={form.description ?? ''}
              onChange={(e) => set('description', e.target.value)}
              placeholder="Details zur Aufgabe..."
              className="bg-white/5 border-white/15 text-white placeholder:text-white/30 focus:border-emerald-500/50 min-h-[80px] resize-none"
            />
          </div>

          {/* Status + Priorität */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-white/60 text-xs">Status</Label>
              <Select value={form.status} onValueChange={(v) => set('status', v as TaskStatus)}>
                <SelectTrigger className="bg-white/5 border-white/15 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-[#0f1f16] border-white/15">
                  <SelectItem value="todo">Offen</SelectItem>
                  <SelectItem value="in_progress">In Bearbeitung</SelectItem>
                  <SelectItem value="in_review">In Review</SelectItem>
                  <SelectItem value="done">Erledigt</SelectItem>
                  <SelectItem value="blocked">Blockiert</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-white/60 text-xs">Priorität</Label>
              <Select value={form.priority} onValueChange={(v) => set('priority', v as TaskPriority)}>
                <SelectTrigger className="bg-white/5 border-white/15 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-[#0f1f16] border-white/15">
                  <SelectItem value="high">Hoch</SelectItem>
                  <SelectItem value="medium">Mittel</SelectItem>
                  <SelectItem value="low">Niedrig</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Fälligkeitsdatum */}
          <div className="space-y-1.5">
            <Label className="text-white/60 text-xs">Fälligkeitsdatum</Label>
            <Input
              type="date"
              value={form.due_date ?? ''}
              onChange={(e) => set('due_date', e.target.value || null)}
              className="bg-white/5 border-white/15 text-white focus:border-emerald-500/50"
            />
          </div>

          {/* Erinnerung */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-white/60 text-xs">Erinnerung am</Label>
              <Input
                type="datetime-local"
                value={form.reminder_at ?? ''}
                onChange={(e) => set('reminder_at', e.target.value || null)}
                className="bg-white/5 border-white/15 text-white focus:border-emerald-500/50"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-white/60 text-xs">Erinnerungs-E-Mail</Label>
              <Input
                type="email"
                value={form.reminder_email ?? ''}
                onChange={(e) => set('reminder_email', e.target.value || null)}
                placeholder="name@firma.de"
                className="bg-white/5 border-white/15 text-white placeholder:text-white/30 focus:border-emerald-500/50"
              />
            </div>
          </div>

          {/* Mitarbeiter */}
          <div className="space-y-1.5">
            <Label className="text-white/60 text-xs">Mitarbeiter zuweisen</Label>
            <AssigneeSelector
              employees={employees}
              selectedIds={form.assignee_ids}
              onChange={(ids) => set('assignee_ids', ids)}
            />
          </div>
        </div>

        <DialogFooter className="flex-col-reverse sm:flex-row gap-2">
          {isEdit && onDelete && (
            <Button
              type="button"
              variant="ghost"
              onClick={handleDelete}
              disabled={deleting}
              className="text-red-400 hover:bg-red-500/10 hover:text-red-300 mr-auto"
            >
              <Trash2 className="h-4 w-4 mr-1.5" />
              {deleting ? 'Löschen...' : 'Löschen'}
            </Button>
          )}
          {isEdit && !isDone && onComplete && (
            <Button
              type="button"
              variant="outline"
              onClick={handleComplete}
              className="border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10"
            >
              <CheckCircle2 className="h-4 w-4 mr-1.5" />
              Als erledigt markieren
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            className="border-white/15 text-white/60 hover:bg-white/5"
          >
            Abbrechen
          </Button>
          <Button
            type="button"
            onClick={handleSave}
            disabled={saving || !form.title.trim()}
            className="bg-emerald-600 hover:bg-emerald-700 text-white border-0"
          >
            {saving ? 'Speichern...' : isEdit ? 'Speichern' : 'Erstellen'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
