import { Task, TaskPriority, TaskStatus } from '@/hooks/useAufgaben'

// Gemeinsame Status-/Prioritäts-Metadaten + Datumshelfer für die
// Aufgaben-Ansichten (Liste + Detail) — Labels und Farben wie in der App.

export const STATUS_META: Record<TaskStatus, { label: string; className: string }> = {
  todo:        { label: 'Offen',          className: 'bg-slate-500/15 text-slate-600 dark:text-slate-300' },
  in_progress: { label: 'In Bearbeitung', className: 'bg-blue-500/15 text-blue-600 dark:text-blue-400' },
  in_review:   { label: 'In Review',      className: 'bg-purple-500/15 text-purple-600 dark:text-purple-400' },
  done:        { label: 'Erledigt',       className: 'bg-green-500/15 text-green-600 dark:text-green-400' },
  blocked:     { label: 'Nicht machbar',  className: 'bg-red-500/15 text-red-600 dark:text-red-400' },
}

export const PRIORITY_META: Record<TaskPriority, { label: string; className: string }> = {
  high:   { label: 'Hoch',    className: 'bg-red-500/15 text-red-600 dark:text-red-400' },
  medium: { label: 'Mittel',  className: 'bg-amber-500/15 text-amber-600 dark:text-amber-400' },
  low:    { label: 'Niedrig', className: 'bg-slate-500/15 text-slate-600 dark:text-slate-300' },
}

/** Heutiges Datum als 'YYYY-MM-DD' in Berlin-Zeit. */
export function todayYmdBerlin(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Berlin' })
}

export const isDone = (t: Task): boolean => t.status === 'done'

/** Überfällig: Fälligkeitsdatum in der Vergangenheit und nicht erledigt. */
export const isOverdue = (t: Task): boolean =>
  !isDone(t) && !!t.due_date && t.due_date < todayYmdBerlin()

/** Frist erreicht oder überschritten (heute/Vergangenheit), nicht erledigt — Gate für Eskalation. */
export const dueReachedOrOverdue = (t: Task): boolean =>
  !isDone(t) && !!t.due_date && t.due_date <= todayYmdBerlin()

const ARCHIVE_DAYS = 30

/** Archiv: seit über 30 Tagen erledigt (status='done', completed_at < heute − 30 Tage). */
export function isArchived(t: Task): boolean {
  if (!isDone(t) || !t.completed_at) return false
  const cutoff = Date.now() - ARCHIVE_DAYS * 24 * 60 * 60 * 1000
  return new Date(t.completed_at).getTime() < cutoff
}

/** 'YYYY-MM-DD' → 'DD.MM.YY' (Listen-Ansicht). */
export function formatDueShort(d: string): string {
  const [y, m, day] = d.split('-')
  return day && m && y ? `${day}.${m}.${y.slice(2)}` : d
}

/** 'YYYY-MM-DD' → 'DD.MM.YYYY' (Detail-Ansicht). */
export function formatDueLong(d: string): string {
  const [y, m, day] = d.split('-')
  return day && m && y ? `${day}.${m}.${y}` : d
}

/** ISO-Zeitstempel → 'DD.MM. HH:mm' (Berlin) für Kommentare. */
export function formatCommentTime(iso: string): string {
  const date = new Date(iso)
  const dm = date.toLocaleDateString('de-DE', {
    timeZone: 'Europe/Berlin', day: '2-digit', month: '2-digit',
  })
  const hm = date.toLocaleTimeString('de-DE', {
    timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit',
  })
  return `${dm} ${hm}`
}
