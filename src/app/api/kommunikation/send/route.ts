import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase-server'

const sendSchema = z.object({
  recipient_ids: z.array(z.string().uuid()).min(1, 'Mindestens ein Empfänger erforderlich'),
  message: z.string().min(1, 'Nachricht darf nicht leer sein').max(1000, 'Nachricht darf maximal 1000 Zeichen lang sein'),
  context: z.enum(['manual', 'aufgabe', 'zeiterfassung']),
  context_ref_id: z.string().uuid().optional().nullable(),
})

async function requireAuthWithRole() {
  const supabase = await createSupabaseServerClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return null

  const service = createSupabaseServiceClient()
  const { data: roleRow } = await service
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)
    .single()

  if (!roleRow || !['admin', 'manager'].includes(roleRow.role)) return null
  return user
}

export async function POST(req: NextRequest) {
  const user = await requireAuthWithRole()
  if (!user) {
    return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 })
  }

  const webhookUrl = process.env.N8N_WHATSAPP_WEBHOOK_URL
  if (!webhookUrl) {
    return NextResponse.json(
      { error: 'WhatsApp nicht konfiguriert' },
      { status: 503 }
    )
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Ungültiger JSON-Body' }, { status: 400 })
  }

  const parsed = sendSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const { recipient_ids, message, context, context_ref_id } = parsed.data
  const service = createSupabaseServiceClient()

  // Empfänger-Daten laden (Name + Telefonnummer)
  const { data: employees, error: empError } = await service
    .from('employees')
    .select('id, name, phone')
    .in('id', recipient_ids)

  if (empError) {
    return NextResponse.json({ error: 'Fehler beim Laden der Mitarbeiter' }, { status: 500 })
  }

  const employeeMap = new Map((employees ?? []).map((e: { id: string; name: string; phone: string | null }) => [e.id, e]))

  let sent = 0
  let failed = 0
  const logs: unknown[] = []

  for (const recipientId of recipient_ids) {
    const employee = employeeMap.get(recipientId)

    if (!employee || !employee.phone) {
      // Mitarbeiter ohne Telefonnummer: direkt als failed loggen
      const { data: logEntry } = await service
        .from('message_logs')
        .insert({
          sent_by: user.id,
          recipient_id: recipientId,
          recipient_phone: employee?.phone ?? '',
          message_text: message,
          context,
          context_ref_id: context_ref_id ?? null,
          status: 'failed',
          error_message: 'Keine Telefonnummer hinterlegt',
        })
        .select()
        .single()

      failed++
      if (logEntry) logs.push(logEntry)
      continue
    }

    // Telefonnummer-Validierung: muss mit + beginnen
    if (!employee.phone.startsWith('+')) {
      const { data: logEntry } = await service
        .from('message_logs')
        .insert({
          sent_by: user.id,
          recipient_id: recipientId,
          recipient_phone: employee.phone,
          message_text: message,
          context,
          context_ref_id: context_ref_id ?? null,
          status: 'failed',
          error_message: 'Ungültiges Telefonnummern-Format (internationales Format +49... erforderlich)',
        })
        .select()
        .single()

      failed++
      if (logEntry) logs.push(logEntry)
      continue
    }

    // Log-Eintrag mit status 'pending' erstellen
    const { data: logEntry, error: logError } = await service
      .from('message_logs')
      .insert({
        sent_by: user.id,
        recipient_id: recipientId,
        recipient_phone: employee.phone,
        message_text: message,
        context,
        context_ref_id: context_ref_id ?? null,
        status: 'pending',
        n8n_triggered_at: new Date().toISOString(),
      })
      .select()
      .single()

    if (logError || !logEntry) {
      failed++
      continue
    }

    // N8N-Webhook triggern
    try {
      const n8nResponse = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          log_id: logEntry.id,
          phone: employee.phone,
          message,
        }),
      })

      if (!n8nResponse.ok) {
        await service
          .from('message_logs')
          .update({ status: 'failed', error_message: `N8N-Fehler: HTTP ${n8nResponse.status}` })
          .eq('id', logEntry.id)

        failed++
        logs.push({ ...logEntry, status: 'failed' })
      } else {
        sent++
        logs.push(logEntry)
      }
    } catch (fetchErr) {
      const errMsg = fetchErr instanceof Error ? fetchErr.message : 'Unbekannter Fehler'
      await service
        .from('message_logs')
        .update({ status: 'failed', error_message: `N8N nicht erreichbar: ${errMsg}` })
        .eq('id', logEntry.id)

      failed++
      logs.push({ ...logEntry, status: 'failed' })
    }
  }

  return NextResponse.json({ sent, failed, logs }, { status: 200 })
}
