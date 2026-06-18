export type Recurrence = 'monthly' | 'quarterly' | 'biweekly' | 'yearly' | 'once'

export interface Reminder {
  id: string
  title: string
  description: string | null
  next_due_date: string // YYYY-MM-DD
  recurrence: Recurrence
  remind_days_before: number
  is_seed: boolean
  done: boolean
  done_by_name: string | null
  done_at: string | null
  days_until: number
  in_window: boolean
  ack_key: string
}

export interface CompanyInfo {
  id: string
  label: string
  value: string | null
  category: string | null
  sort_order: number
  is_seed: boolean
}

export const RECURRENCE_LABELS: Record<Recurrence, string> = {
  monthly: 'Monatlich',
  quarterly: 'Quartalsweise',
  biweekly: 'Zweiwöchentlich',
  yearly: 'Jährlich',
  once: 'Einmalig',
}

export const RECURRENCE_OPTIONS: { value: Recurrence; label: string }[] = [
  { value: 'monthly', label: 'Monatlich' },
  { value: 'quarterly', label: 'Quartalsweise' },
  { value: 'biweekly', label: 'Zweiwöchentlich' },
  { value: 'yearly', label: 'Jährlich' },
  { value: 'once', label: 'Einmalig' },
]

/** Wandelt ein ISO-Datum (YYYY-MM-DD) in DD.MM.YYYY um. */
export function formatDateDE(iso: string): string {
  if (!iso) return ''
  const [y, m, d] = iso.split('-')
  if (!y || !m || !d) return iso
  return `${d}.${m}.${y}`
}

/** Monatsüberschrift wie "Juli 2026" aus einem ISO-Datum. */
export function monthLabelDE(iso: string): string {
  const date = new Date(`${iso}T00:00:00`)
  return date.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' })
}

/** Schlüssel "YYYY-MM" für Monats-Gruppierung. */
export function monthKey(iso: string): string {
  return iso.slice(0, 7)
}

/** Menschlicher Reststatus-Text für eine Frist. */
export function dueStatusText(r: Reminder): string {
  if (r.days_until < 0) return `${Math.abs(r.days_until)} Tage überfällig`
  if (r.days_until === 0) return 'Heute fällig'
  if (r.days_until === 1) return 'Morgen fällig'
  return `in ${r.days_until} Tagen`
}
