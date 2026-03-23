import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'

export interface DeliveryAnnouncement {
  id: string
  carrier: string         // 'DPD' | 'UPS' | 'DHL' | 'Hermes' | 'GLS' | etc.
  type: string            // 'Paket' | 'Palette' | 'Brief' | 'Expresslieferung'
  window_start: string    // 'HH:MM' z.B. '09:00'
  window_end: string      // 'HH:MM' z.B. '12:00'
  status: 'expected' | 'arrived' | 'missed'
  note?: string
  tracking_number?: string
  date: string            // ISO date 'YYYY-MM-DD'
}

export async function GET() {
  const supabase = await createSupabaseServerClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) {
    return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 })
  }

  // Placeholder — wird via N8N befüllt (Email-Extraktion)
  // Später: SELECT * FROM delivery_announcements WHERE date = today ORDER BY window_start
  return NextResponse.json({ announcements: [] as DeliveryAnnouncement[] })
}

export async function PATCH(req: Request) {
  const supabase = await createSupabaseServerClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) {
    return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 })
  }

  // Placeholder für Status-Update (expected → arrived)
  const body = await req.json() as { id: string; status: 'arrived' | 'missed' }
  // TODO: implement when DB table exists
  return NextResponse.json({ ok: true, id: body.id })
}
