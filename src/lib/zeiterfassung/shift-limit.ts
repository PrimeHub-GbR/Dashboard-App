import type { createSupabaseServiceClient } from '@/lib/supabase-server'

export const DEFAULT_MAX_SHIFT_HOURS = 10

/** Maximale Schichtdauer (Stunden) aus den Einstellungen, Fallback auf 10. */
export async function getMaxShiftHours(
  service: ReturnType<typeof createSupabaseServiceClient>
): Promise<number> {
  const { data } = await service
    .from('time_tracking_settings')
    .select('max_shift_hours')
    .single()
  return data?.max_shift_hours ?? DEFAULT_MAX_SHIFT_HOURS
}

function berlinDay(date: Date): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Berlin' }).format(date)
}

/**
 * Eine offene Buchung gilt als "vergessene Abmeldung", wenn ihr Check-in an einem früheren
 * Berlin-Kalendertag liegt ODER ihr Alter die maximale Schichtdauer überschreitet.
 * Der Tagesvergleich ist primär (verhindert Fehlauslösung bei legitimer langer Tagschicht);
 * die Stundenschwelle ist das Sicherheitsnetz für Schichten über Mitternacht.
 */
export function isStaleOpenEntry(
  checkedInAt: string | Date,
  maxShiftHours: number,
  now: Date = new Date()
): boolean {
  const inDate = new Date(checkedInAt)
  const ageHours = (now.getTime() - inDate.getTime()) / 3_600_000
  if (ageHours > maxShiftHours) return true
  return berlinDay(inDate) !== berlinDay(now)
}
