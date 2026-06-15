import { NextResponse } from 'next/server'
import { requireChefUser } from '@/lib/kommunikation-server'

// Stoesst eine Status-Synchronisation mit Meta an (via N8N). Der eigentliche
// Abgleich kommt asynchron zurueck nach /api/kommunikation/templates/sync.
export async function POST() {
  const user = await requireChefUser()
  if (!user) return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 })

  const webhookUrl = process.env.N8N_WHATSAPP_TEMPLATE_WEBHOOK_URL
  if (!webhookUrl) {
    return NextResponse.json({ error: 'Template-Workflow nicht konfiguriert' }, { status: 503 })
  }

  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'sync' }),
    })
    if (!res.ok) {
      return NextResponse.json({ error: `N8N-Fehler: HTTP ${res.status}` }, { status: 502 })
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unbekannter Fehler'
    return NextResponse.json({ error: `N8N nicht erreichbar: ${msg}` }, { status: 502 })
  }

  return NextResponse.json({ success: true })
}
