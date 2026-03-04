import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase-server'
import { rateLimit } from '@/lib/rate-limit'

const N8N_BASE_URL = process.env.N8N_BASE_URL
const N8N_API_KEY = process.env.N8N_API_KEY

const toggleSchema = z.object({
  active: z.boolean(),
})

const workflowIdSchema = z.string().regex(/^[a-zA-Z0-9_-]+$/, 'Ungültige Workflow-ID')

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ip = request.headers.get('x-forwarded-for') ?? 'unknown'
  if (!rateLimit(`toggle:${ip}`, 10, 60_000)) {
    return NextResponse.json({ error: 'Zu viele Anfragen' }, { status: 429 })
  }

  try {
    // 1. Auth check
    const supabase = await createSupabaseServerClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Nicht authentifiziert' }, { status: 401 })
    }

    // 2. Role check — Admin only
    const serviceClient = createSupabaseServiceClient()
    const { data: roleData, error: roleError } = await serviceClient
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .single()

    if (roleError || !roleData || roleData.role !== 'admin') {
      return NextResponse.json(
        { error: 'Nur Admins können Workflows aktivieren/deaktivieren' },
        { status: 403 }
      )
    }

    // 3. Validate body
    const body = await request.json()
    const parseResult = toggleSchema.safeParse(body)
    if (!parseResult.success) {
      return NextResponse.json({ error: 'Ungültiger Request-Body' }, { status: 400 })
    }
    const { active } = parseResult.data

    // 4. Validate env
    if (!N8N_BASE_URL || !N8N_API_KEY) {
      return NextResponse.json(
        { error: 'N8N_BASE_URL oder N8N_API_KEY nicht konfiguriert' },
        { status: 500 }
      )
    }

    // 5. Validate workflow ID
    const { id: rawId } = await params
    const idResult = workflowIdSchema.safeParse(rawId)
    if (!idResult.success) {
      return NextResponse.json({ error: 'Ungültige Workflow-ID' }, { status: 400 })
    }
    const id = idResult.data

    // 6. Call n8n API
    const action = active ? 'activate' : 'deactivate'
    const n8nRes = await fetch(`${N8N_BASE_URL}/api/v1/workflows/${id}/${action}`, {
      method: 'POST',
      headers: { 'X-N8N-API-KEY': N8N_API_KEY },
    })

    if (!n8nRes.ok) {
      const errText = await n8nRes.text().catch(() => '')
      console.error(`n8n toggle error ${n8nRes.status}:`, errText)
      return NextResponse.json(
        { error: 'Workflow konnte nicht umgeschaltet werden' },
        { status: 502 }
      )
    }

    return NextResponse.json({ success: true, active })
  } catch (err) {
    console.error('PATCH /api/n8n/workflows/[id]/toggle error:', err)
    return NextResponse.json({ error: 'Interner Serverfehler' }, { status: 500 })
  }
}
