// Kostenmodell für DataImpulse-Residential-Proxy beim Amazon-Scraping.
//
// DataImpulse rechnet pro GB verbrauchtem Datenvolumen ab (~1 $/GB, Bulk günstiger).
// Eine Amazon-Schaufenster-Seite ist ~120 KB HTML. Pro Lauf werden mehrere Seiten
// pro Händler abgerufen. Die echten Kosten werden zusätzlich aus den vom N8N-Workflow
// gemeldeten proxy_bytes gemessen (siehe actualCostFromBytes).

export const EUR_PER_GB = 1.0
export const AVG_PAGE_KB = 120
export const DEFAULT_EST_PAGES = 10 // Annahme pro Händler, wenn max_pages = "alle" (NULL)
export const WORKFLOW_MAX_PAGES_CAP = 50 // harter Safety-Cap im Workflow

const BYTES_PER_GB = 1_000_000_000
const WEEKS_PER_MONTH = 365.25 / 12 / 7 // ~4.348

export interface CostBreakdown {
  gb: number
  eur: number
}

export interface SellerScheduleLike {
  is_active: boolean
  schedule_mode: 'weekly' | 'interval'
  interval_minutes: number
  active_weekdays: string[]
  max_pages: number | null
}

export function actualCostFromBytes(bytes: number): CostBreakdown {
  const gb = bytes / BYTES_PER_GB
  return { gb, eur: gb * EUR_PER_GB }
}

export function estimateRunCost(pages: number): CostBreakdown & { bytes: number } {
  const bytes = pages * AVG_PAGE_KB * 1000
  const gb = bytes / BYTES_PER_GB
  return { bytes, gb, eur: gb * EUR_PER_GB }
}

export function runsPerMonth(s: SellerScheduleLike): number {
  const activeDays = Math.max(1, s.active_weekdays.length)
  if (s.schedule_mode === 'weekly') {
    return activeDays * WEEKS_PER_MONTH
  }
  const runsPerDay = (24 * 60) / Math.max(1, s.interval_minutes)
  return runsPerDay * activeDays * WEEKS_PER_MONTH
}

export function estimateSellerMonthlyCost(s: SellerScheduleLike): CostBreakdown {
  const pages = s.max_pages ?? DEFAULT_EST_PAGES
  const perRunGb = (pages * AVG_PAGE_KB * 1000) / BYTES_PER_GB
  const gb = perRunGb * runsPerMonth(s)
  return { gb, eur: gb * EUR_PER_GB }
}

export function estimateMonthlyCost(sellers: SellerScheduleLike[]): CostBreakdown {
  let gb = 0
  for (const s of sellers) {
    if (!s.is_active) continue
    gb += estimateSellerMonthlyCost(s).gb
  }
  return { gb, eur: gb * EUR_PER_GB }
}
