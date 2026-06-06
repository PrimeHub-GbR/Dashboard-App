import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase-server'

const looseUuid = z.string().regex(
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
  'Ungültige ID',
)

const createSchema = z.object({
  title: z.string().min(1).max(200),
  quantity: z.coerce.number().int().min(1).max(9999),
  product_url: z.string().url().max(2000).optional().nullable(),
})

async function requireAuth() {
  const supabase = await createSupabaseServerClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return null
  return user
}

// Liste aller aktiven Lager-Produkte (für die Verwaltung im Dashboard).
export async function GET() {
  const user = await requireAuth()
  if (!user) return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 })

  const service = createSupabaseServiceClient()
  const { data, error } = await service
    .from('reorder_products')
    .select('id, title, quantity, product_url, is_active, created_at')
    .eq('is_active', true)
    .order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ products: data ?? [] })
}

// Neues Produkt anlegen → Grundlage für das QR-Etikett.
export async function POST(req: NextRequest) {
  const user = await requireAuth()
  if (!user) return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 })

  const body = await req.json().catch(() => null)
  const parsed = createSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Ungültige Eingabe' }, { status: 400 })
  }
  const { title, quantity, product_url } = parsed.data

  const service = createSupabaseServiceClient()
  // created_by: employee-Datensatz des eingeloggten Users (falls vorhanden).
  const { data: emp } = await service
    .from('employees')
    .select('id')
    .eq('auth_user_id', user.id)
    .maybeSingle()

  const { data, error } = await service
    .from('reorder_products')
    .insert({
      title: title.trim(),
      quantity,
      product_url: product_url && product_url.trim().length > 0 ? product_url.trim() : null,
      created_by: emp?.id ?? null,
    })
    .select('id, title, quantity, product_url, is_active, created_at')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ product: data })
}

// Produkt deaktivieren (aus der Verwaltung entfernen).
export async function DELETE(req: NextRequest) {
  const user = await requireAuth()
  if (!user) return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  const parsed = looseUuid.safeParse(id)
  if (!parsed.success) return NextResponse.json({ error: 'Ungültige ID' }, { status: 400 })

  const service = createSupabaseServiceClient()
  const { error } = await service
    .from('reorder_products')
    .update({ is_active: false })
    .eq('id', parsed.data)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
