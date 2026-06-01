export interface CashAccount {
  id: string
  provider: string
  name: string
  color: string
  sort_order: number
  is_active: boolean
}

export interface CashBalance {
  id: string
  account_id: string
  month: string // 'YYYY-MM-01'
  amount: number
  note: string | null
}

/** EUR im deutschen Format, z.B. "1.234,56 €" */
export function formatEUR(value: number): string {
  return value.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })
}

/** Kompakter EUR-Wert ohne Nachkommastellen, z.B. "1.234 €" */
export function formatEURShort(value: number): string {
  return value.toLocaleString('de-DE', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  })
}

/** 'YYYY-MM-01' -> "März 2026" */
export function formatMonthLabel(month: string): string {
  const d = new Date(`${month.slice(0, 7)}-01T00:00:00`)
  return d.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' })
}

/** 'YYYY-MM-01' -> "Mrz '26" (kurz, fuer Charts/Spalten) */
export function formatMonthShort(month: string): string {
  const d = new Date(`${month.slice(0, 7)}-01T00:00:00`)
  const m = d.toLocaleDateString('de-DE', { month: 'short' })
  const y = String(d.getFullYear()).slice(2)
  return `${m} '${y}`
}

/** Periodenschluessel des aktuellen Monats, z.B. '2026-06-01' */
export function currentMonthKey(now: Date = new Date()): string {
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  return `${y}-${m}-01`
}

/** Liefert den vorherigen Monatsschluessel zu 'YYYY-MM-01' */
export function previousMonthKey(month: string): string {
  const d = new Date(`${month.slice(0, 7)}-01T00:00:00`)
  d.setMonth(d.getMonth() - 1)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  return `${y}-${m}-01`
}
