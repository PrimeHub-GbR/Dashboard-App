import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createHmac, timingSafeEqual } from 'crypto'
import { createSupabaseServiceClient } from '@/lib/supabase-server'

const notifySchema = z.object({
  scrape_id: z.string().uuid(),
  scrape_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  file_path: z.string().min(1),
  row_count: z.number().int().min(0),
  status: z.enum(['success', 'failed']),
  error_message: z.string().optional(),
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

// POST /api/rebuy/notify — Scraper-Container meldet fertiges Ergebnis
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

    const result = notifySchema.safeParse(parsedBody)
    if (!result.success) {
      return NextResponse.json({ error: result.error.flatten() }, { status: 400 })
    }

    const { scrape_id, scrape_date, file_path, row_count, status, error_message } = result.data

    const supabase = createSupabaseServiceClient()

    const { error } = await supabase
      .from('rebuy_scrapes')
      .update({
        scrape_date,
        file_path: status === 'success' ? file_path : null,
        status,
        row_count: status === 'success' ? row_count : null,
        error_message: error_message ?? null,
        finished_at: new Date().toISOString(),
        progress_pages: null,
        total_pages: null,
        eta_seconds: null,
      })
      .eq('id', scrape_id)

    if (error) {
      console.error('[POST /api/rebuy/notify] DB error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[POST /api/rebuy/notify]', err)
    return NextResponse.json({ error: 'Interner Serverfehler' }, { status: 500 })
  }
}
