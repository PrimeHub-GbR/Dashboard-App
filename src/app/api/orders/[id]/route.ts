import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase-server'
import { rateLimit } from '@/lib/rate-limit'

const patchSchema = z.object({
  status: z.string().min(1).max(100).optional(),
  notes: z.string().max(2000).optional(),
}).refine((data) => Object.keys(data).length > 0, {
  message: 'Mindestens ein Feld muss angegeben werden',
})

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // 1. Authenticate user
    const supabaseAuth = await createSupabaseServerClient()
    const {
      data: { user },
      error: authError,
    } = await supabaseAuth.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Nicht authentifiziert' }, { status: 401 })
    }

    // 1b. Rate limiting (BUG-9: 20 requests per minute per user)
    if (!rateLimit(`orders-patch:${user.id}`, 20, 60_000)) {
      return NextResponse.json(
        { error: 'Zu viele Anfragen. Bitte warten Sie einen Moment.' },
        { status: 429 }
      )
    }

    // 1c. Check admin role (BUG-1 + BUG-2: only admins may edit orders)
    const supabaseService = createSupabaseServiceClient()
    const { data: roleData, error: roleError } = await supabaseService
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .single()

    if (roleError || !roleData || roleData.role !== 'admin') {
      return NextResponse.json(
        { error: 'Nur Administratoren duerfen Bestellungen bearbeiten' },
        { status: 403 }
      )
    }

    // 2. Parse and validate order ID
    const { id } = await params
    if (!id || typeof id !== 'string') {
      return NextResponse.json({ error: 'Ungültige Bestellungs-ID' }, { status: 400 })
    }

    // 3. Parse and validate request body
    let body: unknown
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Ungültiger Request-Body' }, { status: 400 })
    }

    const parseResult = patchSchema.safeParse(body)
    if (!parseResult.success) {
      return NextResponse.json(
        { error: 'Validierungsfehler', details: parseResult.error.flatten().fieldErrors },
        { status: 400 }
      )
    }

    const fields = parseResult.data

    // 4. Update order via service client (updated_at handled by DB trigger)
    const { data: updated, error: updateError } = await supabaseService
      .from('orders')
      .update(fields)
      .eq('id', id)
      .select()
      .single()

    if (updateError) {
      if (updateError.code === 'PGRST116') {
        return NextResponse.json({ error: 'Bestellung nicht gefunden' }, { status: 404 })
      }
      return NextResponse.json(
        { error: `Fehler beim Speichern: ${updateError.message}` },
        { status: 500 }
      )
    }

    return NextResponse.json(updated)
  } catch (err) {
    console.error('PATCH /api/orders/[id] error:', err)
    return NextResponse.json({ error: 'Interner Serverfehler' }, { status: 500 })
  }
}
