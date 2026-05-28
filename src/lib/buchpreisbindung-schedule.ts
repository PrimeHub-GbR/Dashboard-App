// Schedule-Berechnung für Buchpreisbindung-Händler.
// Zwei Modi:
//   - 'weekly'   : feste Wochentage + Uhrzeit (Europe/Berlin), z.B. "jeden Freitag 03:00"
//   - 'interval' : Legacy — alle interval_minutes an aktiven Wochentagen

export interface ScheduleConfig {
  schedule_mode: 'weekly' | 'interval'
  run_time: string // 'HH:MM' (Europe/Berlin)
  active_weekdays: string[] // ['mon','tue',...]
  interval_minutes: number
}

const DAY_INDEX: Record<string, number> = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 }
const DAY_NAMES = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']

// Differenz zwischen Berliner Ortszeit und UTC zum gegebenen Zeitpunkt (in ms, positiv wenn Berlin voraus).
function berlinOffsetMs(date: Date): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Berlin',
    hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
  const map: Record<string, number> = {}
  for (const p of dtf.formatToParts(date)) {
    if (p.type !== 'literal') map[p.type] = parseInt(p.value, 10)
  }
  // 'hour' kann bei Mitternacht als 24 formatiert werden — normalisieren.
  const hour = map.hour === 24 ? 0 : map.hour
  const asUtc = Date.UTC(map.year, map.month - 1, map.day, hour, map.minute, map.second)
  return asUtc - date.getTime()
}

// Wandelt eine Berliner Wanduhrzeit (Y/M/D HH:MM) in den korrekten UTC-Zeitpunkt um.
function berlinWallClockToUtc(year: number, month: number, day: number, hour: number, minute: number): Date {
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute, 0)
  const offset = berlinOffsetMs(new Date(utcGuess))
  return new Date(utcGuess - offset)
}

// Berliner Kalenderbestandteile (Jahr/Monat/Tag/Wochentag) für einen Zeitpunkt.
function berlinDateParts(date: Date): { year: number; month: number; day: number; weekday: number } {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Berlin',
    weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit',
  })
  const map: Record<string, string> = {}
  for (const p of dtf.formatToParts(date)) {
    if (p.type !== 'literal') map[p.type] = p.value
  }
  const weekdayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }
  return {
    year: parseInt(map.year, 10),
    month: parseInt(map.month, 10),
    day: parseInt(map.day, 10),
    weekday: weekdayMap[map.weekday],
  }
}

function nextWeeklyRun(weekdays: string[], runTime: string, from: Date): Date {
  const [hh, mm] = runTime.split(':').map(n => parseInt(n, 10))
  const wanted = new Set(weekdays.map(d => DAY_INDEX[d]).filter(n => n !== undefined))
  if (wanted.size === 0) return new Date(from.getTime() + 7 * 24 * 60 * 60 * 1000)

  // Bis zu 14 Tage vorausschauen (deckt DST-Übergänge sicher ab).
  for (let i = 0; i <= 14; i++) {
    const probe = new Date(from.getTime() + i * 24 * 60 * 60 * 1000)
    const parts = berlinDateParts(probe)
    if (!wanted.has(parts.weekday)) continue
    const candidate = berlinWallClockToUtc(parts.year, parts.month, parts.day, hh, mm)
    if (candidate.getTime() > from.getTime()) return candidate
  }
  return new Date(from.getTime() + 7 * 24 * 60 * 60 * 1000)
}

function nextIntervalRun(intervalMinutes: number, weekdays: string[], from: Date): Date {
  let next = new Date(from.getTime() + intervalMinutes * 60 * 1000)
  let safety = 0
  // In den nächsten aktiven Wochentag schieben (lokale Serverzeit-Annäherung wie zuvor).
  while (!weekdays.includes(DAY_NAMES[next.getUTCDay()]) && safety < 8) {
    next = new Date(next.getTime() + 24 * 60 * 60 * 1000)
    safety++
  }
  return next
}

export function calculateNextRunAt(cfg: ScheduleConfig, from: Date = new Date()): Date {
  if (cfg.schedule_mode === 'interval') {
    return nextIntervalRun(cfg.interval_minutes, cfg.active_weekdays, from)
  }
  return nextWeeklyRun(cfg.active_weekdays, cfg.run_time, from)
}
