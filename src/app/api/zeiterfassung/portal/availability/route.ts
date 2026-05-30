import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createSupabaseServiceClient } from '@/lib/supabase-server'

// GET ?employee_id=<uuid>&from=<YYYY-MM-DD> — listet abgegebene Verfügbarkeiten ab Montag <from>
const querySchema = z.object({
  employee_id: z.string().uuid(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
})

// POST { employee_id, week_start: YYYY-MM-DD (Montag), availability, note? }
const daySchema = z
  .object({
    from: z.string().regex(/^\d{2}:\d{2}$/),
    to: z.string().regex(/^\d{2}:\d{2}$/),
  })
  .nullable()

const bodySchema = z.object({
  employee_id: z.string().uuid(),
  week_start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  availability: z.object({
    mon: daySchema,
    tue: daySchema,
    wed: daySchema,
    thu: daySchema,
    fri: daySchema,
    sat: daySchema,
    sun: daySchema,
  }),
  note: z.string().max(500).optional().nullable(),
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

function isMonday(date: string): boolean {
  // YYYY-MM-DD → muss Montag sein (Europe/Berlin-tolerant: lokal interpretiert)
  const d = new Date(date + 'T00:00:00')
  return d.getDay() === 1
}

export async function GET(req: NextRequest) {
  if (!verifyKioskToken(req)) {
    return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 })
  }

  const params = Object.fromEntries(req.nextUrl.searchParams)
  const parsed = querySchema.safeParse(params)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const { employee_id, from } = parsed.data
  const service = createSupabaseServiceClient()

  const { data, error } = await service
    .from('employee_schedule_requests')
    .select('id, week_start, availability, note, status, created_at, updated_at')
    .eq('employee_id', employee_id)
    .gte('week_start', from)
    .order('week_start', { ascending: true })
    .limit(8)

  if (error) {
    return NextResponse.json({ error: 'Datenbankfehler' }, { status: 500 })
  }

  return NextResponse.json({ submissions: data ?? [] })
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

  const { employee_id, week_start, availability, note } = parsed.data

  if (!isMonday(week_start)) {
    return NextResponse.json({ error: 'week_start muss ein Montag sein' }, { status: 400 })
  }

  const service = createSupabaseServiceClient()

  // Existenz-Check des Mitarbeiters (aktiv)
  const { data: emp, error: empError } = await service
    .from('employees')
    .select('id')
    .eq('id', employee_id)
    .eq('is_active', true)
    .single()

  if (empError || !emp) {
    return NextResponse.json({ error: 'Mitarbeiter nicht gefunden' }, { status: 404 })
  }

  // UPSERT (eindeutiger Index auf employee_id + week_start aus Mig. 036)
  const { data, error } = await service
    .from('employee_schedule_requests')
    .upsert(
      {
        employee_id,
        week_start,
        availability,
        note: note ?? null,
      },
      { onConflict: 'employee_id,week_start' }
    )
    .select('id, week_start, availability, note, status, created_at, updated_at')
    .single()

  if (error) {
    return NextResponse.json({ error: 'Speichern fehlgeschlagen' }, { status: 500 })
  }

  return NextResponse.json({ submission: data })
}
