/**
 * Löst eine Push-Benachrichtigung für (neu) zugewiesene Mitarbeiter aus,
 * indem die Edge Function `notify-task-assigned` aufgerufen wird.
 *
 * Server-seitiger Aufruf mit dem Service-Role-Key → die Edge Function
 * überspringt den User-Rollencheck (interner Modus). Fehler werden
 * geschluckt, damit ein Push-Problem die eigentliche API-Antwort nie bricht.
 */
export async function notifyTaskAssigned(
  taskId: string,
  employeeIds: string[],
): Promise<void> {
  if (employeeIds.length === 0) return

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !serviceKey) return

  try {
    await fetch(`${url}/functions/v1/notify-task-assigned`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${serviceKey}`,
        apikey: anon ?? serviceKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ task_id: taskId, assignee_ids: employeeIds }),
    })
  } catch (e) {
    console.error('[aufgaben] Push-Benachrichtigung fehlgeschlagen:', e)
  }
}
