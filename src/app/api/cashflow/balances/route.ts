import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createSupabaseServiceClient } from '@/lib/supabase-server'
import { requireManager } from '../_auth'

// Erlaubt 'YYYY-MM' oder 'YYYY-MM-01' und normalisiert auf den Monatsersten
const monthSchema = z.string().regex(/^\d{4}-\d{2}(-\d{2})?$/)

const upsertBalanceSchema = z.object({
  account_id: z.string().uuid(),
  month: monthSchema,
  amount: z.coerce.number().min(0).max(999999999),
  note: z.string().max(500).optional().nullable(),
})

function normalizeMonth(value: string): string {
  // 'YYYY-MM' -> 'YYYY-MM-01', 'YYYY-MM-DD' -> 'YYYY-MM-01'
  return `${value.slice(0, 7)}-01`
}

export async function GET(req: NextRequest) {
  const user = await requireManager()
  if (!user) return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const from = searchParams.get('from')
  const to = searchParams.get('to')

  const service = createSupabaseServiceClient()
  let query = service
    .from('cash_balances')
    .select('id, account_id, month, amount, note')
    .order('month', { ascending: true })

  if (from) query = query.gte('month', normalizeMonth(from))
  if (to) query = query.lte('month', normalizeMonth(to))

  const { data, error } = await query
  if (error) return NextResponse.json({ error: 'Datenbankfehler' }, { status: 500 })

  return NextResponse.json({ balances: data ?? [] })
}

export async function POST(req: NextRequest) {
  const user = await requireManager()
  if (!user) return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 })

  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Ungültiger JSON-Body' }, { status: 400 })
  }

  const parsed = upsertBalanceSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const service = createSupabaseServiceClient()
  const { data, error } = await service
    .from('cash_balances')
    .upsert(
      {
        account_id: parsed.data.account_id,
        month: normalizeMonth(parsed.data.month),
        amount: parsed.data.amount,
        note: parsed.data.note ?? null,
        created_by: user.id,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'account_id,month' }
    )
    .select('id, account_id, month, amount, note')
    .single()

  if (error) return NextResponse.json({ error: 'Fehler beim Speichern' }, { status: 500 })
  return NextResponse.json({ balance: data }, { status: 201 })
}
