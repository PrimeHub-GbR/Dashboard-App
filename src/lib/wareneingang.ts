// Gemeinsame Helfer für das Wareneingang-Feature (Carrier-Links, Status-Normalisierung).

export const WARENEINGANG_BUCKET = 'wareneingang-belege'

// Normalisierte Tracking-Status (Aggregator-übergreifend).
export type TrackingStatusCode =
  | 'pending'
  | 'info_received'
  | 'in_transit'
  | 'out_for_delivery'
  | 'delivered'
  | 'exception'
  | 'expired'

// Mappt diverse Aggregator-/Carrier-Codes auf unsere normalisierten Codes.
export function normalizeTrackingStatus(raw?: string | null): TrackingStatusCode | null {
  if (!raw) return null
  const s = raw.toLowerCase().replace(/[\s-]/g, '_')
  if (/(delivered|zugestellt|geliefert)/.test(s)) return 'delivered'
  if (/(out_for_delivery|in_zustellung|wird_zugestellt)/.test(s)) return 'out_for_delivery'
  if (/(exception|failed|problem|fehler|retoure|returned)/.test(s)) return 'exception'
  if (/(expired|abgelaufen)/.test(s)) return 'expired'
  if (/(info_received|pending|label|erfasst|angekuendigt|angek)/.test(s)) return 'info_received'
  if (/(transit|unterwegs|transport|abgeholt|sortier)/.test(s)) return 'in_transit'
  return 'in_transit'
}

// Deutscher Klartext je normalisiertem Status (für UI-Fallback).
export const TRACKING_STATUS_LABEL: Record<TrackingStatusCode, string> = {
  pending: 'Angelegt',
  info_received: 'Versand angekündigt',
  in_transit: 'Unterwegs',
  out_for_delivery: 'In Zustellung',
  delivered: 'Zugestellt',
  exception: 'Problem',
  expired: 'Abgelaufen',
}

// Carrier-Code → Tracking-URL-Builder (öffentliche Sendungsverfolgung).
const CARRIER_URL: Record<string, (t: string) => string> = {
  dhl: (t) => `https://www.dhl.de/de/privatkunden/dhl-sendungsverfolgung.html?piececode=${encodeURIComponent(t)}`,
  'dhl_express': (t) => `https://www.dhl.com/de-de/home/tracking/tracking-express.html?tracking-id=${encodeURIComponent(t)}`,
  dpd: (t) => `https://tracking.dpd.de/status/de_DE/parcel/${encodeURIComponent(t)}`,
  hermes: (t) => `https://www.myhermes.de/empfangen/sendungsverfolgung/sendungsinformation/#${encodeURIComponent(t)}`,
  gls: (t) => `https://gls-group.com/DE/de/paketverfolgung?match=${encodeURIComponent(t)}`,
  ups: (t) => `https://www.ups.com/track?loc=de_DE&tracknum=${encodeURIComponent(t)}`,
  fedex: (t) => `https://www.fedex.com/fedextrack/?trknbr=${encodeURIComponent(t)}`,
  amazon: () => `https://www.amazon.de/progress-tracker/package`,
  post: (t) => `https://www.deutschepost.de/sendung/simpleQueryResult.html?form.sendungsnummer=${encodeURIComponent(t)}`,
}

// Erkennt den Carrier grob anhand des Sendungsnummern-Formats (Fallback).
export function guessCarrierCode(tracking?: string | null): string | null {
  if (!tracking) return null
  const t = tracking.replace(/\s/g, '').toUpperCase()
  if (/^1Z[0-9A-Z]{16}$/.test(t)) return 'ups'
  if (/^JJD\d{10,}/.test(t) || /^\d{12,14}$/.test(t)) return 'dhl'
  if (/^\d{14}$/.test(t)) return 'dpd'
  if (/^TBA\d+/.test(t)) return 'amazon'
  return null
}

// Baut die Tracking-URL aus Carrier-Code + Sendungsnummer (oder null).
export function buildTrackingUrl(
  carrierCode?: string | null,
  tracking?: string | null
): string | null {
  if (!tracking) return null
  const code = (carrierCode || guessCarrierCode(tracking) || '').toLowerCase()
  const fn = CARRIER_URL[code]
  return fn ? fn(tracking) : null
}
