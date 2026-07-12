'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from '@/components/ui/sheet'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import {
  Ban, BellRing, CalendarDays, Check, CheckCircle2, ImagePlus,
  Megaphone, Pencil, Play, RotateCcw, Send, Trash2, User, X,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Task, TaskStatus, formatCompletedAt } from '@/hooks/useAufgaben'
import {
  STATUS_META, PRIORITY_META, dueReachedOrOverdue, formatCommentTime,
  formatDueLong, isDone, isOverdue,
} from './taskMeta'

// Detail einer Aufgabe (wie App aufgabe_detail_screen.dart):
// Titel/Beschreibung/Status/Priorität/Fällig/Zugewiesene, Kommentar-Thread mit
// Bildern (signed URLs), Chef-Aktionen (Bearbeiten/Löschen/Push/Eskalation) und
// Status-Aktionen nur für selbst zugewiesene Nutzer.

export interface TaskCommentView {
  id: string
  body: string | null
  author_name: string | null
  created_at: string
  image_url: string | null
}

interface Props {
  taskId: string | null
  open: boolean
  /** Erhöhen, um den Sheet-Inhalt neu zu laden (z.B. nach Bearbeiten im Dialog). */
  refreshKey: number
  myEmployeeId: string | null
  onClose: () => void
  onEdit: (task: Task) => void
  onDelete: (id: string) => Promise<boolean>
  /** Nach jeder Änderung aufrufen, damit die Liste dahinter aktualisiert. */
  onChanged: () => void
}

export function AufgabeDetailSheet({
  taskId, open, refreshKey, myEmployeeId, onClose, onEdit, onDelete, onChanged,
}: Props) {
  const [task, setTask] = useState<Task | null>(null)
  const [comments, setComments] = useState<TaskCommentView[]>([])
  const [loading, setLoading] = useState(false)

  const [busy, setBusy] = useState(false)
  const [reminding, setReminding] = useState(false)
  const [escalating, setEscalating] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [escalateOpen, setEscalateOpen] = useState(false)
  const [notDoableOpen, setNotDoableOpen] = useState(false)
  const [notDoableReason, setNotDoableReason] = useState('')

  const [commentText, setCommentText] = useState('')
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [sending, setSending] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    if (!taskId) return
    setLoading(true)
    try {
      const [tRes, cRes] = await Promise.all([
        fetch(`/api/aufgaben/${taskId}`),
        fetch(`/api/aufgaben/${taskId}/comments`),
      ])
      if (tRes.ok) {
        const json = await tRes.json() as { task?: Task }
        setTask(json.task ?? null)
      }
      if (cRes.ok) {
        const json = await cRes.json() as { comments?: TaskCommentView[] }
        setComments(json.comments ?? [])
      }
    } catch {
      toast.error('Aufgabe konnte nicht geladen werden')
    } finally {
      setLoading(false)
    }
  }, [taskId])

  // Bei Aufgabenwechsel Inhalt zurücksetzen, dann (neu) laden.
  useEffect(() => {
    setTask(null)
    setComments([])
    setCommentText('')
    setImageFile(null)
  }, [taskId])

  useEffect(() => {
    if (open && taskId) void load()
  }, [open, taskId, refreshKey, load])

  const amAssigned =
    !!task && !!myEmployeeId && task.assignees.some((a) => a.id === myEmployeeId)

  // --- Status (RPC set_my_task_status — prüft Chef ODER Zuweisung serverseitig) ---

  const setStatus = async (status: TaskStatus) => {
    if (!task) return
    setBusy(true)
    try {
      const { error } = await supabase.rpc('set_my_task_status', {
        p_task_id: task.id,
        p_status: status,
      })
      if (error) throw new Error(error.message)
      await load()
      onChanged()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Status konnte nicht gesetzt werden')
    } finally {
      setBusy(false)
    }
  }

  // „Nicht machbar" mit Pflicht-Begründung (Kommentar + Status blocked, wie App).
  const confirmNotDoable = async () => {
    const reason = notDoableReason.trim()
    if (!task || !reason) return
    setNotDoableOpen(false)
    setBusy(true)
    try {
      const res = await fetch(`/api/aufgaben/${task.id}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: `Nicht machbar: ${reason}` }),
      })
      if (!res.ok) throw new Error('Begründung konnte nicht gespeichert werden')
      const { error } = await supabase.rpc('set_my_task_status', {
        p_task_id: task.id,
        p_status: 'blocked',
      })
      if (error) throw new Error(error.message)
      setNotDoableReason('')
      await load()
      onChanged()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Aktion fehlgeschlagen')
    } finally {
      setBusy(false)
    }
  }

  // --- Chef: Push-Erinnerung (Edge Function notify-task-reminder, User-JWT) ---

  const remind = async () => {
    if (!task) return
    setReminding(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('Nicht angemeldet')
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/notify-task-reminder`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ task_id: task.id }),
        }
      )
      const json = await res.json().catch(() => ({})) as { sent?: number; error?: string }
      if (!res.ok || json.error) {
        throw new Error(typeof json.error === 'string' ? json.error : 'Push fehlgeschlagen')
      }
      const sent = typeof json.sent === 'number' ? json.sent : 0
      toast.success(
        sent > 0
          ? `Erinnerung an ${sent} Gerät(e) gesendet`
          : 'Niemand erreicht – die zugewiesene Person hat die App/Push noch nicht aktiviert.'
      )
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Push fehlgeschlagen')
    } finally {
      setReminding(false)
    }
  }

  // --- Chef: Eskalation per WhatsApp (nur bei Frist erreicht/überfällig) ---

  const escalate = async () => {
    if (!task) return
    setEscalateOpen(false)
    setEscalating(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('Nicht angemeldet')
      const res = await fetch(`/api/aufgaben/${task.id}/escalate`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: '{}',
      })
      const json = await res.json().catch(() => ({})) as { sent?: number; error?: string }
      if (!res.ok) {
        throw new Error(typeof json.error === 'string' ? json.error : 'Eskalation fehlgeschlagen')
      }
      const sent = typeof json.sent === 'number' ? json.sent : 0
      toast.success(
        sent > 0
          ? 'Eskalation per WhatsApp gesendet'
          : 'Konnte nicht gesendet werden – keine gültige Telefonnummer hinterlegt.'
      )
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Eskalation fehlgeschlagen')
    } finally {
      setEscalating(false)
    }
  }

  const confirmDelete = async () => {
    if (!task) return
    setDeleteOpen(false)
    const ok = await onDelete(task.id)
    if (ok) {
      toast.success('Aufgabe gelöscht')
      onClose()
    } else {
      toast.error('Löschen fehlgeschlagen')
    }
  }

  // --- Kommentar senden (Text + optionales Bild via multipart) ---

  const sendComment = async () => {
    const text = commentText.trim()
    if (!taskId || (!text && !imageFile)) return
    setSending(true)
    try {
      const fd = new FormData()
      if (text) fd.append('body', text)
      if (imageFile) fd.append('image', imageFile)
      const res = await fetch(`/api/aufgaben/${taskId}/comments`, {
        method: 'POST',
        body: fd,
      })
      const json = await res.json().catch(() => ({})) as { comment?: TaskCommentView; error?: string }
      if (!res.ok) {
        throw new Error(typeof json.error === 'string' ? json.error : 'Senden fehlgeschlagen')
      }
      setCommentText('')
      setImageFile(null)
      if (fileRef.current) fileRef.current.value = ''
      const created = json.comment
      if (created) setComments((prev) => [...prev, created])
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Senden fehlgeschlagen')
    } finally {
      setSending(false)
    }
  }

  const overdue = task ? isOverdue(task) : false

  return (
    <>
      <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
        <SheetContent side="right" className="flex w-full flex-col gap-0 overflow-y-auto p-0 sm:max-w-xl">
          <SheetHeader className="border-b px-6 py-4">
            <SheetTitle className="pr-8">{task?.title ?? 'Aufgabe'}</SheetTitle>
            {task?.created_by_name && (
              <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <User className="h-3.5 w-3.5" /> von {task.created_by_name}
              </p>
            )}
          </SheetHeader>

          {!task && (
            <div className="flex flex-1 items-center justify-center py-16 text-sm text-muted-foreground">
              {loading ? 'Lade Aufgabe…' : 'Aufgabe nicht gefunden.'}
            </div>
          )}

          {task && (
            <>
              <div className="flex-1 space-y-5 px-6 py-5">
                {/* Pills: Status / Priorität / Fällig */}
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-md px-2.5 py-1 text-xs font-bold ${STATUS_META[task.status].className}`}>
                    {STATUS_META[task.status].label}
                  </span>
                  <span className={`rounded-md px-2.5 py-1 text-xs font-bold ${PRIORITY_META[task.priority].className}`}>
                    Prio: {PRIORITY_META[task.priority].label}
                  </span>
                  {task.due_date && (
                    <span className={`flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-bold ${
                      overdue ? 'bg-red-500/15 text-red-600 dark:text-red-400' : 'bg-slate-500/15 text-slate-600 dark:text-slate-300'
                    }`}>
                      <CalendarDays className="h-3 w-3" />
                      Fällig {formatDueLong(task.due_date)}
                    </span>
                  )}
                </div>

                {/* Beschreibung */}
                {task.description?.trim() && (
                  <p className="whitespace-pre-wrap text-sm leading-relaxed">{task.description}</p>
                )}

                {/* Zugewiesene */}
                <div>
                  <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                    Zugewiesen an
                  </p>
                  {task.assignees.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Niemandem</p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {task.assignees.map((a) => (
                        <span
                          key={a.id}
                          className="flex items-center gap-2 rounded-full border bg-muted/40 py-1 pl-1.5 pr-3 text-sm font-medium"
                        >
                          <span
                            className="h-5 w-5 shrink-0 rounded-full"
                            style={{ backgroundColor: a.color }}
                            aria-hidden
                          />
                          {a.name}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Erledigt-Banner */}
                {isDone(task) && task.completed_at && (
                  <div className="flex items-start gap-2 rounded-md border border-green-500/30 bg-green-500/10 px-3 py-2 text-sm text-green-700 dark:text-green-400">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>
                      Erledigt{task.completed_by_name ? ` von ${task.completed_by_name}` : ''} am{' '}
                      {formatCompletedAt(task.completed_at)}
                    </span>
                  </div>
                )}

                {/* Status-Aktionen — NUR wenn selbst zugewiesen (wie App) */}
                {amAssigned && (
                  <div className="space-y-2">
                    {isDone(task) ? (
                      <Button
                        variant="outline"
                        className="w-full"
                        disabled={busy}
                        onClick={() => setStatus('todo')}
                      >
                        <RotateCcw className="mr-1.5 h-4 w-4" /> Wieder öffnen
                      </Button>
                    ) : (
                      <>
                        <div className="flex gap-2">
                          {task.status !== 'in_progress' && (
                            <Button
                              variant="outline"
                              className="flex-1"
                              disabled={busy}
                              onClick={() => setStatus('in_progress')}
                            >
                              <Play className="mr-1.5 h-4 w-4" /> In Arbeit
                            </Button>
                          )}
                          <Button
                            className="flex-1"
                            disabled={busy}
                            onClick={() => setStatus('done')}
                          >
                            <Check className="mr-1.5 h-4 w-4" /> Erledigt
                          </Button>
                        </div>
                        {task.status !== 'blocked' && (
                          <Button
                            variant="outline"
                            className="w-full border-red-500/50 text-red-600 hover:bg-red-500/10 hover:text-red-700"
                            disabled={busy}
                            onClick={() => { setNotDoableReason(''); setNotDoableOpen(true) }}
                          >
                            <Ban className="mr-1.5 h-4 w-4" /> Nicht machbar
                          </Button>
                        )}
                      </>
                    )}
                  </div>
                )}

                {/* Chef-Aktionen: Bearbeiten + Löschen */}
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => onEdit(task)}
                  >
                    <Pencil className="mr-1.5 h-4 w-4" /> Bearbeiten
                  </Button>
                  <Button
                    variant="outline"
                    className="flex-1 border-red-500/50 text-red-600 hover:bg-red-500/10 hover:text-red-700"
                    onClick={() => setDeleteOpen(true)}
                  >
                    <Trash2 className="mr-1.5 h-4 w-4" /> Löschen
                  </Button>
                </div>

                {/* Chef: Push + Eskalation (nur offene Aufgabe mit Zuweisung) */}
                {task.assignees.length > 0 && !isDone(task) && (
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      className="flex-1"
                      disabled={reminding}
                      onClick={remind}
                    >
                      <BellRing className="mr-1.5 h-4 w-4" />
                      {reminding ? 'Sende…' : 'Push'}
                    </Button>
                    {dueReachedOrOverdue(task) && (
                      <Button
                        variant="outline"
                        className="flex-1 border-red-500/50 text-red-600 hover:bg-red-500/10 hover:text-red-700"
                        disabled={escalating}
                        onClick={() => setEscalateOpen(true)}
                      >
                        <Megaphone className="mr-1.5 h-4 w-4" />
                        {escalating ? 'Sende…' : 'Eskalation'}
                      </Button>
                    )}
                  </div>
                )}

                {/* Kommentare */}
                <div>
                  <p className="mb-2 text-sm font-bold">Kommentare</p>
                  {comments.length === 0 ? (
                    <p className="py-3 text-sm text-muted-foreground">Noch keine Kommentare.</p>
                  ) : (
                    <div className="space-y-2.5">
                      {comments.map((c) => (
                        <div key={c.id} className="rounded-lg border bg-card px-3 py-2.5">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-sm font-semibold">
                              {c.author_name ?? 'Unbekannt'}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {formatCommentTime(c.created_at)}
                            </span>
                          </div>
                          {c.body && (
                            <p className="mt-1 whitespace-pre-wrap text-sm">{c.body}</p>
                          )}
                          {c.image_url && (
                            <a href={c.image_url} target="_blank" rel="noreferrer" className="mt-2 block">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={c.image_url}
                                alt="Kommentar-Anhang"
                                className="max-h-64 w-auto rounded-md border object-contain"
                              />
                            </a>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Kommentar-Composer */}
              <div className="sticky bottom-0 border-t bg-background px-4 py-3">
                {imageFile && (
                  <div className="mb-2 flex items-center gap-2 text-sm text-muted-foreground">
                    <ImagePlus className="h-4 w-4 shrink-0" />
                    <span className="min-w-0 flex-1 truncate">{imageFile.name}</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0"
                      onClick={() => {
                        setImageFile(null)
                        if (fileRef.current) fileRef.current.value = ''
                      }}
                      aria-label="Bild entfernen"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                )}
                <div className="flex items-end gap-2">
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/jpeg,image/png,image/gif,image/webp,image/heic"
                    className="hidden"
                    onChange={(e) => setImageFile(e.target.files?.[0] ?? null)}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-9 w-9 shrink-0 p-0"
                    disabled={sending}
                    onClick={() => fileRef.current?.click()}
                    aria-label="Bild anhängen"
                  >
                    <ImagePlus className="h-5 w-5" />
                  </Button>
                  <Textarea
                    value={commentText}
                    onChange={(e) => setCommentText(e.target.value)}
                    placeholder="Kommentar schreiben…"
                    className="min-h-[38px] max-h-32 flex-1 resize-none"
                    rows={1}
                  />
                  <Button
                    type="button"
                    size="sm"
                    className="h-9 w-9 shrink-0 p-0"
                    disabled={sending || (!commentText.trim() && !imageFile)}
                    onClick={sendComment}
                    aria-label="Kommentar senden"
                  >
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* Löschen bestätigen */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Aufgabe löschen?</AlertDialogTitle>
            <AlertDialogDescription>
              Das kann nicht rückgängig gemacht werden.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-red-600 text-white hover:bg-red-700"
            >
              Löschen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Eskalation bestätigen */}
      <AlertDialog open={escalateOpen} onOpenChange={setEscalateOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eskalation senden?</AlertDialogTitle>
            <AlertDialogDescription>
              Der zugewiesene Mitarbeiter erhält eine WhatsApp-Aufforderung, die überfällige
              Aufgabe {task ? `»${task.title}«` : ''} umgehend zu bearbeiten, abzulehnen oder
              mit einem Kommentar zu verschieben. Klar als Eskalation erkennbar.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              onClick={escalate}
              className="bg-red-600 text-white hover:bg-red-700"
            >
              Eskalation senden
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Nicht machbar: Pflicht-Begründung */}
      <Dialog open={notDoableOpen} onOpenChange={(o) => !o && setNotDoableOpen(false)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Nicht machbar melden</DialogTitle>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label>Begründung (Pflicht)</Label>
            <Textarea
              value={notDoableReason}
              onChange={(e) => setNotDoableReason(e.target.value)}
              placeholder="Warum kann die Aufgabe nicht erledigt werden?"
              className="min-h-[80px] resize-none"
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNotDoableOpen(false)}>
              Abbrechen
            </Button>
            <Button
              disabled={!notDoableReason.trim()}
              onClick={confirmNotDoable}
            >
              Melden
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
