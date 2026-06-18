'use client'

import { useState } from 'react'
import { CheckCircle2, Pencil, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Reminder, RECURRENCE_LABELS, formatDateDE, dueStatusText,
} from '@/lib/manager'
import { ReminderDialog } from './ReminderDialog'

interface ManagerRemindersProps {
  reminders: Reminder[]
  loading: boolean
  onChanged: () => void
}

function StatusBadge({ r }: { r: Reminder }) {
  if (r.done) {
    return (
      <Badge variant="secondary" className="gap-1">
        <CheckCircle2 className="h-3 w-3" />
        Erledigt{r.done_by_name ? ` von ${r.done_by_name}` : ''}
      </Badge>
    )
  }
  if (r.days_until < 0) {
    return <Badge variant="destructive">{dueStatusText(r)}</Badge>
  }
  return <Badge variant={r.in_window ? 'default' : 'outline'}>{dueStatusText(r)}</Badge>
}

export function ManagerReminders({ reminders, loading, onChanged }: ManagerRemindersProps) {
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Reminder | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Reminder | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  function openNew() {
    setEditing(null)
    setDialogOpen(true)
  }

  function openEdit(r: Reminder) {
    setEditing(r)
    setDialogOpen(true)
  }

  async function handleComplete(r: Reminder) {
    setBusyId(r.id)
    try {
      const res = await fetch(`/api/manager/reminders/${r.id}/complete`, { method: 'POST' })
      if (!res.ok) {
        toast.error('Abhaken fehlgeschlagen')
        return
      }
      toast.success('Als erledigt markiert')
      onChanged()
    } finally {
      setBusyId(null)
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return
    setBusyId(deleteTarget.id)
    try {
      const res = await fetch(`/api/manager/reminders/${deleteTarget.id}`, { method: 'DELETE' })
      if (!res.ok) {
        toast.error('Löschen fehlgeschlagen')
        return
      }
      toast.success('Frist gelöscht')
      setDeleteTarget(null)
      onChanged()
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {reminders.length} {reminders.length === 1 ? 'Frist' : 'Fristen'}
        </p>
        <Button onClick={openNew} size="sm">
          <Plus className="mr-1.5 h-4 w-4" />
          Neue Frist
        </Button>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground py-8 text-center">Lädt…</p>
      ) : reminders.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            Noch keine Fristen angelegt.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {reminders.map((r) => (
            <Card key={r.id}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-base leading-tight">{r.title}</CardTitle>
                  <StatusBadge r={r} />
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {r.description && (
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap">{r.description}</p>
                )}
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                  <span><span className="text-muted-foreground">Stichtag:</span> {formatDateDE(r.next_due_date)}</span>
                  <span><span className="text-muted-foreground">Rhythmus:</span> {RECURRENCE_LABELS[r.recurrence]}</span>
                  <span><span className="text-muted-foreground">Erinnerung:</span> {r.remind_days_before} Tage vorher</span>
                </div>
                <div className="flex flex-wrap gap-2 pt-1">
                  {!r.done && (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => handleComplete(r)}
                      disabled={busyId === r.id}
                    >
                      <CheckCircle2 className="mr-1.5 h-4 w-4" />
                      Als erledigt markieren
                    </Button>
                  )}
                  <Button size="sm" variant="outline" onClick={() => openEdit(r)}>
                    <Pencil className="mr-1.5 h-4 w-4" />
                    Bearbeiten
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive hover:text-destructive"
                    onClick={() => setDeleteTarget(r)}
                  >
                    <Trash2 className="mr-1.5 h-4 w-4" />
                    Löschen
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <ReminderDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        reminder={editing}
        onSaved={onChanged}
      />

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Frist löschen?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget ? `„${deleteTarget.title}" wird dauerhaft entfernt.` : ''} Diese Aktion kann nicht rückgängig gemacht werden.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busyId === deleteTarget?.id}>Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); handleDelete() }}
              disabled={busyId === deleteTarget?.id}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Löschen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
