import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createSupabaseServerClient } from '@/lib/supabase-server'

const MAP_PAGE_SIZE = 200

async function getAuthenticatedUser(supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>) {
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return { user: null, isAdmin: false }

  const { data } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)
    .single()

  return { user, isAdmin: data?.role === 'admin' }
}

const getQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
})

export async function GET(request: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient()
    const { user } = await getAuthenticatedUser(supabase)

    if (!user) {
      return NextResponse.json({ error: 'Nicht authentifiziert' }, { status: 401 })
    }

    const { searchParams } = request.nextUrl
    const parsed = getQuerySchema.safeParse({ page: searchParams.get('page') ?? undefined })
    if (!parsed.success) {
      return NextResponse.json({ error: 'Ungültige Parameter' }, { status: 400 })
    }

    const { page } = parsed.data
    const from = (page - 1) * MAP_PAGE_SIZE
    const to = from + MAP_PAGE_SIZE - 1

    const { data, error, count } = await supabase
      .from('ean_asin_map')
      .select('id, ean, asin, created_at', { count: 'exact' })
      .order('ean', { ascending: true })
      .range(from, to)

    if (error) {
      console.error('GET /api/prices/ean-asin-map error:', error)
      return NextResponse.json({ error: 'Mappings konnten nicht geladen werden' }, { status: 500 })
    }

    return NextResponse.json({ data: data ?? [], totalCount: count ?? 0 })
  } catch (err) {
    console.error('GET /api/prices/ean-asin-map unexpected error:', err)
    return NextResponse.json({ error: 'Interner Serverfehler' }, { status: 500 })
  }
}

const addSchema = z.object({
  ean: z
    .string()
    .min(8, 'EAN muss mindestens 8 Zeichen haben')
    .max(14, 'EAN darf maximal 14 Zeichen haben')
    .regex(/^\d+$/, 'EAN muss numerisch sein'),
  asin: z
    .string()
    .length(10, 'ASIN muss genau 10 Zeichen haben')
    .regex(/^[A-Z0-9]{10}$/, 'Ungültige ASIN (nur Großbuchstaben und Ziffern)'),
})

export async function POST(request: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient()
    const { user, isAdmin } = await getAuthenticatedUser(supabase)

    if (!user) return NextResponse.json({ error: 'Nicht authentifiziert' }, { status: 401 })
    if (!isAdmin) return NextResponse.json({ error: 'Keine Berechtigung' }, { status: 403 })

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Ungültiger JSON-Body' }, { status: 400 })
    }

    const parsed = addSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Ungültige Daten' },
        { status: 400 }
      )
    }

    const { ean, asin } = parsed.data

    const { data, error } = await supabase
      .from('ean_asin_map')
      .upsert({ ean, asin }, { onConflict: 'ean', ignoreDuplicates: false })
      .select('id, ean, asin, created_at')
      .single()

    if (error) {
      console.error('POST /api/prices/ean-asin-map error:', error)
      return NextResponse.json({ error: 'Mapping konnte nicht gespeichert werden' }, { status: 500 })
    }

    return NextResponse.json({ data }, { status: 201 })
  } catch (err) {
    console.error('POST /api/prices/ean-asin-map unexpected error:', err)
    return NextResponse.json({ error: 'Interner Serverfehler' }, { status: 500 })
  }
}

const deleteSchema = z.object({
  id: z.string().uuid('Ungültige ID'),
})

export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient()
    const { user, isAdmin } = await getAuthenticatedUser(supabase)

    if (!user) return NextResponse.json({ error: 'Nicht authentifiziert' }, { status: 401 })
    if (!isAdmin) return NextResponse.json({ error: 'Keine Berechtigung' }, { status: 403 })

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Ungültiger JSON-Body' }, { status: 400 })
    }

    const parsed = deleteSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Ungültige ID' }, { status: 400 })
    }

    const { error } = await supabase
      .from('ean_asin_map')
      .delete()
      .eq('id', parsed.data.id)

    if (error) {
      console.error('DELETE /api/prices/ean-asin-map error:', error)
      return NextResponse.json({ error: 'Mapping konnte nicht gelöscht werden' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('DELETE /api/prices/ean-asin-map unexpected error:', err)
    return NextResponse.json({ error: 'Interner Serverfehler' }, { status: 500 })
  }
}
