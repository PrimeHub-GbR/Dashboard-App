import { NextResponse } from 'next/server'
import { createSupabaseServiceClient } from '@/lib/supabase-server'
import { findOrderFiles } from '@/lib/google-drive'

async function checkSupabase(): Promise<boolean> {
  try {
    const supabase = createSupabaseServiceClient()
    const { error } = await supabase.from('orders').select('id').limit(1).single()
    // PGRST116 = no rows found — that's fine, still connected
    return !error || error.code === 'PGRST116'
  } catch {
    return false
  }
}

async function checkN8n(): Promise<boolean> {
  try {
    const base = process.env.N8N_BASE_URL
    const key = process.env.N8N_API_KEY
    if (!base || !key) return false
    const res = await fetch(`${base}/api/v1/workflows?limit=1`, {
      headers: { 'X-N8N-API-KEY': key },
      signal: AbortSignal.timeout(5000),
    })
    return res.ok
  } catch {
    return false
  }
}

async function checkGoogleDrive(): Promise<boolean> {
  try {
    await findOrderFiles()
    return true
  } catch {
    return false
  }
}

export async function GET() {
  const [supabase, n8n, googleDrive] = await Promise.all([
    checkSupabase(),
    checkN8n(),
    checkGoogleDrive(),
  ])

  return NextResponse.json({
    supabase,
    n8n,
    googleDrive,
    checkedAt: new Date().toISOString(),
  })
}
