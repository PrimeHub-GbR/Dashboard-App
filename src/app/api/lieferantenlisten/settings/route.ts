import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import {
  createSupabaseServerClient,
  createSupabaseServiceClient,
} from '@/lib/supabase-server'

const LIEFERANTEN = ['blank', 'a43-kulturgut', 'avus'] as const

const patchSchema = z.object({
  lieferant: z.enum(['blank', 'a43-kulturgut', 'avus']),
  rabatt_prozent: z.number().min(0).max(100),
})

// GET /api/lieferantenlisten/settings — returns discount % for each supplier
export async function GET() {
  try {
    const supabaseAuth = await createSupabaseServerClient()
    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Nicht authentifiziert' }, { status: 401 })
    }

    const supabase = createSupabaseServiceClient()
    const { data: rows } = await supabase
      .from('lieferantenlisten_settings')
      .select('lieferant, rabatt_prozent')
      .eq('user_id', user.id)

    // Build map with defaults (0%) for suppliers with no stored setting
    const result: Record<string, number> = {}
    for (const key of LIEFERANTEN) {
      const row = rows?.find((r) => r.lieferant === key)
      result[key] = row ? Number(row.rabatt_prozent) : 0
    }

    return NextResponse.json(result)
  } catch (err) {
    console.error('GET /api/lieferantenlisten/settings error:', err)
    return NextResponse.json({ error: 'Interner Serverfehler' }, { status: 500 })
  }
}

// PATCH /api/lieferantenlisten/settings — upsert discount for one supplier
export async function PATCH(request: NextRequest) {
  try {
    const supabaseAuth = await createSupabaseServerClient()
    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Nicht authentifiziert' }, { status: 401 })
    }

    const body = await request.json().catch(() => null)
    const parseResult = patchSchema.safeParse(body)
    if (!parseResult.success) {
      return NextResponse.json(
        { error: 'Ungültige Daten', details: parseResult.error.flatten() },
        { status: 400 }
      )
    }

    const { lieferant, rabatt_prozent } = parseResult.data

    const supabase = createSupabaseServiceClient()
    const { error: upsertError } = await supabase
      .from('lieferantenlisten_settings')
      .upsert(
        { user_id: user.id, lieferant, rabatt_prozent, updated_at: new Date().toISOString() },
        { onConflict: 'user_id,lieferant' }
      )

    if (upsertError) {
      return NextResponse.json(
        { error: `Speichern fehlgeschlagen: ${upsertError.message}` },
        { status: 500 }
      )
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('PATCH /api/lieferantenlisten/settings error:', err)
    return NextResponse.json({ error: 'Interner Serverfehler' }, { status: 500 })
  }
}
