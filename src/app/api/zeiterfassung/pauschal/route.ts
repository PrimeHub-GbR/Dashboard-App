import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createSupabaseServerClient } from '@/lib/supabase-server'

// Pauschale Stunden (Migration 107). Eingabe nur in 30-Min-Schritten.
// Die RPCs sind SECURITY DEFINER und gaten ueber auth.uid() (is_chef/is_gf),
// daher werden sie ueber den User-Session-Client (Cookies) aufgerufen — NICHT
// ueber Service-Role (dort waere auth.uid() null).

const createSchema = z.object({
  employee_id: z.string().uuid(),
  minutes: z.number().int().positive().refine((m) => m % 30 === 0, {
    message: 'minutes muss ein Vielfaches von 30 sein',
  }),
  datum: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'datum muss YYYY-MM-DD sein'),
  grund: z.string().max(200).optional(),
})

/** GET: Pauschal-Eintraege (optional ?employee_id=). Chef sieht alle. */
export async function GET(req: NextRequest) {
  const supabase = await createSupabaseServerClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) {
    return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 })
  }

  const employeeId = new URL(req.url).searchParams.get('employee_id')

  const { data, error: rpcError } = await supabase.rpc('pauschal_list', {
    p_employee_id: employeeId,
    p_from: null,
    p_to: null,
  })

  if (rpcError) {
    return NextResponse.json({ error: rpcError.message }, { status: 400 })
  }
  return NextResponse.json({ entries: data ?? [] })
}

/** POST: Pauschal-Eintrag anlegen (Manager/GF). Status pending bis Genehmigung. */
export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServerClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) {
    return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Ungültiger JSON-Body' }, { status: 400 })
  }

  const parsed = createSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const { employee_id, minutes, datum, grund } = parsed.data
  const { data, error: rpcError } = await supabase.rpc('pauschal_create', {
    p_employee_id: employee_id,
    p_minutes: minutes,
    p_datum: datum,
    p_grund: grund ?? '',
  })

  if (rpcError) {
    // RPC wirft bei fehlender Berechtigung (42501) oder Validierung (22023).
    return NextResponse.json({ error: rpcError.message }, { status: 403 })
  }
  return NextResponse.json({ entry: data }, { status: 201 })
}
