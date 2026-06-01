/**
 * Standard-Fußzeile, die serverseitig an JEDE ausgehende WhatsApp-Nachricht
 * angehängt wird. Wird zusätzlich im Formular als Hinweis angezeigt.
 */
export const MESSAGE_FOOTER =
  'Bitte antworten Sie nicht auf diese Nachricht. Bei Rückfragen wenden Sie sich an Ihren Manager.'

/** Hängt die Standard-Fußzeile an einen Nachrichtentext an. */
export function withMessageFooter(message: string): string {
  return `${message.trim()}\n\n${MESSAGE_FOOTER}`
}
