import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase-server'

const settingsUpdateSchema = z.object({
  message_footer: z.string().max(500, 'Fußzeile darf maximal 500 Zeichen lang sein'),
})

// GET /api/kommunikation/settings — aktuelle Einstellungen laden (jeder authentifizierte User)
export async function GET() {
  try {
    const supabaseAuth = await createSupabaseServerClient()
    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Nicht authentifiziert' }, { status: 401 })
    }

    const service = createSupabaseServiceClient()
    const { data, error } = await service
      .from('kommunikation_settings')
      .select('id, message_footer, updated_at')
      .limit(1)
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json(data)
  } catch (err) {
    console.error('[GET /api/kommunikation/settings]', err)
    return NextResponse.json({ error: 'Interner Serverfehler' }, { status: 500 })
  }
}

// PUT /api/kommunikation/settings — Fußzeile aktualisieren (nur Admin/Manager)
export async function PUT(request: NextRequest) {
  try {
    const supabaseAuth = await createSupabaseServerClient()
    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Nicht authentifiziert' }, { status: 401 })
    }

    const service = createSupabaseServiceClient()

    // Rollen-Check: nur Admin/Manager dürfen ändern
    const { data: roleRow } = await service
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .single()

    if (!roleRow || !['admin', 'manager'].includes(roleRow.role)) {
      return NextResponse.json({ error: 'Keine Berechtigung' }, { status: 403 })
    }

    const body = await request.json()
    const result = settingsUpdateSchema.safeParse(body)
    if (!result.success) {
      return NextResponse.json({ error: result.error.flatten() }, { status: 400 })
    }

    const { data: existing } = await service
      .from('kommunikation_settings')
      .select('id')
      .limit(1)
      .single()

    if (!existing) {
      return NextResponse.json({ error: 'Einstellungen nicht gefunden' }, { status: 404 })
    }

    const { data: updated, error: updateError } = await service
      .from('kommunikation_settings')
      .update({ message_footer: result.data.message_footer })
      .eq('id', existing.id)
      .select('id, message_footer, updated_at')
      .single()

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    return NextResponse.json(updated)
  } catch (err) {
    console.error('[PUT /api/kommunikation/settings]', err)
    return NextResponse.json({ error: 'Interner Serverfehler' }, { status: 500 })
  }
}
