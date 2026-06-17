import { NextResponse } from 'next/server'
import { requireChefUser } from '@/lib/kommunikation-server'
import { createSupabaseServiceClient } from '@/lib/supabase-server'

const META_VERSION = 'v21.0'

// Gleicht den Vorlagen-Status direkt mit der Meta Graph API ab (kein N8N-Umweg).
// Der frühere N8N-Sync lief unzuverlässig, sodass Vorlagen lokal auf PENDING
// hängen blieben, obwohl Meta sie längst genehmigt hatte.
export async function POST() {
  const user = await requireChefUser()
  if (!user) return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 })

  const token = process.env.WHATSAPP_ACCESS_TOKEN
  const waba = process.env.WHATSAPP_WABA_ID
  if (!token || !waba) {
    return NextResponse.json(
      { error: 'WhatsApp-Zugang nicht konfiguriert (Token/WABA fehlt)' },
      { status: 503 }
    )
  }

  // Alle Vorlagen der WABA laden (Name + Status + Kategorie + Ablehnungsgrund).
  let metaTemplates: Array<{ name: string; status: string; id?: string; category?: string; rejected_reason?: string }> = []
  try {
    const url =
      `https://graph.facebook.com/${META_VERSION}/${waba}/message_templates` +
      `?fields=name,status,category,id,rejected_reason&limit=200&access_token=${encodeURIComponent(token)}`
    const res = await fetch(url)
    const json = await res.json()
    if (!res.ok || json.error) {
      const msg = json?.error?.message ?? `HTTP ${res.status}`
      return NextResponse.json({ error: `Meta-Fehler: ${msg}` }, { status: 502 })
    }
    metaTemplates = json.data ?? []
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unbekannter Fehler'
    return NextResponse.json({ error: `Meta nicht erreichbar: ${msg}` }, { status: 502 })
  }

  const service = createSupabaseServiceClient()
  let updated = 0

  for (const t of metaTemplates) {
    const update: Record<string, unknown> = { status: (t.status || '').toUpperCase() }
    if (t.id) update.meta_template_id = t.id
    if (t.rejected_reason && t.rejected_reason !== 'NONE') {
      update.status_detail = t.rejected_reason
    }
    const { error } = await service
      .from('whatsapp_templates')
      .update(update)
      .eq('name', t.name)
    if (!error) updated++
  }

  return NextResponse.json({ success: true, updated })
}
