import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createHmac, timingSafeEqual } from 'crypto'
import { createSupabaseServiceClient } from '@/lib/supabase-server'

const statusSchema = z.object({
  scrape_id: z.string().uuid(),
  progress_pages: z.number().int().min(0),
  total_pages: z.number().int().min(0),
  eta_seconds: z.number().int().min(0),
})

function verifyHmac(rawBody: string, signature: string | null, secret: string): boolean {
  if (!signature) return false
  const parts = signature.split('=')
  if (parts.length !== 2 || parts[0] !== 'sha256') return false

  const expected = createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex')
  const received = parts[1]
  if (expected.length !== received.length) return false

  return timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(received, 'hex'))
}

// POST /api/rebuy/status — Live-Fortschritt während des Scrapings
export async function POST(request: NextRequest) {
  try {
    const hmacSecret = process.env.REBUY_HMAC_SECRET
    const rawBody = await request.text()

    if (hmacSecret) {
      const sig = request.headers.get('x-rebuy-signature')
      if (!verifyHmac(rawBody, sig, hmacSecret)) {
        return NextResponse.json({ error: 'Ungültige Signatur' }, { status: 401 })
      }
    }

    let parsedBody: unknown
    try {
      parsedBody = JSON.parse(rawBody)
    } catch {
      return NextResponse.json({ error: 'Ungültiges JSON' }, { status: 400 })
    }

    const result = statusSchema.safeParse(parsedBody)
    if (!result.success) {
      return NextResponse.json({ error: result.error.flatten() }, { status: 400 })
    }

    const { scrape_id, progress_pages, total_pages, eta_seconds } = result.data

    const supabase = createSupabaseServiceClient()

    const { error } = await supabase
      .from('rebuy_scrapes')
      .update({ progress_pages, total_pages, eta_seconds, status: 'running' })
      .eq('id', scrape_id)

    if (error) {
      console.error('[POST /api/rebuy/status] DB error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[POST /api/rebuy/status]', err)
    return NextResponse.json({ error: 'Interner Serverfehler' }, { status: 500 })
  }
}
