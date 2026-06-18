import { Fingerprint, KeyRound, PencilLine } from 'lucide-react'
import type { TimeEntry } from '@/lib/zeiterfassung/types'

/**
 * Zeigt die Herkunft einer Buchung an:
 * - manuelle Nachpflege (corrected_at gesetzt) -> lila "Manuell"
 * - Kiosk (per PIN/Fingerabdruck gestempelt)   -> grün "Kiosk"
 */
export function StempelquelleBadge({ entry }: { entry: TimeEntry }) {
  const manual = entry.corrected_at != null
  if (manual) {
    return (
      <span className="inline-flex items-center gap-1 text-purple-400" title="Manuelle Nachpflege">
        <PencilLine className="w-3.5 h-3.5" />
        <span className="text-xs font-semibold">Manuell</span>
      </span>
    )
  }
  const Icon = entry.auth_method === 'fingerprint' ? Fingerprint : KeyRound
  return (
    <span
      className="inline-flex items-center gap-1 text-green-500"
      title={entry.auth_method === 'fingerprint' ? 'Kiosk (Fingerabdruck)' : 'Kiosk (PIN)'}
    >
      <Icon className="w-3.5 h-3.5" />
      <span className="text-xs font-semibold">Kiosk</span>
    </span>
  )
}
