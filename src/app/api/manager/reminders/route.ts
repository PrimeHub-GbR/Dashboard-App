import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { requireAdmin, requireAdminOrManager } from '../_auth'

const recurrenceEnum = z.enum(['monthly', 'quarterly', 'biweekly', 'yearly', 'once'])

const createReminderSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional().default(''),
  next_due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Ungültiges Datum (YYYY-MM-DD)'),
  recurrence: recurrenceEnum,
  remind_days_before: z.coerce.number().int().min(0).max(365),
  recipient_ids: z.array(z.string().uuid()).min(1, 'Mindestens ein Empfänger'),
})

export async function GET() {
  // GF sieht alle Termine, Manager nur die eigenen (RPC filtert serverseitig).
  const auth = await requireAdminOrManager()
  if (!auth) return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 })

  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase.rpc('gf_list_reminders')

  if (error) return NextResponse.json({ error: 'Datenbankfehler' }, { status: 500 })
  return NextResponse.json({ reminders: data ?? [] })
}

export async function POST(req: NextRequest) {
  const user = await requireAdmin()
  if (!user) return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 })

  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Ungültiger JSON-Body' }, { status: 400 })
  }

  const parsed = createReminderSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase.rpc('gf_add_reminder', {
    p_title: parsed.data.title,
    p_description: parsed.data.description,
    p_next_due_date: parsed.data.next_due_date,
    p_recurrence: parsed.data.recurrence,
    p_remind_days_before: parsed.data.remind_days_before,
    p_recipient_ids: parsed.data.recipient_ids,
  })

  if (error) return NextResponse.json({ error: 'Fehler beim Erstellen' }, { status: 500 })
  return NextResponse.json({ id: data }, { status: 201 })
}
