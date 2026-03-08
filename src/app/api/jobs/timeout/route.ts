import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServiceClient } from '@/lib/supabase-server'

const JOB_TIMEOUT_MINUTES = 10

export async function GET(request: NextRequest) {
  // Protect endpoint: only Vercel Cron (via CRON_SECRET) may call this
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createSupabaseServiceClient()

  const cutoff = new Date(Date.now() - JOB_TIMEOUT_MINUTES * 60 * 1000).toISOString()

  const { data, error } = await supabase
    .from('jobs')
    .update({
      status: 'timeout',
      error_message: `Job wurde nach ${JOB_TIMEOUT_MINUTES} Minuten automatisch abgebrochen.`,
    })
    .in('status', ['pending', 'running'])
    .lt('created_at', cutoff)
    .select('id')

  if (error) {
    console.error('Timeout cron error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const count = data?.length ?? 0
  console.log(`Timeout cron: ${count} job(s) marked as timeout`)
  return NextResponse.json({ ok: true, timedOut: count })
}
