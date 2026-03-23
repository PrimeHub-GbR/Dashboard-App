const BERLIN = 'Europe/Berlin'

/**
 * Formatiert einen UTC-Timestamp für die Anzeige in Berliner Ortszeit.
 * Automatische Sommer-/Winterzeit-Umstellung via Intl.DateTimeFormat.
 */
export function formatBerlin(
  utcDate: string | Date,
  opts: Intl.DateTimeFormatOptions = {}
): string {
  return new Intl.DateTimeFormat('de-DE', {
    timeZone: BERLIN,
    ...opts,
  }).format(new Date(utcDate))
}

/** Gibt Zeit + Datum in Berlin-Zeit zurück: "08:30" */
export function formatTimeBerlin(utcDate: string | Date): string {
  return formatBerlin(utcDate, { hour: '2-digit', minute: '2-digit', hour12: false })
}

/** Gibt Datum in Berlin-Zeit zurück: "18.03.2025" */
export function formatDateBerlin(utcDate: string | Date): string {
  return formatBerlin(utcDate, { day: '2-digit', month: '2-digit', year: 'numeric' })
}

/** Gibt Datum + Zeit in Berlin-Zeit zurück: "18.03.2025, 08:30" */
export function formatDateTimeBerlin(utcDate: string | Date): string {
  return formatBerlin(utcDate, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

/** Aktuelles Datum in Berlin-Zeit als Date-Objekt */
export function nowInBerlin(): Date {
  const now = new Date()
  const berlinStr = now.toLocaleString('en-US', { timeZone: BERLIN })
  return new Date(berlinStr)
}

/**
 * Berechnet den UTC-Zeitbereich für einen vollständigen Kalendermonat in Berlin-Zeit.
 * month ist 1-basiert (1 = Januar, 12 = Dezember).
 */
export function getBerlinMonthRange(
  year: number,
  month: number
): { from: string; to: string } {
  // Erster Tag des Monats Mitternacht Berlin
  const fromBerlin = new Date(year, month - 1, 1, 0, 0, 0)
  // Erster Tag des Folgemonats Mitternacht Berlin
  const toBerlin = new Date(year, month, 1, 0, 0, 0)

  // Berlin→UTC: Offset berechnen via toLocaleString Trick
  const fromUtc = berlinToUtc(fromBerlin)
  const toUtc = berlinToUtc(toBerlin)

  return { from: fromUtc.toISOString(), to: toUtc.toISOString() }
}

/**
 * Wandelt ein lokales Date (das als Berlin-Ortszeit interpretiert werden soll) in UTC um.
 * Nutzt die Intl.DateTimeFormat Methode um den Offset zu ermitteln.
 */
function berlinToUtc(localDate: Date): Date {
  const utcMs = localDate.getTime()
  // Offset: Differenz zwischen UTC und Berlin-Zeit
  const berlinMs = new Date(
    localDate.toLocaleString('en-US', { timeZone: BERLIN })
  ).getTime()
  const offset = utcMs - berlinMs
  return new Date(utcMs + offset)
}

/** Aktuelles Jahr und Monat in Berlin-Zeit */
export function currentBerlinYearMonth(): { year: number; month: number } {
  const now = nowInBerlin()
  return { year: now.getFullYear(), month: now.getMonth() + 1 }
}

/** Formatiert Minuten als "Xh Ymin", z.B. "7h 30min" */
export function formatDuration(totalMinutes: number): string {
  if (totalMinutes < 0) totalMinutes = 0
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (hours === 0) return `${minutes}min`
  if (minutes === 0) return `${hours}h`
  return `${hours}h ${minutes}min`
}

/** Gibt einen deutschen Monatsstring zurück: "März 2025" */
export function formatMonthLabel(year: number, month: number): string {
  const date = new Date(year, month - 1, 1)
  return date.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' })
}
