import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createSupabaseServiceClient } from '@/lib/supabase-server'
import {
  INVENTORY_FIELDS,
  INVENTORY_LIMITS,
  normalizeInventoryRow,
  type InventoryErrorResponse,
  type InventoryField,
  type InventoryListResponse,
  type InventoryUpsertResponse,
} from '@/lib/cashflow-inventory'
import { checkManager } from '../_auth'

const SELECT_COLUMNS = 'id, account_id, month, units, purchase_value, potential_revenue, potential_profit'
const LIST_LIMIT = 5000

// 'YYYY-MM' oder 'YYYY-MM-DD' mit gueltigem Monat; normalisiert auf den Monatsersten
const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])(-(0[1-9]|[12]\d|3[01]))?$/
const monthSchema = z
  .string({ message: 'Monat fehlt' })
  .regex(MONTH_RE, 'Monat muss im Format JJJJ-MM oder JJJJ-MM-TT sein')

function normalizeMonth(value: string): string {
  return `${value.slice(0, 7)}-01`
}

function hasMaxTwoDecimals(v: number): boolean {
  // toFixed statt v*100: bei ~1e11 Cent ist der Float-Fehler groesser als jede feste Toleranz
  return Number(v.toFixed(2)) === v
}

const unitsSchema = z
  .number({ message: 'Einheiten müssen eine Zahl sein' })
  .int('Einheiten: nur ganze Zahlen')
  .min(0, 'Einheiten: nur Werte ab 0')
  .max(INVENTORY_LIMITS.UNITS_MAX, 'Einheiten: höchstens 99.999.999')
  .nullable()

function eurSchema(label: string, min: number) {
  return z
    .number({ message: `${label} muss eine Zahl sein` })
    .finite(`${label} muss eine Zahl sein`)
    .min(min, min === 0 ? `${label}: nur Beträge ab 0` : `${label}: mindestens -999.999.999,99 €`)
    .max(INVENTORY_LIMITS.EUR_MAX, `${label}: höchstens 999.999.999,99 €`)
    .refine(hasMaxTwoDecimals, `${label}: höchstens 2 Nachkommastellen`)
    .nullable()
}

const upsertInventorySchema = z
  .object({
    account_id: z.string({ message: 'Konto fehlt' }).uuid('Ungültige Konto-ID'),
    month: monthSchema,
    units: unitsSchema.optional(),
    purchase_value: eurSchema('Einkaufspreis', 0).optional(),
    potential_revenue: eurSchema('Potenzieller Umsatz', 0).optional(),
    potential_profit: eurSchema('Potenzieller Gewinn', INVENTORY_LIMITS.PROFIT_MIN).optional(),
  })
  .refine((d) => INVENTORY_FIELDS.some((f) => d[f] !== undefined), {
    message: 'Mindestens ein Lagerfeld muss mitgeschickt werden',
  })

function errorJson(error: InventoryErrorResponse['error'], status: number) {
  return NextResponse.json<InventoryErrorResponse>({ error }, { status })
}

export async function GET(req: NextRequest) {
  const auth = await checkManager()
  if (!auth.ok) return errorJson(auth.error, auth.status)

  const { searchParams } = new URL(req.url)
  const from = searchParams.get('from')
  const to = searchParams.get('to')
  if ((from && !MONTH_RE.test(from)) || (to && !MONTH_RE.test(to))) {
    return errorJson('Ungültiger Zeitraum (Format JJJJ-MM oder JJJJ-MM-TT)', 400)
  }

  const service = createSupabaseServiceClient()
  let query = service
    .from('cash_inventory')
    .select(SELECT_COLUMNS)
    .order('month', { ascending: true })
    .order('account_id', { ascending: true })
    .limit(LIST_LIMIT)

  if (from) query = query.gte('month', normalizeMonth(from))
  if (to) query = query.lte('month', normalizeMonth(to))

  const { data, error } = await query
  if (error) return errorJson('Datenbankfehler', 500)

  return NextResponse.json<InventoryListResponse>({
    inventory: (data ?? []).map((r) => normalizeInventoryRow(r as Record<string, unknown>)),
  })
}

export async function POST(req: NextRequest) {
  const auth = await checkManager()
  if (!auth.ok) return errorJson(auth.error, auth.status)
  const user = auth.user

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return errorJson('Ungültiger JSON-Body', 400)
  }

  const parsed = upsertInventorySchema.safeParse(body)
  if (!parsed.success) return errorJson(parsed.error.flatten(), 400)

  const { account_id } = parsed.data
  const month = normalizeMonth(parsed.data.month)
  const service = createSupabaseServiceClient()

  // Konto pruefen: muss existieren und Provider Amazon sein (inaktiv ist erlaubt)
  const { data: account, error: accError } = await service
    .from('cash_accounts')
    .select('id, provider')
    .eq('id', account_id)
    .maybeSingle()
  if (accError) return errorJson('Datenbankfehler', 500)
  if (!account) return errorJson('Konto nicht gefunden', 404)
  if (String(account.provider ?? '').trim().toLowerCase() !== 'amazon') {
    return errorJson('Nur Amazon-Konten haben einen Lagerbestand', 400)
  }

  // Teil-Upsert: nur mitgeschickte Spalten in den Payload. ON CONFLICT DO UPDATE setzt
  // damit nur diese Spalten — parallele Saves anderer Felder ueberschreiben sich nicht.
  // created_by/created_at haelt ein DB-Trigger bei Updates stabil (Migration 152).
  const payload: Record<string, unknown> = {
    account_id,
    month,
    created_by: user.id,
    updated_by: user.id,
    updated_at: new Date().toISOString(),
  }
  for (const f of INVENTORY_FIELDS) {
    const v = parsed.data[f]
    if (v !== undefined) payload[f] = v
  }

  const { data: upserted, error: upError } = await service
    .from('cash_inventory')
    .upsert(payload, { onConflict: 'account_id,month' })
    .select(SELECT_COLUMNS)
    .single()

  if (upError || !upserted) {
    // 23514 = CHECK-Verletzung (dritte Verteidigungslinie)
    if (upError?.code === '23514') return errorJson('Wert außerhalb des erlaubten Bereichs', 400)
    if (upError?.code === '23503') return errorJson('Konto nicht gefunden', 404)
    return errorJson('Fehler beim Speichern', 500)
  }

  const row = normalizeInventoryRow(upserted as Record<string, unknown>)
  const isEmpty = INVENTORY_FIELDS.every((f: InventoryField) => row[f] === null)
  if (!isEmpty) {
    return NextResponse.json<InventoryUpsertResponse>({ inventory: row, removed: false })
  }

  // Alle vier leer -> Zeile entfernen. Nur loeschen, wenn sie in der DB weiterhin leer ist,
  // damit ein paralleler Save eines anderen Felds nicht verloren geht.
  const { data: deleted, error: delError } = await service
    .from('cash_inventory')
    .delete()
    .eq('id', row.id)
    .is('units', null)
    .is('purchase_value', null)
    .is('potential_revenue', null)
    .is('potential_profit', null)
    .select('id')

  if (delError) return errorJson('Fehler beim Speichern', 500)
  if (deleted && deleted.length > 0) {
    return NextResponse.json<InventoryUpsertResponse>({ inventory: null, removed: true })
  }

  // Zwischenzeitlich hat ein anderer Save einen Wert gesetzt -> aktuellen Stand liefern
  const { data: current, error: curError } = await service
    .from('cash_inventory')
    .select(SELECT_COLUMNS)
    .eq('id', row.id)
    .maybeSingle()
  if (curError) return errorJson('Datenbankfehler', 500)
  if (!current) return NextResponse.json<InventoryUpsertResponse>({ inventory: null, removed: true })
  return NextResponse.json<InventoryUpsertResponse>({
    inventory: normalizeInventoryRow(current as Record<string, unknown>),
    removed: false,
  })
}
