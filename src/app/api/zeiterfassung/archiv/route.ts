import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createSupabaseServerClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

// Die Archiv-RPCs sind is_chef()-gated (Migrationen 112–114). Sie laufen daher
// ueber den AUTHENTIFIZIERTEN Server-Client (User-JWT -> auth.uid()), NICHT ueber
// den Service-Client (der haette keine auth.uid() und is_chef() waere false).

const listSchema = z.object({ mode: z.literal('list') })
const reportSchema = z.object({
  mode: z.literal('report'),
  employee_id: z.string().uuid(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
})

async function assertManager() {
  const supabase = await createSupabaseServerClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return { supabase, ok: false as const }
  const { data } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)
    .single()
  const ok = data?.role === 'admin' || data?.role === 'manager'
  return { supabase, ok }
}

export async function GET(req: NextRequest) {
  const { supabase, ok } = await assertManager()
  if (!ok) {
    return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 })
  }

  const mode = req.nextUrl.searchParams.get('mode') ?? 'list'

  if (mode === 'list') {
    const parsed = listSchema.safeParse({ mode })
    if (!parsed.success) {
      return NextResponse.json({ error: 'Ungueltige Anfrage' }, { status: 400 })
    }
    const { data, error } = await supabase.rpc('get_archive_employees', {
      p_include_demo: false,
    })
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ employees: data ?? [] })
  }

  const parsed = reportSchema.safeParse({
    mode,
    employee_id: req.nextUrl.searchParams.get('employee_id'),
    from: req.nextUrl.searchParams.get('from'),
    to: req.nextUrl.searchParams.get('to'),
  })
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'employee_id, from und to erforderlich' },
      { status: 400 },
    )
  }
  const { employee_id, from, to } = parsed.data

  const [summaryRes, monthlyRes, daysRes] = await Promise.all([
    supabase.rpc('get_employee_archive', {
      p_employee_id: employee_id,
      p_from: from,
      p_to: to,
    }),
    supabase.rpc('get_employee_archive_monthly', {
      p_employee_id: employee_id,
      p_from: from,
      p_to: to,
    }),
    supabase.rpc('get_employee_archive_days', {
      p_employee_id: employee_id,
      p_from: from,
      p_to: to,
    }),
  ])

  const err = summaryRes.error || monthlyRes.error || daysRes.error
  if (err) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }

  const summary = Array.isArray(summaryRes.data) ? summaryRes.data[0] : summaryRes.data
  return NextResponse.json({
    summary: summary ?? null,
    monthly: monthlyRes.data ?? [],
    days: daysRes.data ?? [],
  })
}
