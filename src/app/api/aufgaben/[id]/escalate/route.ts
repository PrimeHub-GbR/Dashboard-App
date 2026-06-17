import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServiceClient } from '@/lib/supabase-server'
import { normalizePhone } from '@/lib/kommunikation'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Eskalation einer überfälligen Aufgabe: schickt den zugewiesenen Mitarbeitern
 * eine seriöse, auffordernde WhatsApp (Vorlage `aufgabe_eskalation`).
 *
 * Wird aus der App (Chef/Manager) per Bearer-Token aufgerufen. Versand nur, wenn
 * das Fälligkeitsdatum erreicht oder überschritten ist.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: taskId } = await params
  if (!UUID_RE.test(taskId)) {
    return NextResponse.json({ error: 'Ungültige Aufgaben-ID' }, { status: 400 })
  }

  // Auth via Bearer-Token (App-Session).
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
  if (!token) {
    return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 })
  }

  const service = createSupabaseServiceClient()
  const { data: { user }, error: authError } = await service.auth.getUser(token)
  if (authError || !user) {
    return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 })
  }

  // Nur Chef/Manager dürfen eskalieren.
  const { data: roleRow } = await service
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)
    .single()
  if (!roleRow || !['admin', 'manager'].includes(roleRow.role)) {
    return NextResponse.json({ error: 'Keine Berechtigung' }, { status: 403 })
  }

  // Aufgabe laden + Gate: nur überfällig oder heute fällig.
  const { data: task } = await service
    .from('tasks')
    .select('id, title, due_date, status')
    .eq('id', taskId)
    .single()
  if (!task) {
    return NextResponse.json({ error: 'Aufgabe nicht gefunden' }, { status: 404 })
  }
  if (task.status === 'done') {
    return NextResponse.json({ error: 'Aufgabe ist bereits erledigt' }, { status: 409 })
  }
  const todayBerlin = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Berlin' })
  if (!task.due_date || task.due_date > todayBerlin) {
    return NextResponse.json(
      { error: 'Eskalation erst möglich, wenn die Frist erreicht oder überschritten ist' },
      { status: 422 }
    )
  }

  const webhookUrl = process.env.N8N_WHATSAPP_WEBHOOK_URL
  if (!webhookUrl) {
    return NextResponse.json({ error: 'WhatsApp nicht konfiguriert' }, { status: 503 })
  }

  // Zugewiesene Mitarbeiter (mit Telefon) laden.
  const { data: assignees } = await service
    .from('task_assignees')
    .select('employee_id, employees ( id, name, phone )')
    .eq('task_id', taskId)

  type Emp = { id: string; name: string; phone: string | null }
  const employees: Emp[] = (assignees ?? [])
    .flatMap((a) => {
      const e = (a as unknown as { employees: Emp | Emp[] | null }).employees
      return Array.isArray(e) ? e : e ? [e] : []
    })

  if (employees.length === 0) {
    return NextResponse.json({ error: 'Keine zugewiesenen Mitarbeiter' }, { status: 422 })
  }

  let sent = 0
  let failed = 0

  for (const e of employees) {
    const phone = normalizePhone(e.phone)
    const firstName = (e.name ?? '').split(' ')[0] || (e.name ?? 'Kollege')
    const message =
      `🔴 ESKALATION – Aufgabe überfällig\n\n` +
      `Hallo ${firstName}, deine Aufgabe »${task.title}« ist überfällig.\n\n` +
      `Diese Nachricht wurde vom Management ausgelöst und ist eine verbindliche Aufforderung, ` +
      `die Aufgabe jetzt zu bearbeiten, abzulehnen oder mit einem Kommentar zu verschieben.\n\n` +
      `Bitte reagiere umgehend in der PrimeHub-App.`

    if (!phone) {
      await service.from('message_logs').insert({
        sent_by: user.id, recipient_id: e.id, recipient_phone: e.phone ?? '',
        message_text: message, context: 'aufgabe', context_ref_id: taskId,
        status: 'failed', error_message: 'Keine gültige Telefonnummer',
      })
      failed++
      continue
    }

    const { data: log } = await service
      .from('message_logs')
      .insert({
        sent_by: user.id, recipient_id: e.id, recipient_phone: phone,
        message_text: message, context: 'aufgabe', context_ref_id: taskId,
        status: 'pending', n8n_triggered_at: new Date().toISOString(),
      })
      .select('id')
      .single()
    if (!log) { failed++; continue }

    try {
      const resp = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          log_id: log.id,
          phone,
          template_name: 'aufgabe_eskalation',
          template_language: 'de',
          template_params: [firstName, task.title],
        }),
      })
      if (!resp.ok) {
        await service.from('message_logs')
          .update({ status: 'failed', error_message: `N8N-Fehler: HTTP ${resp.status}` })
          .eq('id', log.id)
        failed++
      } else {
        sent++
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unbekannter Fehler'
      await service.from('message_logs')
        .update({ status: 'failed', error_message: `N8N nicht erreichbar: ${msg}` })
        .eq('id', log.id)
      failed++
    }
  }

  return NextResponse.json({ sent, failed }, { status: 200 })
}
