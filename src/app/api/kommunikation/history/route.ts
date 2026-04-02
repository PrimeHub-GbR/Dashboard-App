import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase-server'

async function requireAuth() {
  const supabase = await createSupabaseServerClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return null
  return user
}

export async function GET(req: NextRequest) {
  const user = await requireAuth()
  if (!user) {
    return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const recipient_id = searchParams.get('recipient_id')
  const context = searchParams.get('context')
  const status = searchParams.get('status')
  const from = searchParams.get('from')
  const to = searchParams.get('to')
  const date_range = searchParams.get('date_range')
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10))
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') ?? '20', 10)))

  const service = createSupabaseServiceClient()

  // 90 Tage Limit (Basis-Cutoff)
  const ninetyDaysAgo = new Date()
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90)
  const cutoff = ninetyDaysAgo.toISOString()

  // date_range → dynamischer From-Filter (überschreibt Basis-Cutoff nach oben)
  let rangeFrom: string | null = null
  if (date_range === 'today') {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    rangeFrom = today.toISOString()
  } else if (date_range === 'week') {
    const weekStart = new Date()
    weekStart.setDate(weekStart.getDate() - weekStart.getDay() + (weekStart.getDay() === 0 ? -6 : 1))
    weekStart.setHours(0, 0, 0, 0)
    rangeFrom = weekStart.toISOString()
  } else if (date_range === 'month') {
    const monthStart = new Date()
    monthStart.setDate(1)
    monthStart.setHours(0, 0, 0, 0)
    rangeFrom = monthStart.toISOString()
  }

  // Effektiver From-Wert: date_range > from-param > 90-Tage-Cutoff
  const effectiveFrom = rangeFrom ?? (from ?? cutoff)

  // Gesamtanzahl-Query für Pagination
  let countQuery = service
    .from('message_logs')
    .select('id', { count: 'exact', head: true })
    .gte('created_at', effectiveFrom)

  if (recipient_id) countQuery = countQuery.eq('recipient_id', recipient_id)
  if (context) countQuery = countQuery.eq('context', context)
  if (status) countQuery = countQuery.eq('status', status)
  if (to) {
    // "to"-Datum inklusiv: bis Ende des Tages
    const toEnd = new Date(to)
    toEnd.setHours(23, 59, 59, 999)
    countQuery = countQuery.lte('created_at', toEnd.toISOString())
  }

  const { count } = await countQuery

  // Daten-Query mit JOIN auf employees
  let dataQuery = service
    .from('message_logs')
    .select(`
      id,
      created_at,
      sent_by,
      recipient_id,
      recipient_phone,
      message_text,
      context,
      context_ref_id,
      status,
      error_message,
      n8n_triggered_at,
      employees (
        id,
        name
      )
    `)
    .gte('created_at', effectiveFrom)
    .order('created_at', { ascending: false })
    .range((page - 1) * limit, page * limit - 1)

  if (recipient_id) dataQuery = dataQuery.eq('recipient_id', recipient_id)
  if (context) dataQuery = dataQuery.eq('context', context)
  if (status) dataQuery = dataQuery.eq('status', status)
  if (to) {
    const toEnd = new Date(to)
    toEnd.setHours(23, 59, 59, 999)
    dataQuery = dataQuery.lte('created_at', toEnd.toISOString())
  }

  const { data, error } = await dataQuery

  if (error) {
    return NextResponse.json({ error: 'Datenbankfehler' }, { status: 500 })
  }

  // Absender-Emails laden (sent_by sind auth.users UUIDs)
  const senderIds = [...new Set((data ?? []).map((l: { sent_by: string }) => l.sent_by).filter(Boolean))]
  const senderMap = new Map<string, string>()

  if (senderIds.length > 0) {
    // auth.users ist nicht direkt per join erreichbar — laden über user_roles + Fallback auf UUID
    const { data: roles } = await service
      .from('user_roles')
      .select('user_id, role')
      .in('user_id', senderIds)

    for (const r of roles ?? []) {
      senderMap.set(r.user_id, r.role)
    }
  }

  const logs = (data ?? []).map((log: Record<string, unknown>) => ({
    ...log,
    sender_role: senderMap.get(log.sent_by as string) ?? null,
  }))

  return NextResponse.json({
    logs,
    total: count ?? 0,
    page,
    limit,
    pages: Math.ceil((count ?? 0) / limit),
  })
}
