import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createSupabaseServiceClient } from '@/lib/supabase-server'

const bodySchema = z.object({
  employee_id: z.string().uuid(),
})

function verifyKioskToken(req: NextRequest): boolean {
  const expected = process.env.KIOSK_TOKEN
  if (!expected) return true
  const token = req.headers.get('x-kiosk-token')
  if (!token) return false
  if (token.length !== expected.length) return false
  let diff = 0
  for (let i = 0; i < token.length; i++) {
    diff |= token.charCodeAt(i) ^ expected.charCodeAt(i)
  }
  return diff === 0
}

export async function POST(req: NextRequest) {
  if (!verifyKioskToken(req)) {
    return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 })
  }

  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Ungültiger Body' }, { status: 400 })
  }

  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const service = createSupabaseServiceClient()

  const { data, error } = await service
    .from('employees')
    .update({ privacy_accepted_at: new Date().toISOString() })
    .eq('id', parsed.data.employee_id)
    .eq('is_active', true)
    .select('id, privacy_accepted_at')
    .single()

  if (error || !data) {
    return NextResponse.json({ error: 'Mitarbeiter nicht gefunden' }, { status: 404 })
  }

  return NextResponse.json({ privacy_accepted_at: data.privacy_accepted_at })
}
