/**
 * CashFlow — Lagerbestand pro Monat (features/cashflow/lagerbestand.md)
 *
 * Gemeinsame Typen, API-Formen, Parser, Formatierer und Rechenhelfer fuer
 * Uebersicht und Eingabe. Der Lagerbestand ist strikt von den Barmitteln
 * getrennt: nichts hier veraendert Barmittel-Werte.
 */
import type { CashAccount, CashBalance } from '@/lib/cashflow'
import { formatEUR, previousMonthKey } from '@/lib/cashflow'

// ---------------------------------------------------------------------------
// Felder + Grenzen
// ---------------------------------------------------------------------------

export const INVENTORY_FIELDS = [
  'units',
  'purchase_value',
  'potential_revenue',
  'potential_profit',
] as const

export type InventoryField = (typeof INVENTORY_FIELDS)[number]

/** Wertebereiche — identisch in Browser, Zod (API) und DB-CHECKs. */
export const INVENTORY_LIMITS = {
  UNITS_MAX: 99_999_999,
  EUR_MAX: 999_999_999.99,
  /** Nur potential_profit darf negativ sein */
  PROFIT_MIN: -999_999_999.99,
} as const

export interface InventoryFieldMeta {
  key: InventoryField
  /** Volle Bezeichnung (KPI-Titel, Labels) */
  label: string
  /** Kurz (Tabellenkopf, Toast) */
  shortLabel: string
  kind: 'units' | 'eur'
  allowNegative: boolean
}

export const INVENTORY_FIELD_META: Record<InventoryField, InventoryFieldMeta> = {
  units: { key: 'units', label: 'Einheiten', shortLabel: 'Einheiten', kind: 'units', allowNegative: false },
  purchase_value: { key: 'purchase_value', label: 'Einkaufspreis (EK)', shortLabel: 'Einkaufspreis', kind: 'eur', allowNegative: false },
  potential_revenue: { key: 'potential_revenue', label: 'Potenzieller Umsatz', shortLabel: 'Pot. Umsatz', kind: 'eur', allowNegative: false },
  potential_profit: { key: 'potential_profit', label: 'Potenzieller Gewinn', shortLabel: 'Pot. Gewinn', kind: 'eur', allowNegative: true },
}

// ---------------------------------------------------------------------------
// Datenmodell + API-Formen (Vertrag mit /api/cashflow/inventory)
// ---------------------------------------------------------------------------

/** Eine Zeile aus `cash_inventory` (ein Amazon-Konto, ein Monat). */
export interface CashInventory {
  id: string
  account_id: string
  month: string // 'YYYY-MM-01'
  units: number | null
  purchase_value: number | null
  potential_revenue: number | null
  potential_profit: number | null
}

/** GET /api/cashflow/inventory[?from=YYYY-MM&to=YYYY-MM] -> 200 */
export interface InventoryListResponse {
  inventory: CashInventory[]
}

/**
 * POST /api/cashflow/inventory — Teil-Upsert.
 * Nur mitgeschickte Felder werden geaendert, `null` loescht den Wert,
 * nicht mitgeschickte Felder bleiben unveraendert. Mindestens ein Feld.
 */
export type InventoryUpsertRequest = {
  account_id: string
  month: string // 'YYYY-MM-01' (oder 'YYYY-MM')
} & Partial<Record<InventoryField, number | null>>

/** POST -> 200. `inventory` = aktuelle Zeile, oder null + removed=true wenn alle vier leer. */
export interface InventoryUpsertResponse {
  inventory: CashInventory | null
  removed: boolean
}

/** Fehlerantwort (400/401/403/404/500). 400 darf auch Zod-flatten() enthalten. */
export interface InventoryErrorResponse {
  error: string | { formErrors?: string[]; fieldErrors?: Record<string, string[] | undefined> }
}

function toNumOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

/** Supabase liefert NUMERIC ggf. als String — hier immer auf number|null normalisieren. */
export function normalizeInventoryRow(raw: Record<string, unknown>): CashInventory {
  return {
    id: String(raw.id ?? ''),
    account_id: String(raw.account_id ?? ''),
    month: `${String(raw.month ?? '').slice(0, 7)}-01`,
    units: toNumOrNull(raw.units),
    purchase_value: toNumOrNull(raw.purchase_value),
    potential_revenue: toNumOrNull(raw.potential_revenue),
    potential_profit: toNumOrNull(raw.potential_profit),
  }
}

/** Liest eine lesbare Fehlermeldung aus einer API-Fehlerantwort. */
export function extractApiError(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null
  const err = (body as InventoryErrorResponse).error
  if (typeof err === 'string') return err
  if (err && typeof err === 'object') {
    const first =
      err.formErrors?.[0] ??
      Object.values(err.fieldErrors ?? {}).find((v) => v && v.length > 0)?.[0]
    return first ?? null
  }
  return null
}

// ---------------------------------------------------------------------------
// Konten
// ---------------------------------------------------------------------------

export function isAmazonAccount(acc: Pick<CashAccount, 'provider'>): boolean {
  return acc.provider.trim().toLowerCase() === 'amazon'
}

/** Lager-Konten der Eingabe: aktiv + Provider Amazon, nach sort_order. */
export function inventoryEntryAccounts(accounts: CashAccount[]): CashAccount[] {
  return accounts
    .filter((a) => a.is_active && isAmazonAccount(a))
    .sort((a, b) => a.sort_order - b.sort_order)
}

// ---------------------------------------------------------------------------
// Parser (deutsches Zahlenformat)
// ---------------------------------------------------------------------------

export type ParseResult = { ok: true; value: number | null } | { ok: false; error: string }

const MSG = {
  unreadable: 'Bitte eine Zahl eingeben (z. B. 1.234,56)',
  unitsInvalid: 'Nur ganze Zahlen ab 0',
  unitsMax: 'Höchstens 99.999.999',
  eurInvalid: 'Nur Beträge ab 0, max. 2 Nachkommastellen',
  eurMax: 'Höchstens 999.999.999,99 €',
  profitInvalid: 'Nur Beträge mit max. 2 Nachkommastellen',
  profitRange: 'Zwischen −999.999.999,99 € und 999.999.999,99 €',
}

/**
 * Zerlegt einen Zahlen-Text in Vorzeichen, Ganzzahl- und Nachkommateil.
 * Regeln: Komma = Dezimal, Punkte = Tausender (1.234,56). Ein einzelner Punkt
 * mit 1–2 Ziffern dahinter ist Dezimal (12.50). Leerzeichen werden ignoriert.
 */
function splitNumber(text: string): { negative: boolean; int: string; frac: string } | null {
  let s = text.replace(/[\s  ]/g, '').replace(/€$/, '').replace(/stk\.?$/i, '')
  let negative = false
  if (/^[-−–]/.test(s)) {
    negative = true
    s = s.slice(1)
  } else if (s.startsWith('+')) {
    s = s.slice(1)
  }
  if (s === '') return null

  let int: string
  let frac = ''
  if (s.includes(',')) {
    const parts = s.split(',')
    if (parts.length !== 2) return null
    ;[int, frac] = parts
    if (!/^\d*$/.test(frac)) return null
    if (int === '') int = '0'
    if (!/^\d+$/.test(int) && !/^\d{1,3}(\.\d{3})+$/.test(int)) return null
    int = int.replace(/\./g, '')
  } else if (s.includes('.')) {
    if (/^\d+\.\d{1,2}$/.test(s)) {
      ;[int, frac] = s.split('.')
    } else if (/^\d{1,3}(\.\d{3})+$/.test(s)) {
      int = s.replace(/\./g, '')
    } else {
      return null
    }
  } else {
    if (!/^\d+$/.test(s)) return null
    int = s
  }
  if (int === '' && frac === '') return null
  return { negative, int: int || '0', frac }
}

/**
 * Prueft eine Eingabe fuer ein Lagerfeld. Leerer Text = `null` (Wert loeschen).
 */
export function parseInventoryInput(raw: string, field: InventoryField): ParseResult {
  const text = raw.trim()
  if (text === '') return { ok: true, value: null }
  const meta = INVENTORY_FIELD_META[field]
  const parts = splitNumber(text)

  if (meta.kind === 'units') {
    if (!parts || parts.negative || /[^0]/.test(parts.frac)) {
      return { ok: false, error: MSG.unitsInvalid }
    }
    const value = Number(parts.int)
    if (value > INVENTORY_LIMITS.UNITS_MAX) return { ok: false, error: MSG.unitsMax }
    return { ok: true, value }
  }

  if (!parts) return { ok: false, error: MSG.unreadable }
  const invalid = meta.allowNegative ? MSG.profitInvalid : MSG.eurInvalid
  if (parts.negative && !meta.allowNegative) return { ok: false, error: invalid }
  if (parts.frac.length > 2) return { ok: false, error: invalid }

  const abs = Number(`${parts.int}.${parts.frac || '0'}`)
  const value = Math.round((parts.negative ? -abs : abs) * 100) / 100
  if (meta.allowNegative) {
    if (value > INVENTORY_LIMITS.EUR_MAX || value < INVENTORY_LIMITS.PROFIT_MIN) {
      return { ok: false, error: MSG.profitRange }
    }
  } else if (value > INVENTORY_LIMITS.EUR_MAX) {
    return { ok: false, error: MSG.eurMax }
  }
  // -0 vermeiden
  return { ok: true, value: value === 0 ? 0 : value }
}

// ---------------------------------------------------------------------------
// Formatierer
// ---------------------------------------------------------------------------

const MINUS = '−' // U+2212

function fixMinus(s: string): string {
  return s.replace(/^-/, MINUS).replace(/-(?=\d)/, MINUS)
}

/** "12.345 Stk." */
export function formatUnits(value: number): string {
  return `${fixMinus(value.toLocaleString('de-DE', { maximumFractionDigits: 0 }))} Stk.`
}

/** Wert eines Felds inkl. Einheit ("12.345 Stk." / "48.210,50 €"). */
export function formatInventoryValue(field: InventoryField, value: number): string {
  return INVENTORY_FIELD_META[field].kind === 'units' ? formatUnits(value) : fixMinus(formatEUR(value))
}

/** Normalisierter Eingabefeld-Text ohne Einheit ("1.234,56" / "4.120"). */
export function formatInputValue(field: InventoryField, value: number | null): string {
  if (value === null) return ''
  if (INVENTORY_FIELD_META[field].kind === 'units') {
    return value.toLocaleString('de-DE', { maximumFractionDigits: 0 })
  }
  return fixMinus(
    value.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  )
}

/** Δ absolut mit Vorzeichen immer: "+1.240 Stk.", "−2.310,00 €", "±0 Stk." */
export function formatInventoryDelta(field: InventoryField, delta: number): string {
  const sign = delta > 0 ? '+' : delta < 0 ? MINUS : '±'
  const abs = Math.abs(delta)
  return `${sign}${formatInventoryValue(field, abs)}`
}

/** Δ %: "+4,1 %", "−12,0 %", "±0,0 %" oder "–" (kein Vergleich / Vergleichswert 0). */
export function formatDeltaPct(pct: number | null): string {
  if (pct === null || !Number.isFinite(pct)) return '–'
  const rounded = Math.round(pct * 10) / 10
  const sign = rounded > 0 ? '+' : rounded < 0 ? MINUS : '±'
  const abs = Math.abs(rounded).toLocaleString('de-DE', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })
  return `${sign}${abs} %`
}

/** Δ-Farbklassen (neue Komponenten, AA-Kontrast). */
export function deltaColorClass(delta: number | null): string {
  if (delta === null || delta === 0) return 'text-muted-foreground'
  return delta > 0 ? 'text-green-700 dark:text-green-400' : 'text-red-600 dark:text-red-400'
}

// ---------------------------------------------------------------------------
// Aggregation + Vergleichslogik
// ---------------------------------------------------------------------------

export interface InventoryMonthSummary {
  month: string
  /** Summe der Konten mit Wert; null = kein Konto hat einen Wert (nicht 0) */
  values: Record<InventoryField, number | null>
  /** Konten, die fuer das jeweilige Feld einen Wert haben */
  accountIds: Record<InventoryField, string[]>
}

function emptyFieldRecord<T>(make: () => T): Record<InventoryField, T> {
  return {
    units: make(),
    purchase_value: make(),
    potential_revenue: make(),
    potential_profit: make(),
  }
}

function roundForField(field: InventoryField, n: number): number {
  return INVENTORY_FIELD_META[field].kind === 'units' ? Math.round(n) : Math.round(n * 100) / 100
}

/**
 * Monatssummen, aufsteigend. Nur Monate mit mindestens einem Wert.
 * `accountId` = null -> alle Konten (auch inaktive / umgestellte), sonst nur dieses Konto.
 */
export function summarizeInventory(
  rows: CashInventory[],
  accountId: string | null = null
): InventoryMonthSummary[] {
  const byMonth = new Map<string, InventoryMonthSummary>()
  for (const r of rows) {
    if (accountId && r.account_id !== accountId) continue
    let s = byMonth.get(r.month)
    for (const f of INVENTORY_FIELDS) {
      const v = r[f]
      if (v === null) continue
      if (!s) {
        s = { month: r.month, values: emptyFieldRecord(() => null), accountIds: emptyFieldRecord(() => []) }
        byMonth.set(r.month, s)
      }
      s.values[f] = roundForField(f, (s.values[f] ?? 0) + v)
      s.accountIds[f].push(r.account_id)
    }
  }
  return Array.from(byMonth.values()).sort((a, b) => a.month.localeCompare(b.month))
}

export interface FieldComparison {
  value: number | null
  compareMonth: string | null
  compareValue: number | null
  delta: number | null
  /** null, wenn Vergleichswert fehlt oder 0 ist */
  pct: number | null
  /** true, wenn Vergleichsmonat nicht der direkte Vormonat ist (Label „zu Aug '26“ zeigen) */
  isGap: boolean
}

/**
 * Vergleicht `summaries[index]` fuer ein Feld mit dem letzten frueheren Monat,
 * der fuer genau dieses Feld einen Wert hat.
 */
export function compareField(
  summaries: InventoryMonthSummary[],
  index: number,
  field: InventoryField
): FieldComparison {
  const cur = summaries[index]
  const value = cur?.values[field] ?? null
  let compare: InventoryMonthSummary | null = null
  for (let i = index - 1; i >= 0; i--) {
    if (summaries[i].values[field] !== null) {
      compare = summaries[i]
      break
    }
  }
  const compareValue = compare ? compare.values[field] : null
  if (value === null || compare === null || compareValue === null) {
    return { value, compareMonth: compare?.month ?? null, compareValue, delta: null, pct: null, isGap: false }
  }
  const delta = roundForField(field, value - compareValue)
  const pct = compareValue === 0 ? null : (delta / Math.abs(compareValue)) * 100
  return {
    value,
    compareMonth: compare.month,
    compareValue,
    delta,
    pct,
    isGap: compare.month !== previousMonthKey(cur.month),
  }
}

// ---------------------------------------------------------------------------
// Barmittel-Summe fuer das Vergleichsdiagramm
// ---------------------------------------------------------------------------

/**
 * Gesamt-Barmittel je Monat — exakt dieselbe Rechnung wie der bestehende
 * Trend-Chart in CashFlowOverview (alle Monate mit Barmittel-Zeilen, Summe nur
 * ueber aktive, bekannte Konten). Nur lesend, aendert keine Barmittel-Werte.
 */
export function cashTotalsByMonth(
  accounts: CashAccount[],
  balances: CashBalance[]
): Map<string, number> {
  const totals = new Map<string, number>()
  for (const b of balances) {
    if (!totals.has(b.month)) totals.set(b.month, 0)
    const acc = accounts.find((a) => a.id === b.account_id)
    if (!acc || !acc.is_active) continue
    totals.set(b.month, totals.get(b.month)! + Number(b.amount))
  }
  return totals
}

// ---------------------------------------------------------------------------
// Lokales Zusammenfuehren nach einem Speichern (ohne Neuladen)
// ---------------------------------------------------------------------------

/**
 * Uebernimmt aus der Serverantwort nur das eine gespeicherte Feld in den
 * lokalen Stand. Sind danach alle vier Felder leer, wird die Zeile entfernt.
 */
export function mergeInventoryField(
  rows: CashInventory[],
  accountId: string,
  month: string,
  field: InventoryField,
  value: number | null,
  serverRow: CashInventory | null
): CashInventory[] {
  const idx = rows.findIndex((r) => r.account_id === accountId && r.month === month)
  const base: CashInventory =
    idx >= 0
      ? rows[idx]
      : serverRow ?? {
          id: '',
          account_id: accountId,
          month,
          units: null,
          purchase_value: null,
          potential_revenue: null,
          potential_profit: null,
        }
  const merged: CashInventory = { ...base, id: serverRow?.id || base.id, [field]: value }
  const empty = INVENTORY_FIELDS.every((f) => merged[f] === null)
  const next = rows.slice()
  if (idx >= 0) {
    if (empty) next.splice(idx, 1)
    else next[idx] = merged
  } else if (!empty) {
    next.push(merged)
    next.sort((a, b) => a.month.localeCompare(b.month))
  }
  return next
}
