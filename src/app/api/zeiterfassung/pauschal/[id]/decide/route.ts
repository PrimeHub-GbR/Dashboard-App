import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createSupabaseServerClient } from '@/lib/supabase-server'

// GF entscheidet ueber einen Pauschal-Eintrag: genehmigen oder ablehnen.
// approve -> pauschal_approve (status approved sobald ALLE GF zugestimmt haben)
// reject  -> pauschal_reject  (sofort unwirksam)
// Beide RPCs gaten auf is_gf() via auth.uid() -> User-Session-Client.

const schema = z.object({
  approve: z.boolean(),
  reason: z.string().max(300).optional(),
})

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  if (!z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ error: 'Ungültige ID' }, { status: 400 })
  }

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
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const { approve, reason } = parsed.data
  const { data, error: rpcError } = approve
    ? await supabase.rpc('pauschal_approve', { p_entry_id: id })
    : await supabase.rpc('pauschal_reject', { p_entry_id: id, p_reason: reason ?? null })

  if (rpcError) {
    return NextResponse.json({ error: rpcError.message }, { status: 403 })
  }
  return NextResponse.json({ entry: data })
}
