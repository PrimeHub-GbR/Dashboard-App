import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createHmac, timingSafeEqual } from 'crypto'
import { createSupabaseServiceClient } from '@/lib/supabase-server'

const callbackBodySchema = z.object({
  result_file_path: z.string().min(1),
})

function verifyHmacSignature(
  rawBody: string,
  signature: string | null,
  secret: string
): boolean {
  if (!signature) return false
  const parts = signature.split('=')
  if (parts.length !== 2 || parts[0] !== 'sha256') return false

  const expectedHmac = createHmac('sha256', secret)
    .update(rawBody, 'utf8')
    .digest('hex')
  const receivedHmac = parts[1]

  if (expectedHmac.length !== receivedHmac.length) return false
  return timingSafeEqual(
    Buffer.from(expectedHmac, 'hex'),
    Buffer.from(receivedHmac, 'hex')
  )
}

// POST /api/lieferantenlisten/[id]/callback — N8N writes back the filtered result file
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: entryId } = await params

    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(entryId)) {
      return NextResponse.json({ error: 'Ungültige ID' }, { status: 400 })
    }

    // Verify HMAC signature (optional — skipped if N8N_HMAC_SECRET is not set)
    const hmacSecret = process.env.N8N_HMAC_SECRET
    const rawBody = await request.text()

    if (hmacSecret) {
      const signature = request.headers.get('x-n8n-signature')
      if (!verifyHmacSignature(rawBody, signature, hmacSecret)) {
        return NextResponse.json({ error: 'Ungültige Signatur' }, { status: 401 })
      }
    }

    let parsedBody: unknown
    try {
      parsedBody = JSON.parse(rawBody)
    } catch {
      return NextResponse.json({ error: 'Ungültiges JSON' }, { status: 400 })
    }

    const parseResult = callbackBodySchema.safeParse(parsedBody)
    if (!parseResult.success) {
      return NextResponse.json(
        { error: 'Ungültige Callback-Daten', details: parseResult.error.flatten() },
        { status: 400 }
      )
    }

    const { result_file_path } = parseResult.data

    const supabase = createSupabaseServiceClient()

    // Verify entry exists before updating
    const { data: existing } = await supabase
      .from('lieferantenlisten')
      .select('id')
      .eq('id', entryId)
      .single()

    if (!existing) {
      return NextResponse.json({ error: 'Eintrag nicht gefunden' }, { status: 404 })
    }

    const { error: updateError } = await supabase
      .from('lieferantenlisten')
      .update({ result_file_path })
      .eq('id', entryId)

    if (updateError) {
      console.error('Lieferantenliste update failed:', updateError)
      return NextResponse.json(
        { error: 'Eintrag konnte nicht aktualisiert werden' },
        { status: 500 }
      )
    }

    return NextResponse.json({ ok: true }, { status: 200 })
  } catch (err) {
    console.error('POST /api/lieferantenlisten/[id]/callback error:', err)
    return NextResponse.json({ error: 'Interner Serverfehler' }, { status: 500 })
  }
}
