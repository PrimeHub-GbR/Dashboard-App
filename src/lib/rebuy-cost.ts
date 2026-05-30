// Kostenmodell für den Rebuy-Scraper über die ScrapeOps Proxy-API.
//
// Rebuy ist bei ScrapeOps eine Standard-Domain → 1 Credit pro Listing-Page-Request.
// Der Container scrapt nur Listing-Pages (kein Produktseiten-Crawl) — jede Page
// liefert ~29 vollständige Produkte (id, name, identifiers, price_*, …).
//
// Modi:
//   - bestseller: Rebuy-Subkategorie /kaufen/buecher-bestseller-buecher × bis Seite 86
//                 → ~50–86 Pages (kleine Subkategorie, oft früher zu Ende)
//   - komplett:   Alle Bücher-Subkategorien × bis Seite 86 + Dedup
//                 → ~2500–3000 Pages (Container kennt die Subkategorien-Liste)
//
// Die echten verbrauchten Credits meldet der Container im notify-Callback
// (scrapeops_credits) — siehe actualCostFromCredits.

export type RebuyMode = 'bestseller' | 'komplett'

export const CREDITS_PER_REQUEST = 1 // Rebuy = Standard-Domain bei ScrapeOps
export const USD_PER_1000_CREDITS = 0.36 // Starter-Plan: 9 $ / 25.000 Credits

// Grobe Schätzungen pro Modus (Container meldet später Echtwerte zurück)
export const MODE_REQUEST_ESTIMATES: Record<RebuyMode, number> = {
  bestseller: 86,   // 1 Subkategorie × ~86 Pages
  komplett: 2_800,  // ~32 Subkategorien × bis ~86 Pages, nach Dedup-Overhead
}

export interface CostBreakdown {
  credits: number
  usd: number
}

function usdFromCredits(credits: number): number {
  return (credits / 1000) * USD_PER_1000_CREDITS
}

export function actualCostFromCredits(credits: number): CostBreakdown {
  return { credits, usd: usdFromCredits(credits) }
}

export function estimateModeCost(
  mode: RebuyMode,
  requestsOverride?: number,
): CostBreakdown & { requests: number; mode: RebuyMode } {
  const requests = requestsOverride ?? MODE_REQUEST_ESTIMATES[mode]
  const credits = requests * CREDITS_PER_REQUEST
  return { mode, requests, credits, usd: usdFromCredits(credits) }
}
