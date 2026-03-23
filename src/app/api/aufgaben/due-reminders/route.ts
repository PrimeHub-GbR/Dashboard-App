import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase-server'

// GET /api/aufgaben/due-reminders
// Gibt alle Tasks zurück, bei denen reminder_at <= NOW() und reminder_sent = false
// Wird von N8N täglich aufgerufen → N8N sendet dann E-Mails und markiert reminder_sent=true
export async function GET(req: NextRequest) {
  const user = await (async () => {
    const supabase = await createSupabaseServerClient()
    const { data: { user }, error } = await supabase.auth.getUser()
    if (error || !user) return null
    return user
  })()
  if (!user) return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 })

  const service = createSupabaseServiceClient()
  const { data, error } = await service
    .from('tasks')
    .select('id, title, description, due_date, reminder_email, reminder_at')
    .lte('reminder_at', new Date().toISOString())
    .eq('reminder_sent', false)
    .neq('status', 'done')

  if (error) return NextResponse.json({ error: 'Datenbankfehler' }, { status: 500 })

  return NextResponse.json({ reminders: data ?? [] })
}

// PATCH /api/aufgaben/due-reminders
// Markiert Tasks als reminder_sent=true (wird von N8N nach E-Mail-Versand aufgerufen)
export async function PATCH(req: NextRequest) {
  const user = await (async () => {
    const supabase = await createSupabaseServerClient()
    const { data: { user }, error } = await supabase.auth.getUser()
    if (error || !user) return null
    return user
  })()
  if (!user) return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 })

  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Ungültiger JSON-Body' }, { status: 400 })
  }

  const { task_ids } = body as { task_ids: string[] }
  if (!Array.isArray(task_ids) || task_ids.length === 0) {
    return NextResponse.json({ error: 'task_ids fehlt' }, { status: 400 })
  }

  const service = createSupabaseServiceClient()
  const { error } = await service
    .from('tasks')
    .update({ reminder_sent: true })
    .in('id', task_ids)

  if (error) return NextResponse.json({ error: 'Fehler beim Aktualisieren' }, { status: 500 })

  return NextResponse.json({ success: true, updated: task_ids.length })
}
