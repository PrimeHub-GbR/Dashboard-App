import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createSupabaseServiceClient } from '@/lib/supabase-server'
import { requireChefUser } from '@/lib/kommunikation-server'

const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Status-Callback von N8N nach der Meta-Einreichung.
const patchSchema = z.object({
  status: z.string().min(1),
  meta_template_id: z.string().optional().nullable(),
  status_detail: z.string().optional().nullable(),
})

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  if (!uuidRegex.test(id)) {
    return NextResponse.json({ error: 'Ungültige ID' }, { status: 400 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Ungültiger JSON-Body' }, { status: 400 })
  }
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Ungültige Daten' }, { status: 400 })
  }

  const service = createSupabaseServiceClient()
  const update: Record<string, unknown> = { status: parsed.data.status.toUpperCase() }
  if (parsed.data.meta_template_id) update.meta_template_id = parsed.data.meta_template_id
  if (parsed.data.status_detail !== undefined) update.status_detail = parsed.data.status_detail

  const { error } = await service.from('whatsapp_templates').update(update).eq('id', id)
  if (error) return NextResponse.json({ error: 'Aktualisierung fehlgeschlagen' }, { status: 500 })
  return NextResponse.json({ success: true })
}

// Vorlage loeschen (lokal + bei Meta via N8N).
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireChefUser()
  if (!user) return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 })

  const { id } = await params
  if (!uuidRegex.test(id)) {
    return NextResponse.json({ error: 'Ungültige ID' }, { status: 400 })
  }

  const service = createSupabaseServiceClient()
  const { data: row } = await service
    .from('whatsapp_templates')
    .select('id, name, status')
    .eq('id', id)
    .single()

  if (!row) return NextResponse.json({ error: 'Vorlage nicht gefunden' }, { status: 404 })

  // Bei Meta loeschen (nur wenn sie dort jemals angelegt wurde).
  const webhookUrl = process.env.N8N_WHATSAPP_TEMPLATE_WEBHOOK_URL
  if (webhookUrl && row.status !== 'LOCAL_PENDING' && row.status !== 'ERROR') {
    try {
      await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete', name: row.name }),
      })
    } catch {
      // Meta-Loeschung best-effort — lokal trotzdem entfernen.
    }
  }

  const { error } = await service.from('whatsapp_templates').delete().eq('id', id)
  if (error) return NextResponse.json({ error: 'Löschen fehlgeschlagen' }, { status: 500 })
  return NextResponse.json({ success: true })
}
