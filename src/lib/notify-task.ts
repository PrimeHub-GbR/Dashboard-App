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
