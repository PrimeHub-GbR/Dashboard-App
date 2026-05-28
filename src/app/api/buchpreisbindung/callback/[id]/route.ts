import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createHmac, timingSafeEqual } from 'crypto'
import { createSupabaseServiceClient } from '@/lib/supabase-server'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MAX_ARCHIVES_PER_SELLER = 3

const itemSchema = z.object({
  isbn13: z.string(),
  asin: z.string().optional(),
  title: z.string().optional(),
  amazon_price: z.number().nullable().optional(),
  vlb_price: z.number().nullable().optional(),
  amazon_url: z.string().optional(),
  is_compliant: z.boolean().nullable().optional(),
})

const callbackSchema = z.object({
  status: z.enum(['success', 'failed', 'timeout']),
  result_file_path: z.string().optional(),
  error_message: z.string().optional(),
  metadata: z.object({
    total_items: z.number().optional(),
    violations_count: z.number().optional(),
    proxy_bytes: z.number().optional(),
    pages_scraped: z.number().optional(),
    items: z.array(itemSchema).optional(),
  }).optional(),
})

function verifySignature(rawBody: string, signature: string | null, secret: string): boolean {
  if (!signature) return false
  const parts = signature.split('=')
  if (parts.length !== 2) return false
  const receivedHmac = parts[1]
  const expectedHmac = createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex')
  if (expectedHmac.length !== receivedHmac.length) return false
  try {
    return timingSafeEqual(Buffer.from(expectedHmac, 'hex'), Buffer.from(receivedHmac, 'hex'))
  } catch {
    return false
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: runId } = await params
    if (!UUID_RE.test(runId)) {
      return NextResponse.json({ error: 'Ungültige Run-ID' }, { status: 400 })
    }

    const rawBody = await request.text()
    const hmacSecret = process.env.N8N_HMAC_SECRET
    if (hmacSecret) {
      const sig = request.headers.get('x-n8n-signature')
      if (!verifySignature(rawBody, sig, hmacSecret)) {
        return NextResponse.json({ error: 'Ungültige Signatur' }, { status: 401 })
      }
    }

    let parsed: ReturnType<typeof callbackSchema.safeParse>
    try {
      parsed = callbackSchema.safeParse(JSON.parse(rawBody))
    } catch {
      return NextResponse.json({ error: 'Ungültiges JSON' }, { status: 400 })
    }

    if (!parsed.success) {
      return NextResponse.json({ error: 'Ungültiges Schema' }, { status: 400 })
    }

    const supabase = createSupabaseServiceClient()

    // Get run + seller info
    const { data: run } = await supabase
      .from('buchpreischeck_runs')
      .select('id, seller_id, amazon_seller_id, status')
      .eq('id', runId)
      .single()

    if (!run) {
      return NextResponse.json({ error: 'Run nicht gefunden' }, { status: 404 })
    }

    // Guard: ignore callbacks for already-terminal runs
    if (['success', 'failed', 'timeout'].includes(run.status)) {
      return NextResponse.json({ ok: true, note: 'Already terminal' })
    }

    const { status, result_file_path, error_message, metadata } = parsed.data
    const total_items = metadata?.total_items ?? null
    const violations_count = metadata?.violations_count ?? null
    const proxy_bytes = metadata?.proxy_bytes ?? null
    const pages_scraped = metadata?.pages_scraped ?? null
    const items = metadata?.items ?? []

    // Update run record
    await supabase
      .from('buchpreischeck_runs')
      .update({
        status,
        excel_file_path: result_file_path ?? null,
        error_message: error_message ?? null,
        total_items,
        violations_count,
        proxy_bytes,
        pages_scraped,
        completed_at: new Date().toISOString(),
      })
      .eq('id', runId)

    // Store items if success
    if (status === 'success' && items.length > 0) {
      const itemRows = items.map(item => ({
        run_id: runId,
        isbn13: item.isbn13,
        asin: item.asin ?? null,
        title: item.title ?? null,
        amazon_price: item.amazon_price ?? null,
        vlb_price: item.vlb_price ?? null,
        amazon_url: item.amazon_url ?? null,
        is_compliant: item.is_compliant ?? null,
      }))

      // Insert in batches of 500
      for (let i = 0; i < itemRows.length; i += 500) {
        await supabase.from('buchpreischeck_items').insert(itemRows.slice(i, i + 500))
      }
    }

    // Update seller last_run_at
    await supabase
      .from('buchpreischeck_sellers')
      .update({ last_run_at: new Date().toISOString() })
      .eq('id', run.seller_id)

    // Excel archive management: keep only last MAX_ARCHIVES_PER_SELLER per seller
    if (status === 'success' && result_file_path) {
      const { data: archives } = await supabase
        .from('buchpreischeck_runs')
        .select('id, excel_file_path, created_at')
        .eq('seller_id', run.seller_id)
        .eq('status', 'success')
        .not('excel_file_path', 'is', null)
        .order('created_at', { ascending: false })

      if (archives && archives.length > MAX_ARCHIVES_PER_SELLER) {
        const toDelete = archives.slice(MAX_ARCHIVES_PER_SELLER)
        for (const old of toDelete) {
          if (old.excel_file_path) {
            await supabase.storage.from('workflow-results').remove([old.excel_file_path])
          }
          await supabase
            .from('buchpreischeck_runs')
            .update({ excel_file_path: null })
            .eq('id', old.id)
        }
      }
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('POST /api/buchpreisbindung/callback/[id] error:', err)
    return NextResponse.json({ error: 'Interner Serverfehler' }, { status: 500 })
  }
}
