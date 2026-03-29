'use client'

import { useEffect, useState } from 'react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { AssigneeSelector } from './AssigneeSelector'
import { Task, TaskPriority, TaskStatus, CreateTaskPayload } from '@/hooks/useAufgaben'
import { useOrgNodes, buildFlatList } from '@/hooks/useOrgNodes'
import { AlertTriangle, Trash2 } from 'lucide-react'

const STATUS_OPTIONS: { value: string; label: string; color: string }[] = [
  { value: 'todo',        label: 'Offen',          color: 'text-gray-600' },
  { value: 'in_progress', label: 'In Bearbeitung',  color: 'text-blue-600' },
  { value: 'in_review',   label: 'In Review',       color: 'text-purple-600' },
  { value: 'done',        label: 'Erledigt',        color: 'text-green-600' },
  { value: 'blocked',     label: 'Blockiert',       color: 'text-red-600' },
]

interface Employee {
  id: string
  name: string
  color: string
  position?: string | null
}

interface Props {
  open: boolean
  task?: Task | null
  employees: Employee[]
  defaultOrgNodeId?: string | null
  onClose: () => void
  onSave: (payload: CreateTaskPayload) => Promise<boolean>
  onDelete?: (id: string) => Promise<boolean>
  onComplete?: (id: string) => Promise<boolean>
}

const defaultPayload = (orgNodeId?: string | null): CreateTaskPayload => ({
  title: '',
  description: '',
  status: 'todo',
  priority: 'medium',
  due_date: null,
  reminder_at: null,
  reminder_email: null,
  assignee_ids: [],
  org_node_id: orgNodeId ?? null,
})

export function AufgabenDialog({ open, task, employees, defaultOrgNodeId, onClose, onSave, onDelete, onComplete }: Props) {
  const [form, setForm] = useState<CreateTaskPayload>(defaultPayload())
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [gfWarningOpen, setGfWarningOpen] = useState(false)
  const [pendingPayload, setPendingPayload] = useState<CreateTaskPayload | null>(null)

  const { nodes } = useOrgNodes()
  const flatNodes = buildFlatList(nodes)

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
        org_node_id: task.org_node_id ?? null,
      })
    } else {
      setForm(defaultPayload(defaultOrgNodeId))
    }
  }, [task, open, defaultOrgNodeId])

  const set = <K extends keyof CreateTaskPayload>(key: K, value: CreateTaskPayload[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }))

  const handleSave = async () => {
    if (!form.title.trim()) return

    // Prüfen ob ein GF zugewiesen wird
    const assignedGF = employees.filter(
      (e) => form.assignee_ids.includes(e.id) && e.position === 'geschaeftsfuehrer'
    )
    if (assignedGF.length > 0) {
      setPendingPayload(form)
      setGfWarningOpen(true)
      return
    }

    setSaving(true)
    const ok = await onSave(form)
    setSaving(false)
    if (ok) onClose()
  }

  const handleGfConfirm = async () => {
    if (!pendingPayload) return
    setGfWarningOpen(false)
    setSaving(true)
    const ok = await onSave(pendingPayload)
    setSaving(false)
    setPendingPayload(null)
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

  const currentStatusOption = STATUS_OPTIONS.find((s) => s.value === form.status)

  return (
    <>
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="w-full max-w-lg flex flex-col max-h-[90dvh]">
        <DialogHeader className="shrink-0">
          <DialogTitle>
            {isEdit ? 'Aufgabe bearbeiten' : 'Neue Aufgabe'}
          </DialogTitle>
        </DialogHeader>

        {/* Scrollbarer Body */}
        <div className="flex-1 overflow-y-auto space-y-4 py-2 pr-1">
          {/* Titel */}
          <div className="space-y-1.5">
            <Label>Titel *</Label>
            <Input
              value={form.title}
              onChange={(e) => set('title', e.target.value)}
              placeholder="Aufgabentitel eingeben..."
              className="w-full"
            />
          </div>

          {/* Beschreibung */}
          <div className="space-y-1.5">
            <Label>Beschreibung</Label>
            <Textarea
              value={form.description ?? ''}
              onChange={(e) => set('description', e.target.value)}
              placeholder="Details zur Aufgabe..."
              className="min-h-[80px] resize-none w-full"
            />
          </div>

          {/* Bereich */}
          {flatNodes.length > 0 && (
            <div className="space-y-1.5">
              <Label>Bereich</Label>
              <Select
                value={form.org_node_id ?? '__none__'}
                onValueChange={(v) => set('org_node_id', v === '__none__' ? null : v)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Keinem Bereich zugeordnet" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Kein Bereich</SelectItem>
                  {flatNodes.map((n) => (
                    <SelectItem key={n.id} value={n.id}>
                      {'  '.repeat(n.depth)}{n.depth > 0 ? '└ ' : ''}{n.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Priorität (Status ist im Footer) */}
          <div className="space-y-1.5">
            <Label>Priorität</Label>
            <Select value={form.priority} onValueChange={(v) => set('priority', v as TaskPriority)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="high">Hoch</SelectItem>
                <SelectItem value="medium">Mittel</SelectItem>
                <SelectItem value="low">Niedrig</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Fälligkeitsdatum */}
          <div className="space-y-1.5">
            <Label>Fälligkeitsdatum</Label>
            <Input
              type="date"
              value={form.due_date ?? ''}
              onChange={(e) => set('due_date', e.target.value || null)}
              className="w-full"
            />
          </div>

          {/* Erinnerung */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Erinnerung am</Label>
              <Input
                type="datetime-local"
                value={form.reminder_at ?? ''}
                onChange={(e) => set('reminder_at', e.target.value || null)}
                className="w-full"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Erinnerungs-E-Mail</Label>
              <Input
                type="email"
                value={form.reminder_email ?? ''}
                onChange={(e) => set('reminder_email', e.target.value || null)}
                placeholder="name@firma.de"
                className="w-full"
              />
            </div>
          </div>

          {/* Mitarbeiter */}
          <div className="space-y-1.5">
            <Label>Mitarbeiter zuweisen</Label>
            <AssigneeSelector
              employees={employees}
              selectedIds={form.assignee_ids}
              onChange={(ids) => set('assignee_ids', ids)}
            />
          </div>
        </div>

        {/* Footer: Löschen links — Status-Dropdown + Abbrechen + Speichern rechts */}
        <div className="shrink-0 border-t pt-4 mt-2 flex items-center justify-between gap-2">
          {/* Links: Löschen (oder Platzhalter) */}
          {isEdit && onDelete ? (
            <Button
              type="button"
              variant="ghost"
              onClick={handleDelete}
              disabled={deleting}
              className="text-red-600 hover:bg-red-50 hover:text-red-700 shrink-0"
            >
              <Trash2 className="h-4 w-4 mr-1.5" />
              {deleting ? 'Löschen...' : 'Löschen'}
            </Button>
          ) : (
            <span />
          )}

          {/* Rechts: Status-Dropdown + Abbrechen + Speichern */}
          <div className="flex items-center gap-2">
            {/* Status-Dropdown */}
            <Select value={form.status} onValueChange={(v) => set('status', v as TaskStatus)}>
              <SelectTrigger className={`w-[150px] font-medium ${currentStatusOption?.color ?? ''}`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    <span className={s.color}>{s.label}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Button type="button" variant="outline" onClick={onClose}>
              Abbrechen
            </Button>
            <Button
              type="button"
              onClick={handleSave}
              disabled={saving || !form.title.trim()}
            >
              {saving ? 'Speichern...' : isEdit ? 'Speichern' : 'Erstellen'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>

    {/* GF-Eskalierungs-Warnung */}
    <AlertDialog open={gfWarningOpen} onOpenChange={setGfWarningOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2 text-amber-600">
            <AlertTriangle className="h-5 w-5 shrink-0" />
            Eskalation an Geschäftsführung
          </AlertDialogTitle>
          <AlertDialogDescription className="text-sm text-foreground space-y-2">
            <p>
              Sie sind dabei, diese Aufgabe an einen <strong>Geschäftsführer</strong> zu delegieren.
            </p>
            <p className="text-muted-foreground">
              Bitte stellen Sie sicher, dass eine Eskalation wirklich notwendig ist und alle
              anderen Lösungswege bereits geprüft wurden.
            </p>
            <p className="font-medium">Sind Sie sicher, dass Sie eskalieren möchten?</p>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => { setGfWarningOpen(false); setPendingPayload(null) }}>
            Abbrechen
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={handleGfConfirm}
            className="bg-amber-600 hover:bg-amber-700 text-white"
          >
            Ja, eskalieren
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  )
}
