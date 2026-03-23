interface OvertimePayload {
  employee_name: string
  month: string           // z.B. "März 2025"
  actual_hours: number
  target_hours: number
  overtime_hours: number
}

/**
 * Sendet eine Überstundenwarnung an den konfigurierten N8N-Webhook.
 * Fire-and-forget: Fehler werden geloggt aber nicht weitergeleitet.
 */
export async function triggerOvertimeNotification(
  payload: OvertimePayload
): Promise<void> {
  const webhookUrl = process.env.N8N_ZEITERFASSUNG_WEBHOOK_URL
  if (!webhookUrl) return

  fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }).catch((err: unknown) => {
    console.warn('[Zeiterfassung] Überstunden-Webhook nicht erreichbar:', err)
  })
}
