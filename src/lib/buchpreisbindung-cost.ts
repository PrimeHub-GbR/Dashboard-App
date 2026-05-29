// Kostenmodell für das Amazon-Scraping über die ScrapeOps Proxy-API.
//
// ScrapeOps rechnet pro erfolgreichem Request in Credits ab. Amazon ist bei ScrapeOps
// eine Standard-Domain → 1 Credit pro Request. Pro Lauf fallen an:
//   - PROBE_REGIONS Probe-Requests (Seite 1 je Preisbereich)
//   - + Restseiten-Requests (abhängig von der Trefferzahl des Händlers)
// Die echten verbrauchten Credits meldet der N8N-Workflow zurück (scrapeops_credits),
// siehe actualCostFromCredits. Free-Plan: 1.000 Credits/Monat, Starter: 25.000 für 9 $.

export const CREDITS_PER_REQUEST = 1 // Amazon = Standard-Domain bei ScrapeOps
export const USD_PER_1000_CREDITS = 0.36 // Starter-Plan: 9 $ / 25.000 Credits
export const PROBE_REGIONS = 31 // feste Preisbereiche → Probe-Requests pro Lauf
export const DEFAULT_EST_REQUESTS = 130 // grobe Schätzung Requests/Lauf (großer Händler)
export const WORKFLOW_MAX_PAGES_CAP = 20 // Amazon gibt je Suche nur ~20 Seiten frei

const WEEKS_PER_MONTH = 365.25 / 12 / 7 // ~4.348

export interface CostBreakdown {
  credits: number
  usd: number
}

export interface SellerScheduleLike {
  is_active: boolean
  schedule_mode: 'weekly' | 'interval'
  interval_minutes: number
  active_weekdays: string[]
  max_pages: number | null
}

function usdFromCredits(credits: number): number {
  return (credits / 1000) * USD_PER_1000_CREDITS
}

export function actualCostFromCredits(credits: number): CostBreakdown {
  return { credits, usd: usdFromCredits(credits) }
}

export function estimateRunCost(requests: number = DEFAULT_EST_REQUESTS): CostBreakdown & { requests: number } {
  const credits = requests * CREDITS_PER_REQUEST
  return { requests, credits, usd: usdFromCredits(credits) }
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
  const credits = DEFAULT_EST_REQUESTS * CREDITS_PER_REQUEST * runsPerMonth(s)
  return { credits, usd: usdFromCredits(credits) }
}

export function estimateMonthlyCost(sellers: SellerScheduleLike[]): CostBreakdown {
  let credits = 0
  for (const s of sellers) {
    if (!s.is_active) continue
    credits += estimateSellerMonthlyCost(s).credits
  }
  return { credits, usd: usdFromCredits(credits) }
}
