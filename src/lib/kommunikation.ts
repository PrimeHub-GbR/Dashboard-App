/**
 * Default-Fußzeile (Fallback). Der tatsächlich verwendete Text ist über das
 * Dashboard editierbar und liegt in der Tabelle `kommunikation_settings`.
 * Diese Konstante greift nur, wenn noch kein Wert in der DB gespeichert ist.
 */
export const MESSAGE_FOOTER =
  'Bitte antworten Sie nicht auf diese Nachricht. Bei Rückfragen wenden Sie sich an Ihren Manager.'

/**
 * Hängt die Standard-Fußzeile an einen Nachrichtentext an.
 * @param footer optionaler Fußzeilen-Text (z.B. aus den Dashboard-Einstellungen).
 *               Leerer/fehlender Wert → keine Fußzeile.
 */
export function withMessageFooter(message: string, footer: string = MESSAGE_FOOTER): string {
  const trimmedFooter = footer.trim()
  const trimmedMessage = message.trim()
  return trimmedFooter ? `${trimmedMessage}\n\n${trimmedFooter}` : trimmedMessage
}
