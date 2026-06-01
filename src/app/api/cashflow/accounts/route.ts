import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createSupabaseServiceClient } from '@/lib/supabase-server'
import { requireManager } from '../_auth'

const createAccountSchema = z.object({
  provider: z.string().min(1).max(80),
  name: z.string().min(1).max(120),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  sort_order: z.coerce.number().int().optional(),
  is_active: z.boolean().optional(),
})

export async function GET() {
  const user = await requireManager()
  if (!user) return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 })

  const service = createSupabaseServiceClient()
  const { data, error } = await service
    .from('cash_accounts')
    .select('id, provider, name, color, sort_order, is_active')
    .order('sort_order', { ascending: true })
    .order('provider', { ascending: true })

  if (error) return NextResponse.json({ error: 'Datenbankfehler' }, { status: 500 })
  return NextResponse.json({ accounts: data ?? [] })
}

export async function POST(req: NextRequest) {
  const user = await requireManager()
  if (!user) return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 })

  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Ungültiger JSON-Body' }, { status: 400 })
  }

  const parsed = createAccountSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const service = createSupabaseServiceClient()
  const { data, error } = await service
    .from('cash_accounts')
    .insert({
      provider: parsed.data.provider,
      name: parsed.data.name,
      color: parsed.data.color ?? '#22c55e',
      sort_order: parsed.data.sort_order ?? 0,
      is_active: parsed.data.is_active ?? true,
    })
    .select('id, provider, name, color, sort_order, is_active')
    .single()

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'Konto (Provider + Name) existiert bereits' }, { status: 409 })
    }
    return NextResponse.json({ error: 'Fehler beim Erstellen' }, { status: 500 })
  }

  return NextResponse.json({ account: data }, { status: 201 })
}
