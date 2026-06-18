import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createSupabaseServerClient } from '@/lib/supabase-server'

const querySchema = z.object({
  employee_id: z.string().uuid(),
  year: z.coerce.number().int().min(2020).max(2100),
  month: z.coerce.number().int().min(1).max(12),
})

/**
 * "Nicht erschienen"-Tage EINES Mitarbeiters in einem Monat:
 * verplant (Schicht ODER eingefrorene Verfuegbarkeit), aber nicht eingestempelt
 * und nicht abwesend. Liefert die ymd-Tage + Planzeiten.
 *
 * Laeuft ueber die SECURITY-DEFINER-RPC get_employee_no_shows (Migration 106),
 * die selbst per is_chef() gated ist — deshalb der user-scoped Server-Client
 * (nicht der Service-Client), damit auth.uid() in der RPC aufloest.
 */
export async function GET(req: NextRequest) {
  const supabase = await createSupabaseServerClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) {
    return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 })
  }

  const parsed = querySchema.safeParse(Object.fromEntries(req.nextUrl.searchParams))
  if (!parsed.success) {
    return NextResponse.json({ error: 'employee_id, year und month erforderlich' }, { status: 400 })
  }

  const { employee_id, year, month } = parsed.data
  const from = `${year}-${String(month).padStart(2, '0')}-01`
  const lastDay = new Date(year, month, 0).getDate()
  const to = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`

  const { data, error: rpcError } = await supabase.rpc('get_employee_no_shows', {
    p_employee_id: employee_id,
    p_from: from,
    p_to: to,
  })

  if (rpcError) {
    return NextResponse.json({ error: 'Datenbankfehler' }, { status: 500 })
  }

  type NoShowRow = { day: string; planned_from: string | null; planned_to: string | null; source: string }
  const noShows = (data as NoShowRow[] | null) ?? []
  return NextResponse.json({ noShows })
}
