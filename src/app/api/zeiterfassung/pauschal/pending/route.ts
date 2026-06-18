import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'

// Offene (+ 14-Tage-Historie) Pauschal-Genehmigungen fuer den eingeloggten GF.
// Quelle: RPC get_chef_pauschal_notifications (gated auf is_gf()). Liefert nur
// Eintraege, bei denen DIESER GF benoetigter Genehmiger ist.
export async function GET() {
  const supabase = await createSupabaseServerClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) {
    return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 })
  }

  const { data, error: rpcError } = await supabase.rpc(
    'get_chef_pauschal_notifications',
  )
  if (rpcError) {
    return NextResponse.json({ error: rpcError.message }, { status: 400 })
  }

  const entries = data ?? []
  const open = entries.filter((e: { decided: boolean }) => !e.decided).length
  return NextResponse.json({ entries, open })
}
