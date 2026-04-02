import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createSupabaseServiceClient } from '@/lib/supabase-server'

const callbackSchema = z.object({
  status: z.enum(['sent', 'failed']),
  error_message: z.string().optional(),
})

const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: logId } = await params

    if (!uuidRegex.test(logId)) {
      return NextResponse.json({ error: 'Ungültige Log-ID' }, { status: 400 })
    }

    let body: unknown
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: 'Ungültiger JSON-Body' }, { status: 400 })
    }

    const parsed = callbackSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Ungültige Callback-Daten', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const { status, error_message } = parsed.data
    const service = createSupabaseServiceClient()

    // Prüfen ob der Log-Eintrag existiert
    const { data: existing, error: fetchError } = await service
      .from('message_logs')
      .select('id, status')
      .eq('id', logId)
      .single()

    if (fetchError || !existing) {
      return NextResponse.json({ error: 'Log-Eintrag nicht gefunden' }, { status: 404 })
    }

    // Bereits in terminalem Zustand — idempotent ignorieren
    if (existing.status === 'sent' || existing.status === 'failed') {
      return NextResponse.json({ success: true, ignored: true }, { status: 200 })
    }

    const updateData: Record<string, unknown> = { status }
    if (error_message) updateData.error_message = error_message

    const { error: updateError } = await service
      .from('message_logs')
      .update(updateData)
      .eq('id', logId)

    if (updateError) {
      return NextResponse.json({ error: 'Aktualisierung fehlgeschlagen' }, { status: 500 })
    }

    return NextResponse.json({ success: true }, { status: 200 })
  } catch (err) {
    console.error('PATCH /api/kommunikation/[id] error:', err)
    return NextResponse.json({ error: 'Interner Serverfehler' }, { status: 500 })
  }
}
