import { NextResponse } from 'next/server'
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase-server'
import { getMaxShiftHours, isStaleOpenEntry } from '@/lib/zeiterfassung/shift-limit'
import { SEVERITY_RANK, type AppNotification } from '@/lib/notifications/types'

type UserRole = 'admin' | 'manager' | 'staff'

async function requireAdminOrManager() {
  const supabase = await createSupabaseServerClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return { ok: false as const, status: 401, error: 'Nicht autorisiert' }
  const { data } = await supabase.from('user_roles').select('role').eq('user_id', user.id).single()
  const role = data?.role as UserRole | undefined
  if (role !== 'admin' && role !== 'manager') {
    return { ok: false as const, status: 403, error: 'Keine Berechtigung' }
  }
  return { ok: true as const, userId: user.id }
}

const FIELD_LABELS: Record<string, string> = {
  email: 'E-Mail',
  phone: 'Telefon',
  home_address: 'Adresse',
}

/** 'YYYY-MM-DD' im Berlin-Kalender */
function berlinYmd(date: Date): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Berlin' }).format(date)
}

function berlinTime(iso: string): string {
  return new Intl.DateTimeFormat('de-DE', {
    timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit',
  }).format(new Date(iso))
}

export async function GET() {
  const auth = await requireAdminOrManager()
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const service = createSupabaseServiceClient()
  const notifications: AppNotification[] = []

  // Bereits gespeicherte Bestätigungen — geteilte Glocke: Meldungen bleiben
  // nach dem Abhaken fuer ALLE Chefs sichtbar (mit Attribution: wer hat
  // abgehakt). acknowledged_by ist die auth.users-UUID -> ueber employees.
  const { data: ackRows } = await service
    .from('notification_acks')
    .select('notif_key, acknowledged_by, acknowledged_at')
  const ackInfo = new Map<string, { by: string | null; at: string | null }>()
  for (const r of ackRows ?? []) {
    ackInfo.set(r.notif_key, { by: r.acknowledged_by, at: r.acknowledged_at })
  }

  const { data: ackEmps } = await service.from('employees').select('auth_user_id, name')
  const nameByAuth = new Map<string, string>()
  for (const e of ackEmps ?? []) {
    if (e.auth_user_id) nameByAuth.set(e.auth_user_id, e.name)
  }

  /** Bestaetigungs-Felder fuer einen Key (geteilt, mit Attribution). */
  const ackFields = (key: string) => {
    const info = ackInfo.get(key)
    if (!info) return { acknowledged: false as const }
    return {
      acknowledged: true as const,
      acknowledgedBy: info.by ? (nameByAuth.get(info.by) ?? null) : null,
      acknowledgedAt: info.at,
    }
  }

  // ── Quelle 1: Profil-Änderungen ───────────────────────────────────────────
  const { data: profileChanges } = await service
    .from('employee_profile_changes')
    .select('id, employee_id, field_name, old_value, new_value, changed_at, acknowledged_at, employees(name, color)')
    .order('changed_at', { ascending: false })
    .limit(50)

  for (const c of profileChanges ?? []) {
    const emp = c.employees as unknown as { name: string; color: string } | null
    const label = FIELD_LABELS[c.field_name] ?? c.field_name
    notifications.push({
      key: `profile:${c.id}`,
      source: 'profile',
      severity: 'info',
      title: `${emp?.name ?? 'Mitarbeiter'}: ${label} geändert`,
      body: `Vorher: ${c.old_value ?? '—'}  →  Neu: ${c.new_value ?? '—'}`,
      employee: { id: c.employee_id, name: emp?.name ?? 'Unbekannt', color: emp?.color ?? '#22c55e' },
      created_at: c.changed_at,
      link: '/dashboard/organisation',
      acknowledged: c.acknowledged_at != null,
    })
  }

  // ── Quelle 2 + 3: Zeiterfassung (offene >Limit & nachgetragene Einträge) ───
  const maxShiftHours = await getMaxShiftHours(service)

  const { data: openEntries } = await service
    .from('time_entries')
    .select('id, employee_id, checked_in_at, employees(id, name, color)')
    .is('checked_out_at', null)

  for (const e of openEntries ?? []) {
    if (!isStaleOpenEntry(e.checked_in_at, maxShiftHours)) continue
    const emp = e.employees as unknown as { id: string; name: string; color: string } | null
    const ymd = berlinYmd(new Date(e.checked_in_at)).split('-')
    const key = `ztstale:${e.id}`
    notifications.push({
      key,
      source: 'zeit_stale',
      severity: 'critical',
      title: `${emp?.name ?? 'Mitarbeiter'}: Schicht über ${maxShiftHours} h offen`,
      body: `Eingestempelt ${berlinTime(e.checked_in_at)} — kein Checkout (ArbZG-Verstoß möglich)`,
      employee: emp ? { id: emp.id, name: emp.name, color: emp.color } : null,
      created_at: e.checked_in_at,
      link: `/dashboard/zeiterfassung?tab=korrektur&entry=${e.id}&employee=${e.employee_id}&y=${ymd[0]}&m=${ymd[1]}`,
      ...ackFields(key),
    })
  }

  const { data: reviewEntries } = await service
    .from('time_entries')
    .select('id, employee_id, checked_in_at, checked_out_at, note, corrected_at, employees(id, name, color)')
    .eq('needs_review', true)
    .order('corrected_at', { ascending: false })
    .limit(50)

  for (const e of reviewEntries ?? []) {
    const emp = e.employees as unknown as { id: string; name: string; color: string } | null
    const ymd = berlinYmd(new Date(e.checked_in_at)).split('-')
    notifications.push({
      key: `ztreview:${e.id}`,
      source: 'zeit_review',
      severity: 'warning',
      title: `${emp?.name ?? 'Mitarbeiter'}: Eintrag nachgetragen`,
      body: e.note ? `${e.note}` : 'Am Kiosk nachträglich geschlossen — Kontrolle ausstehend',
      employee: emp ? { id: emp.id, name: emp.name, color: emp.color } : null,
      created_at: e.corrected_at ?? e.checked_in_at,
      link: `/dashboard/zeiterfassung?tab=korrektur&entry=${e.id}&employee=${e.employee_id}&y=${ymd[0]}&m=${ymd[1]}`,
      // needs_review=true bedeutet per Definition: noch nicht kontrolliert
      acknowledged: false,
    })
  }

  // ── Quelle 4: Überstunden über Schwellwert (aktueller Monat) ──────────────
  const { data: settings } = await service
    .from('time_tracking_settings')
    .select('overtime_threshold_hours')
    .single()
  const threshold = settings?.overtime_threshold_hours ?? 0

  const [y, m] = berlinYmd(new Date()).split('-').map(Number)
  const ym = `${y}-${String(m).padStart(2, '0')}`
  const { data: monthRows } = await service.rpc('get_all_employees_month_hours', {
    p_year: y,
    p_month: m,
  })

  for (const row of (monthRows ?? []) as Array<{
    employee_id: string; employee_name: string; employee_color: string
    target_hours_per_month: number; total_work_minutes: number; total_break_minutes: number
  }>) {
    const netHours = (Number(row.total_work_minutes) - Number(row.total_break_minutes)) / 60
    const overtime = netHours - Number(row.target_hours_per_month)
    if (overtime < threshold || overtime <= 0) continue
    const key = `overtime:${row.employee_id}:${ym}`
    notifications.push({
      key,
      source: 'overtime',
      severity: 'info',
      title: `${row.employee_name}: +${overtime.toFixed(1)} h Überstunden`,
      body: `${netHours.toFixed(1)} h / ${Number(row.target_hours_per_month).toFixed(0)} h Soll diesen Monat`,
      employee: { id: row.employee_id, name: row.employee_name, color: row.employee_color },
      created_at: new Date().toISOString(),
      link: '/dashboard/zeiterfassung?tab=dashboard',
      ...ackFields(key),
    })
  }

  // ── Quelle 5: Von Mitarbeitern erledigte Aufgaben ─────────────────────────
  // Nur Aufgaben, die ein Mitarbeiter selbst abgehakt hat (completed_by gesetzt;
  // im Web abgehakte Aufgaben haben completed_by = null). Letzte 30 Tage.
  const taskSince = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
  const { data: doneTasks } = await service
    .from('tasks')
    .select('id, title, completed_at, completed_by, completed_by_employee:employees!completed_by ( name, color )')
    .eq('status', 'done')
    .not('completed_by', 'is', null)
    .not('completed_at', 'is', null)
    .gte('completed_at', taskSince)
    .order('completed_at', { ascending: false })
    .limit(50)

  for (const t of doneTasks ?? []) {
    const emp = t.completed_by_employee as unknown as { name: string; color: string } | null
    // Stabiler Key (ohne completed_at) -> Bestaetigungen sind zwischen Web-
    // Dashboard und App-Glocke geteilt (siehe RPC get_chef_task_notifications).
    const key = `taskdone:${t.id}`
    notifications.push({
      key,
      source: 'task_done',
      severity: 'info',
      title: `${emp?.name ?? 'Mitarbeiter'}: Aufgabe erledigt`,
      body: t.title,
      employee: emp && t.completed_by ? { id: t.completed_by, name: emp.name, color: emp.color } : null,
      created_at: t.completed_at as string,
      link: `/dashboard/aufgaben?task=${t.id}`,
      ...ackFields(key),
    })
  }

  // ── Quelle 6: "Nicht geplant" (gearbeitet, aber nicht eingeplant) ─────────
  // Persistiert nachts (unplanned_work_events). Geteilte Glocke + Attribution.
  const unplannedSince = berlinYmd(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000))
  const { data: unplannedEvents } = await service
    .from('unplanned_work_events')
    .select('id, employee_id, event_date, worked_from, worked_to, employees(name, color)')
    .gte('event_date', unplannedSince)
    .order('event_date', { ascending: false })
    .limit(50)

  for (const u of unplannedEvents ?? []) {
    const emp = u.employees as unknown as { name: string; color: string } | null
    const key = `unplannedwork:${u.id}`
    const dateLabel = new Date(u.event_date as string).toLocaleDateString('de-DE', {
      weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric',
    })
    const timePart = u.worked_from && u.worked_to
      ? ` · gearbeitet ${u.worked_from}–${u.worked_to}`
      : ''
    const ymd = (u.event_date as string).split('-')
    notifications.push({
      key,
      source: 'unplanned',
      severity: 'warning',
      title: `${emp?.name ?? 'Mitarbeiter'}: nicht geplant`,
      body: `Gearbeitet, aber nicht eingeplant — ${dateLabel}${timePart}`,
      employee: emp ? { id: u.employee_id, name: emp.name, color: emp.color } : null,
      created_at: u.event_date as string,
      link: `/dashboard/zeiterfassung?tab=korrektur&employee=${u.employee_id}&y=${ymd[0]}&m=${ymd[1]}`,
      ...ackFields(key),
    })
  }

  // 2-Wochen-Historie: abgehakte Meldungen verschwinden 14 Tage nach dem
  // Abhaken dauerhaft aus der Liste.
  const ackCutoff = Date.now() - 14 * 24 * 60 * 60 * 1000
  const visible = notifications.filter(
    n => !n.acknowledged || !n.acknowledgedAt || new Date(n.acknowledgedAt).getTime() >= ackCutoff,
  )

  // Sortierung: offen vor erledigt, dann Schweregrad, dann neueste zuerst
  visible.sort((a, b) => {
    if (a.acknowledged !== b.acknowledged) return a.acknowledged ? 1 : -1
    if (SEVERITY_RANK[a.severity] !== SEVERITY_RANK[b.severity]) {
      return SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]
    }
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  })

  const unread = visible.filter(n => !n.acknowledged).length

  return NextResponse.json({ notifications: visible, unread })
}
