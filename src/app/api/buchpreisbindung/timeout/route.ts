import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServiceClient } from '@/lib/supabase-server'
import { sweepStaleRuns } from '@/lib/buchpreisbindung-runs'

export async function GET(request: NextRequest) {
  // Nur Vercel Cron (via CRON_SECRET) darf diesen Endpunkt aufrufen.
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createSupabaseServiceClient()
  const timedOut = await sweepStaleRuns(supabase)

  console.log(`Buchpreisbindung timeout cron: ${timedOut} run(s) marked as timeout`)
  return NextResponse.json({ ok: true, timedOut })
}
