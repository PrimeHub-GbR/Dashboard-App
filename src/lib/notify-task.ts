import { createSupabaseServiceClient } from '@/lib/supabase-server'
import { normalizePhone } from '@/lib/kommunikation'

/** 'YYYY-MM-DD' → 'DD.MM.YYYY' */
function formatDueDate(d: string | null): string {
  if (!d) return 'ohne feste Frist'
  const [y, m, day] = d.split('-')
  return day && m && y ? `${day}.${m}.${y}` : d
}

/**
 * Schickt neu zugewiesenen Mitarbeitern eine WhatsApp-Nachricht (Vorlage
 * `aufgabe_neu`) mit Name, Aufgabentitel und Fälligkeit. Best-Effort über das
 * N8N-Sende-Webhook; Fehler werden geschluckt. Funktioniert erst, wenn die
 * Vorlage bei Meta genehmigt ist.
 */
export async function notifyTaskAssignedWhatsApp(
  taskId: string,
  employeeIds: string[],
  sentBy: string | null,
): Promise<void> {
  const webhookUrl = process.env.N8N_WHATSAPP_WEBHOOK_URL
  if (!webhookUrl || employeeIds.length === 0) return

  try {
    const service = createSupabaseServiceClient()
    const { data: task } = await service
      .from('tasks')
      .select('title, due_date')
      .eq('id', taskId)
      .single()
    if (!task) return

    const { data: emps } = await service
      .from('employees')
      .select('id, name, phone')
      .in('id', employeeIds)

    const dueLabel = formatDueDate(task.due_date as string | null)

    for (const e of (emps ?? []) as Array<{ id: string; name: string; phone: string | null }>) {
      const phone = normalizePhone(e.phone)
      if (!phone) continue
      const firstName = (e.name ?? '').split(' ')[0] || (e.name ?? 'Kollege')
      const params = [firstName, task.title as string, dueLabel]
      const message = `Hallo ${firstName}, du hast eine neue Aufgabe: ${task.title}. Fällig: ${dueLabel}. Bitte kümmere dich rechtzeitig darum.`

      const { data: log } = await service
        .from('message_logs')
        .insert({
          sent_by: sentBy,
          recipient_id: e.id,
          recipient_phone: phone,
          message_text: message,
          context: 'aufgabe',
          context_ref_id: taskId,
          status: 'pending',
          n8n_triggered_at: new Date().toISOString(),
        })
        .select('id')
        .single()
      if (!log) continue

      try {
        await fetch(webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            log_id: log.id,
            phone,
            template_name: 'aufgabe_neu',
            template_language: 'de',
            template_params: params,
          }),
        })
      } catch {
        await service
          .from('message_logs')
          .update({ status: 'failed', error_message: 'N8N nicht erreichbar' })
          .eq('id', log.id)
      }
    }
  } catch (e) {
    console.error('[aufgaben] WhatsApp-Benachrichtigung fehlgeschlagen:', e)
  }
}

/**
 * Löst eine Push-Benachrichtigung für (neu) zugewiesene Mitarbeiter aus,
 * indem die Edge Function `notify-task-assigned` aufgerufen wird.
 *
 * Aufruf mit dem JWT der eingeloggten Chef-Session (`accessToken`): Das
 * Supabase-Gateway (verify_jwt) lässt das gültige JWT durch, und die Edge
 * Function prüft is_admin_or_manager. Fehler werden geschluckt, damit ein
 * Push-Problem die eigentliche API-Antwort nie bricht.
 */
export async function notifyTaskAssigned(
  taskId: string,
  employeeIds: string[],
  accessToken: string | null,
): Promise<void> {
  if (employeeIds.length === 0 || !accessToken) return

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anon) return

  try {
    await fetch(`${url}/functions/v1/notify-task-assigned`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        apikey: anon,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ task_id: taskId, assignee_ids: employeeIds }),
    })
  } catch (e) {
    console.error('[aufgaben] Push-Benachrichtigung fehlgeschlagen:', e)
  }
}
