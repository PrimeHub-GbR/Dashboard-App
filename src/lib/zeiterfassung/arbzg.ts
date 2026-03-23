/**
 * ArbZG § 4 Pausenberechnung
 *
 * Bis 6 Stunden (≤ 360 min): keine Pause erforderlich
 * 6–9 Stunden (361–540 min): 30 Minuten Pflichtpause
 * Über 9 Stunden (> 540 min): 45 Minuten Pflichtpause
 */

export function calculateBreakMinutes(grossMinutes: number): number {
  if (grossMinutes <= 360) return 0
  if (grossMinutes <= 540) return 30
  return 45
}

export function calculateNetWorkMinutes(
  checkedInAt: Date,
  checkedOutAt: Date
): { grossMinutes: number; breakMinutes: number; netMinutes: number } {
  const grossMinutes = Math.max(
    0,
    Math.floor((checkedOutAt.getTime() - checkedInAt.getTime()) / 60_000)
  )
  const breakMinutes = calculateBreakMinutes(grossMinutes)
  const netMinutes = Math.max(0, grossMinutes - breakMinutes)
  return { grossMinutes, breakMinutes, netMinutes }
}

/** Gibt true zurück wenn der Mitarbeiter die ArbZG-Pausenpflicht ausgelöst hat (≥ 6h) */
export function isArbZGBreakRequired(checkedInAt: Date): boolean {
  const durationMinutes = Math.floor(
    (Date.now() - checkedInAt.getTime()) / 60_000
  )
  return durationMinutes >= 360
}
