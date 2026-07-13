'use client'

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import {
  CalendarDays, ChevronDown, ChevronUp, Plus, RefreshCw,
} from 'lucide-react'
import {
  useAufgaben, Task, CreateTaskPayload, SaveResult,
} from '@/hooks/useAufgaben'
import { useEmployees } from '@/hooks/useEmployees'
import { supabase } from '@/lib/supabase'
import { AufgabenDialog } from './AufgabenDialog'
import { AufgabeDetailSheet } from './AufgabeDetailSheet'
import {
  STATUS_META, formatDueShort, isArchived, isDone, isOverdue,
} from './taskMeta'

// Aufgaben-Ansicht in App-Struktur (wie aufgaben_screen.dart, Chef-Sicht):
// „Meine Aufgaben" + „Aufgaben der Mitarbeiter" (je Überfällig/Offen),
// „Erledigt" (letzte 30 Tage, zugeklappt) und „Archiv" (älter, zugeklappt).

export function AufgabenClient() {
  const { tasks, isLoading, error, refresh, createTask, updateTask, deleteTask } =
    useAufgaben({})
  const { employees } = useEmployees({ includeGF: true })

  const [myEmployeeId, setMyEmployeeId] = useState<string | null>(null)
  const [filterId, setFilterId] = useState<string | null>(null)

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editTask, setEditTask] = useState<Task | null>(null)

  const [detailTaskId, setDetailTaskId] = useState<string | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const [detailRefreshKey, setDetailRefreshKey] = useState(0)

  // Telefonnummern für den WhatsApp-Button im Dialog (wie bisher).
  const [phoneMap, setPhoneMap] = useState<Record<string, string | null>>({})
  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch('/api/organisation/members')
        if (!res.ok) return
        const data = await res.json() as { members: Array<{ id: string; phone?: string | null }> }
        const map: Record<string, string | null> = {}
        data.members.forEach((m) => { map[m.id] = m.phone ?? null })
        setPhoneMap(map)
      } catch { /* ignore */ }
    }
    void load()
  }, [])

  // Eigene employee_id für die „Meine Aufgaben"-Gruppierung (wie App).
  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const { data } = await supabase.rpc('current_employee_id')
        if (!cancelled) setMyEmployeeId((data as string | null) ?? null)
      } catch { /* ignore */ }
    })()
    return () => { cancelled = true }
  }, [])

  // Deep-Link aus der Glocke: ?task=<id> -> Detail direkt öffnen
  useEffect(() => {
    const taskId = new URLSearchParams(window.location.search).get('task')
    if (!taskId) return
    setDetailTaskId(taskId)
    setDetailOpen(true)
    // URL bereinigen, damit ein Reload das Detail nicht erneut öffnet
    window.history.replaceState(null, '', '/dashboard/aufgaben')
  }, [])

  const employeesWithPhone = (employees ?? []).map((e) => ({
    ...e,
    phone: phoneMap[e.id] ?? null,
  }))

  // Mitarbeiter-Filter-Chips: eindeutige Zuständige aus allen Aufgaben.
  const people = useMemo(() => {
    const map = new Map<string, { id: string; name: string; color: string }>()
    for (const t of tasks) {
      for (const a of t.assignees) map.set(a.id, a)
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name))
  }, [tasks])

  const filtered = filterId
    ? tasks.filter((t) => t.assignees.some((a) => a.id === filterId))
    : tasks

  // Gruppierung wie in der App.
  const active = filtered.filter((t) => !isDone(t))
  const mineActive = myEmployeeId
    ? active.filter((t) => t.assignees.some((a) => a.id === myEmployeeId))
    : []
  const othersActive = myEmployeeId
    ? active.filter((t) => !t.assignees.some((a) => a.id === myEmployeeId))
    : active
  // Erledigte: zuletzt erledigt zuerst (completed_at absteigend; ohne Datum ans Ende).
  const byCompletedDesc = (a: Task, b: Task) => {
    const ta = a.completed_at ? new Date(a.completed_at).getTime() : 0
    const tb = b.completed_at ? new Date(b.completed_at).getTime() : 0
    return tb - ta
  }
  const doneAll = filtered.filter(isDone)
  const archived = doneAll.filter(isArchived).sort(byCompletedDesc)
  const doneRecent = doneAll.filter((t) => !isArchived(t)).sort(byCompletedDesc)

  const openTask = (task: Task) => {
    setDetailTaskId(task.id)
    setDetailOpen(true)
  }

  const handleNewTask = () => {
    setEditTask(null)
    setDialogOpen(true)
  }

  const handleEdit = (task: Task) => {
    setEditTask(task)
    setDialogOpen(true)
  }

  const handleSave = async (payload: CreateTaskPayload): Promise<SaveResult> => {
    const res = editTask ? await updateTask(editTask.id, payload) : await createTask(payload)
    if (res.ok) setDetailRefreshKey((k) => k + 1)
    return res
  }

  return (
    <div className="space-y-5">
      {/* Kopfzeile: Filter-Chips + Aktionen */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-1.5">
          <FilterChip
            label="Alle"
            selected={filterId === null}
            onClick={() => setFilterId(null)}
          />
          {people.map((p) => (
            <FilterChip
              key={p.id}
              label={p.name}
              color={p.color}
              selected={filterId === p.id}
              onClick={() => setFilterId(filterId === p.id ? null : p.id)}
            />
          ))}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button variant="outline" size="sm" onClick={refresh} disabled={isLoading}>
            <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          </Button>
          <Button size="sm" onClick={handleNewTask} className="gap-1.5">
            <Plus className="h-4 w-4" />
            Neue Aufgabe
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {isLoading ? (
        <LoadingState />
      ) : filtered.length === 0 ? (
        <p className="py-16 text-center text-sm text-muted-foreground">Keine Aufgaben.</p>
      ) : (
        <div className="space-y-2">
          {/* Meine Aufgaben (dem eingeloggten Chef zugewiesen) */}
          {mineActive.length > 0 && (
            <CollapsibleSection
              title="Meine Aufgaben"
              count={mineActive.length}
              tone="primary"
              defaultOpen
            >
              <ActiveGroups tasks={mineActive} onTaskClick={openTask} />
            </CollapsibleSection>
          )}

          {/* Aufgaben der Mitarbeiter */}
          {othersActive.length > 0 && (
            <CollapsibleSection
              title={myEmployeeId ? 'Aufgaben der Mitarbeiter' : 'Aufgaben'}
              count={othersActive.length}
              defaultOpen
            >
              <ActiveGroups tasks={othersActive} onTaskClick={openTask} />
            </CollapsibleSection>
          )}

          {/* Erledigt (letzte 30 Tage) — zugeklappt */}
          {doneRecent.length > 0 && (
            <CollapsibleSection
              title="Erledigt"
              count={doneRecent.length}
              tone="green"
            >
              <TaskRows tasks={doneRecent} onTaskClick={openTask} />
            </CollapsibleSection>
          )}

          {/* Archiv (seit über 30 Tagen erledigt) — ganz unten, zugeklappt */}
          {archived.length > 0 && (
            <CollapsibleSection title="Archiv" count={archived.length}>
              <TaskRows tasks={archived} onTaskClick={openTask} />
            </CollapsibleSection>
          )}
        </div>
      )}

      {/* Detail (wie App: Aktionen + Kommentar-Thread) */}
      <AufgabeDetailSheet
        taskId={detailTaskId}
        open={detailOpen}
        refreshKey={detailRefreshKey}
        myEmployeeId={myEmployeeId}
        onClose={() => setDetailOpen(false)}
        onEdit={handleEdit}
        onDelete={deleteTask}
        onChanged={refresh}
      />

      {/* Anlegen/Bearbeiten — bestehender Dialog */}
      <AufgabenDialog
        open={dialogOpen}
        task={editTask}
        employees={employeesWithPhone}
        defaultOrgNodeId={null}
        onClose={() => { setDialogOpen(false); setEditTask(null); refresh() }}
        onSave={handleSave}
        onDelete={async (id) => {
          const ok = await deleteTask(id)
          if (ok && detailTaskId === id) setDetailOpen(false)
          return ok
        }}
      />
    </div>
  )
}

// ── Filter-Chip (wie ChoiceChip der App) ─────────────────────────────────

function FilterChip({ label, color, selected, onClick }: {
  label: string
  color?: string
  selected: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
        selected
          ? 'border-primary bg-primary text-primary-foreground'
          : 'bg-background hover:bg-muted'
      }`}
    >
      {color && (
        <span
          className="h-2.5 w-2.5 shrink-0 rounded-full"
          style={{ backgroundColor: color }}
          aria-hidden
        />
      )}
      {label}
    </button>
  )
}

// ── Aufklappbare Hauptrubrik ─────────────────────────────────────────────

function CollapsibleSection({ title, count, tone, defaultOpen = false, children }: {
  title: string
  count: number
  tone?: 'primary' | 'green'
  defaultOpen?: boolean
  children: ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  const toneClass =
    tone === 'primary' ? 'text-primary'
    : tone === 'green' ? 'text-green-600 dark:text-green-400'
    : 'text-foreground/85'
  const badgeClass =
    tone === 'primary' ? 'bg-primary/15 text-primary'
    : tone === 'green' ? 'bg-green-500/15 text-green-600 dark:text-green-400'
    : 'bg-muted text-foreground/70'

  return (
    <section>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 rounded-md px-1 py-2 text-left hover:bg-muted/50"
        aria-expanded={open}
      >
        <span className={`text-sm font-extrabold ${toneClass}`}>{title}</span>
        <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${badgeClass}`}>
          {count}
        </span>
        <span className="flex-1" />
        {open
          ? <ChevronUp className="h-4 w-4 text-muted-foreground" />
          : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
      </button>
      {open && <div className="pb-2">{children}</div>}
    </section>
  )
}

// ── Überfällig / Offen als Unterabschnitte ───────────────────────────────

function ActiveGroups({ tasks, onTaskClick }: {
  tasks: Task[]
  onTaskClick: (t: Task) => void
}) {
  const overdue = tasks.filter(isOverdue)
  const open = tasks.filter((t) => !isOverdue(t))
  return (
    <div className="space-y-1">
      {overdue.length > 0 && (
        <>
          <SubHeader label="Überfällig" count={overdue.length} tone="red" />
          <TaskRows tasks={overdue} onTaskClick={onTaskClick} />
        </>
      )}
      {open.length > 0 && (
        <>
          <SubHeader label="Offen" count={open.length} />
          <TaskRows tasks={open} onTaskClick={onTaskClick} />
        </>
      )}
    </div>
  )
}

function SubHeader({ label, count, tone }: { label: string; count: number; tone?: 'red' }) {
  const c = tone === 'red' ? 'text-red-600 dark:text-red-400' : 'text-muted-foreground'
  return (
    <p className={`px-1 pb-1 pt-2 text-xs font-extrabold uppercase tracking-wider ${c}`}>
      {label} <span className="font-semibold opacity-70">{count}</span>
    </p>
  )
}

// ── Aufgaben-Zeilen ──────────────────────────────────────────────────────

function TaskRows({ tasks, onTaskClick }: { tasks: Task[]; onTaskClick: (t: Task) => void }) {
  return (
    <div className="space-y-2">
      {tasks.map((t) => (
        <TaskRow key={t.id} task={t} onClick={() => onTaskClick(t)} />
      ))}
    </div>
  )
}

function TaskRow({ task, onClick }: { task: Task; onClick: () => void }) {
  const overdue = isOverdue(task)
  const done = isDone(task)
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full rounded-xl border bg-card px-4 py-3 text-left shadow-sm transition-colors hover:bg-muted/50"
    >
      <div className="flex items-center gap-2">
        {overdue && (
          <span className="text-lg font-black leading-none text-red-500" aria-label="Überfällig">
            !
          </span>
        )}
        <span
          className={`min-w-0 flex-1 truncate text-sm font-bold ${
            done ? 'text-muted-foreground line-through' : ''
          }`}
        >
          {task.title}
        </span>
        <span className={`shrink-0 rounded-md px-2 py-0.5 text-xs font-bold ${STATUS_META[task.status].className}`}>
          {STATUS_META[task.status].label}
        </span>
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
        {task.due_date ? (
          <span
            className={`flex items-center gap-1 text-xs ${
              overdue ? 'font-bold text-red-500' : 'text-muted-foreground'
            }`}
          >
            <CalendarDays className="h-3.5 w-3.5" />
            {formatDueShort(task.due_date)}
          </span>
        ) : (
          <span />
        )}
        {task.assignees.length === 0 ? (
          <span className="text-xs text-muted-foreground/70">Nicht zugewiesen</span>
        ) : (
          <span className="flex flex-wrap items-center justify-end gap-x-2.5 gap-y-1">
            {task.assignees.slice(0, 3).map((a) => (
              <span key={a.id} className="flex items-center gap-1.5 text-xs font-semibold text-foreground/80">
                <span
                  className="h-3 w-3 shrink-0 rounded-full"
                  style={{ backgroundColor: a.color }}
                  aria-hidden
                />
                {a.name}
              </span>
            ))}
            {task.assignees.length > 3 && (
              <span className="text-xs text-muted-foreground">
                +{task.assignees.length - 3}
              </span>
            )}
          </span>
        )}
      </div>
    </button>
  )
}

function LoadingState() {
  return (
    <div className="space-y-2">
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="h-16 animate-pulse rounded-xl border bg-muted/40" />
      ))}
    </div>
  )
}
