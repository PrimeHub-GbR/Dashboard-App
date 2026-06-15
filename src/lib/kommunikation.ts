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

/**
 * Normalisiert eine Telefonnummer ins internationale E.164-Format (+49…).
 * Akzeptiert nationale deutsche Schreibweisen und räumt Trennzeichen auf:
 *   "0152 5451 3684"  → "+4915254513684"
 *   "0049152…"        → "+49152…"
 *   "+49 152 …"       → "+49152…"
 *   "49152…"          → "+49152…"
 * Gibt null zurück, wenn keine plausible Nummer entsteht.
 */
export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null
  let p = raw.trim()
  if (p.startsWith('+')) {
    p = '+' + p.slice(1).replace(/\D/g, '')
  } else if (p.replace(/\D/g, '').startsWith('00')) {
    p = '+' + p.replace(/\D/g, '').slice(2)
  } else {
    const digits = p.replace(/\D/g, '')
    if (digits.startsWith('0')) {
      p = '+49' + digits.slice(1) // deutsche nationale Nummer
    } else if (digits.startsWith('49')) {
      p = '+' + digits
    } else if (digits.length > 0) {
      p = '+49' + digits // Annahme: deutsche Nummer ohne führende 0
    } else {
      return null
    }
  }
  // Plausibilität: + und 8–15 Ziffern (E.164)
  return /^\+\d{8,15}$/.test(p) ? p : null
}
