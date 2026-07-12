import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { requireAdmin } from '../_auth'

/**
 * Wählbare Frist-Empfänger (aktive GF + Manager) fürs Termin-Formular.
 * GF-only — nur die Geschäftsführung verwaltet Termine.
 */
export async function GET() {
  const user = await requireAdmin()
  if (!user) return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 })

  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase.rpc('get_reminder_recipient_options')

  if (error) return NextResponse.json({ error: 'Datenbankfehler' }, { status: 500 })
  return NextResponse.json({ options: data ?? [] })
}
