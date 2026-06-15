import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createSupabaseServiceClient } from '@/lib/supabase-server'

// Callback von N8N: die aktuelle Template-Liste von Meta. Wir gleichen den
// Status pro Name ab. Kein User-Auth (interner N8N-Callback wie bei /[id]).
const syncSchema = z.object({
  templates: z.array(
    z.object({
      name: z.string(),
      status: z.string(),
      id: z.string().optional().nullable(),
      category: z.string().optional().nullable(),
      // Ablehnungsgrund / Qualitaet, falls vorhanden.
      reason: z.string().optional().nullable(),
    })
  ),
})

export async function POST(req: NextRequest) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Ungültiger JSON-Body' }, { status: 400 })
  }

  const parsed = syncSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Ungültige Daten' }, { status: 400 })
  }

  const service = createSupabaseServiceClient()
  let updated = 0

  for (const t of parsed.data.templates) {
    const update: Record<string, unknown> = { status: (t.status || '').toUpperCase() }
    if (t.id) update.meta_template_id = t.id
    if (t.reason) update.status_detail = t.reason
    const { error } = await service
      .from('whatsapp_templates')
      .update(update)
      .eq('name', t.name)
    if (!error) updated++
  }

  return NextResponse.json({ success: true, updated })
}
