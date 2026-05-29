import { NextRequest, NextResponse } from 'next/server'
import { createHmac } from 'crypto'
import { createSupabaseServiceClient } from '@/lib/supabase-server'
import { calculateNextRunAt } from '@/lib/buchpreisbindung-schedule'
import { sweepStaleRuns } from '@/lib/buchpreisbindung-runs'

// VLB erlaubt nur 2 parallele Login-Tokens. Jeder Lauf macht einen VLB-Login.
// Deshalb darf nie mehr als dieses Limit gleichzeitig laufen.
const MAX_CONCURRENT_RUNS = 2

function signPayload(body: string, secret: string): string {
  return 'sha256=' + createHmac('sha256', secret).update(body, 'utf8').digest('hex')
}

export async function GET(request: NextRequest) {
  // Protect with CRON_SECRET
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createSupabaseServiceClient()
  const n8nBaseUrl = process.env.N8N_WEBHOOK_BASE_URL
  const hmacSecret = process.env.N8N_HMAC_SECRET

  // Hängende Läufe (Workflow abgestürzt → kein Callback) zuerst aufräumen, damit sie
  // weder den Concurrency-Guard blockieren noch endlos auf 'running' stehen bleiben.
  await sweepStaleRuns(supabase)

  // 2-Token-Guard: niemals mehr als MAX_CONCURRENT_RUNS gleichzeitig (sonst VLB-Login-Fehler).
  // Stuck-Läufe ohne Callback (>15 min) ignorieren, damit der Scheduler nicht dauerhaft blockiert.
  const fifteenMinAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString()
  const { count: runningCount } = await supabase
    .from('buchpreischeck_runs')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'running')
    .gte('started_at', fifteenMinAgo)

  if ((runningCount ?? 0) >= MAX_CONCURRENT_RUNS) {
    return NextResponse.json({ triggered: 0, reason: 'VLB-Token ausgelastet' })
  }

  // Pro Tick maximal 1 Händler triggern → verteilt gleichzeitig fällige Händler über das 10-min-Raster
  // und hält das 2-Token-Limit zuverlässig ein.
  const { data: sellers, error } = await supabase
    .from('buchpreischeck_sellers')
    .select('id, amazon_seller_id, schedule_mode, run_time, interval_minutes, active_weekdays, max_pages')
    .eq('is_active', true)
    .lte('next_run_at', new Date().toISOString())
    .order('next_run_at', { ascending: true })
    .limit(1)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (!sellers || sellers.length === 0) {
    return NextResponse.json({ triggered: 0 })
  }

  const triggered: string[] = []
  const failed: string[] = []

  for (const seller of sellers) {
    // Create run record
    const { data: run } = await supabase
      .from('buchpreischeck_runs')
      .insert({
        seller_id: seller.id,
        amazon_seller_id: seller.amazon_seller_id,
        status: 'running',
        triggered_by: 'scheduler',
      })
      .select('id')
      .single()

    if (!run) {
      failed.push(seller.amazon_seller_id)
      continue
    }

    // Update next_run_at before triggering (prevents double-trigger if N8N is slow)
    const nextRun = calculateNextRunAt({
      schedule_mode: seller.schedule_mode,
      run_time: seller.run_time,
      interval_minutes: seller.interval_minutes,
      active_weekdays: seller.active_weekdays,
    })
    await supabase
      .from('buchpreischeck_sellers')
      .update({ next_run_at: nextRun.toISOString() })
      .eq('id', seller.id)

    if (!n8nBaseUrl) {
      await supabase
        .from('buchpreischeck_runs')
        .update({ status: 'failed', error_message: 'N8N nicht konfiguriert' })
        .eq('id', run.id)
      failed.push(seller.amazon_seller_id)
      continue
    }

    const callbackUrl = `${request.nextUrl.origin}/api/buchpreisbindung/callback/${run.id}`
    const outboundBody = JSON.stringify({
      run_id: run.id,
      seller_id: seller.amazon_seller_id,
      callback_url: callbackUrl,
      max_pages: seller.max_pages ?? null,
    })

    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (hmacSecret) {
      headers['x-dashboard-signature'] = signPayload(outboundBody, hmacSecret)
    }

    try {
      const resp = await fetch(`${n8nBaseUrl}/buchpreisbindung-check`, {
        method: 'POST',
        headers,
        body: outboundBody,
        signal: AbortSignal.timeout(10000),
      })

      if (!resp.ok) {
        const errText = await resp.text().catch(() => '')
        await supabase
          .from('buchpreischeck_runs')
          .update({ status: 'failed', error_message: `N8N (${resp.status}): ${errText}` })
          .eq('id', run.id)
        failed.push(seller.amazon_seller_id)
      } else {
        triggered.push(seller.amazon_seller_id)
      }
    } catch (fetchErr) {
      const msg = fetchErr instanceof Error ? fetchErr.message : 'Netzwerkfehler'
      await supabase
        .from('buchpreischeck_runs')
        .update({ status: 'failed', error_message: `N8N nicht erreichbar: ${msg}` })
        .eq('id', run.id)
      failed.push(seller.amazon_seller_id)
    }
  }

  return NextResponse.json({ triggered: triggered.length, triggeredSellers: triggered, failedSellers: failed })
}
