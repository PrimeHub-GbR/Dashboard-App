/**
 * Die beiden Stränge eines PlentyONE-Laufs und ihr Anstoß in n8n.
 *
 * Seit 13.09.2026 einzeln startbar: der Cover-Strang braucht bei 2.000 Titeln
 * Stunden, die CSV fünf Minuten — und ein Fehler in einem Strang soll nicht
 * den anderen mitreißen. Ein nicht gestarteter Strang steht auf "pending".
 */
export type StrangKey = 'csv' | 'cover'

export const STRANG_WEBHOOK: Record<StrangKey, string> = {
  csv: 'plentyone-metadata',
  cover: 'plentyone-cover',
}

export interface StrangAuftrag {
  run_id: string
  input_file_path: string
  callback_url: string
  limit: number | null
}

/** Einen Strang in n8n anstoßen. Gibt null zurück oder die Fehlermeldung. */
export async function strangAnstossen(
  strang: StrangKey,
  koerper: StrangAuftrag
): Promise<string | null> {
  const basis = process.env.N8N_WEBHOOK_BASE_URL
  if (!basis) return 'N8N_WEBHOOK_BASE_URL ist nicht konfiguriert'
  try {
    const res = await fetch(`${basis}/${STRANG_WEBHOOK[strang]}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(koerper),
    })
    if (!res.ok) {
      const txt = await res.text().catch(() => '')
      return `n8n antwortete ${res.status} ${txt.slice(0, 200)}`
    }
    return null
  } catch (e) {
    return `n8n nicht erreichbar: ${e instanceof Error ? e.message : 'Netzwerkfehler'}`
  }
}
