import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createHmac, timingSafeEqual } from 'crypto'
import { createSupabaseServiceClient } from '@/lib/supabase-server'

const callbackBodySchema = z.object({
  status: z.enum(['success', 'failed', 'timeout']),
  result_file_path: z.string().optional(),
  error_message: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
})

function verifyHmacSignature(
  rawBody: string,
  signature: string | null,
  secret: string
): boolean {
  if (!signature) return false

  // Expect format: sha256=<hex>
  const parts = signature.split('=')
  if (parts.length !== 2 || parts[0] !== 'sha256') return false

  const expectedHmac = createHmac('sha256', secret)
    .update(rawBody, 'utf8')
    .digest('hex')

  const receivedHmac = parts[1]

  // Timing-safe comparison to prevent timing attacks
  if (expectedHmac.length !== receivedHmac.length) return false

  return timingSafeEqual(
    Buffer.from(expectedHmac, 'hex'),
    Buffer.from(receivedHmac, 'hex')
  )
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: jobId } = await params

    // 1. Validate job ID format (UUID)
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(jobId)) {
      return NextResponse.json({ error: 'Ungültige Job-ID' }, { status: 400 })
    }

    // 2. Verify HMAC signature
    const hmacSecret = process.env.N8N_HMAC_SECRET
    if (!hmacSecret) {
      console.error('N8N_HMAC_SECRET is not configured')
      return NextResponse.json(
        { error: 'Server-Konfigurationsfehler' },
        { status: 500 }
      )
    }

    const rawBody = await request.text()
    const signature = request.headers.get('x-n8n-signature')

    if (!verifyHmacSignature(rawBody, signature, hmacSecret)) {
      return NextResponse.json(
        { error: 'Ungültige Signatur' },
        { status: 401 }
      )
    }

    // 3. Parse and validate body with Zod
    let parsedBody: unknown
    try {
      parsedBody = JSON.parse(rawBody)
    } catch {
      return NextResponse.json(
        { error: 'Ungültiges JSON' },
        { status: 400 }
      )
    }

    const parseResult = callbackBodySchema.safeParse(parsedBody)
    if (!parseResult.success) {
      return NextResponse.json(
        { error: 'Ungültige Callback-Daten', details: parseResult.error.flatten() },
        { status: 400 }
      )
    }

    const { status, result_file_path, error_message, metadata } = parseResult.data

    // 4. Update job in DB via service role client
    const supabase = createSupabaseServiceClient()

    // 4a. Guard: reject callback if job is already in a terminal state
    const { data: existingJob } = await supabase
      .from('jobs')
      .select('status')
      .eq('id', jobId)
      .single()

    const terminalStatuses = ['success', 'failed', 'timeout']
    if (existingJob && terminalStatuses.includes(existingJob.status)) {
      return NextResponse.json({ ok: true, ignored: true }, { status: 200 })
    }

    const updateData: Record<string, unknown> = {
      status,
    }

    if (result_file_path) {
      updateData.result_file_url = result_file_path
    }

    if (error_message) {
      updateData.error_message = error_message
    }

    if (metadata) {
      updateData.metadata = metadata
    }

    const { error: updateError } = await supabase
      .from('jobs')
      .update(updateData)
      .eq('id', jobId)

    if (updateError) {
      console.error('Job update failed:', updateError)
      return NextResponse.json(
        { error: 'Job konnte nicht aktualisiert werden' },
        { status: 500 }
      )
    }

    return NextResponse.json({ ok: true }, { status: 200 })
  } catch (err) {
    console.error('POST /api/jobs/[id]/callback error:', err)
    return NextResponse.json(
      { error: 'Interner Serverfehler' },
      { status: 500 }
    )
  }
}
