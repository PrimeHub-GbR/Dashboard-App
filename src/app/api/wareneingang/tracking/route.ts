import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { timingSafeEqual } from 'crypto'
import { createSupabaseServiceClient } from '@/lib/supabase-server'
import { normalizeTrackingStatus, TRACKING_STATUS_LABEL, buildTrackingUrl } from '@/lib/wareneingang'

// Tracking-Status-Update. Der Tracking-Aggregator (z. B. Ship24/AfterShip) sendet
// bei jeder Statusänderung einen Webhook → N8N normalisiert ihn → POSTet hierher.
// Auth via gemeinsamem Secret-Header (gleiches Secret wie /ingest).
const trackingSchema = z
  .object({
    // Match per Sendungsnummer ODER (Bestellnummer [+ supplier]) — mind. eins nötig.
    tracking_number: z.string().trim().min(3).max(120).optional(),
    order_number: z.string().trim().max(120).optional(),
    supplier: z.string().trim().max(80).optional(),
    status: z.string().trim().max(200).optional(),        // Klartext-Status vom Carrier
    status_code: z.string().trim().max(60).optional(),    // roher Aggregator-Code → wird normalisiert
    carrier: z.string().trim().max(60).optional(),
    carrier_code: z.string().trim().max(40).optional(),
    eta_date: z.string().trim().optional(),
    eta_text: z.string().trim().max(120).optional(),
    lieferadresse: z.string().trim().max(300).optional(),
    last_event_at: z.string().trim().optional(),
  })
  .refine((d) => !!d.tracking_number || !!d.order_number, {
    message: 'tracking_number oder order_number erforderlich',
  })

function secretsMatch(a: string, b: string): boolean {
  const bufA = Buffer.from(a)
  const bufB = Buffer.from(b)
  if (bufA.length !== bufB.length) return false
  return timingSafeEqual(bufA, bufB)
}

function normalizeDate(raw?: string): string | null {
  if (!raw) return null
  const s = raw.trim()
  const de = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/)
  if (de) return `${de[3]}-${de[2].padStart(2, '0')}-${de[1].padStart(2, '0')}`
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  return iso ? iso[0] : null
}

export async function POST(request: NextRequest) {
  const secret = process.env.WARENEINGANG_INGEST_SECRET
  if (!secret) {
    return NextResponse.json({ error: 'nicht konfiguriert' }, { status: 503 })
  }
  const provided = request.headers.get('x-ingest-secret')
  if (!provided || !secretsMatch(provided, secret)) {
    return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Ungültiges JSON' }, { status: 400 })
  }

  const parsed = trackingSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Ungültige Daten', details: parsed.error.flatten() },
      { status: 400 }
    )
  }
  const d = parsed.data
  const supabase = createSupabaseServiceClient()

  // Match: erst per Sendungsnummer, dann per (supplier +) Bestellnummer.
  let row: { id: string; status: string; carrier_code: string | null } | null = null
  if (d.tracking_number) {
    const { data: byT } = await supabase
      .from('wareneingang')
      .select('id, status, carrier_code')
      .eq('tracking_number', d.tracking_number)
      .maybeSingle()
    row = byT ?? null
  }
  if (!row && d.order_number) {
    let q = supabase
      .from('wareneingang')
      .select('id, status, carrier_code')
      .eq('order_number', d.order_number)
    if (d.supplier) q = q.eq('supplier', d.supplier)
    const { data: byO } = await q.order('created_at', { ascending: false }).limit(1)
    row = byO?.[0] ?? null
  }

  if (!row) {
    // Sendung noch nicht erfasst — kein Fehler (Webhook kann vor der Mail kommen).
    return NextResponse.json({ ok: true, ignored: 'tracking unbekannt' }, { status: 202 })
  }

  const code = normalizeTrackingStatus(d.status_code || d.status)
  const update: Record<string, unknown> = {
    tracking_last_checked: new Date().toISOString(),
  }
  if (d.status) update.tracking_status = d.status
  else if (code) update.tracking_status = TRACKING_STATUS_LABEL[code]
  if (code) update.tracking_status_code = code
  if (d.tracking_number) update.tracking_number = d.tracking_number
  if (d.lieferadresse) update.lieferadresse = d.lieferadresse
  if (d.carrier) update.carrier = d.carrier
  if (d.carrier_code) {
    update.carrier_code = d.carrier_code
    update.tracking_url = buildTrackingUrl(d.carrier_code, d.tracking_number)
  }
  if (d.eta_date) update.eta_date = normalizeDate(d.eta_date)
  if (d.eta_text) update.eta_text = d.eta_text
  if (d.last_event_at) {
    const t = new Date(d.last_event_at)
    if (!Number.isNaN(t.getTime())) update.tracking_last_event_at = t.toISOString()
  }

  // In-Transit-Codes heben den Eintrag auf 'unterwegs' (nie zurückstufen, nie 'empfangen' überschreiben).
  const inTransit = ['info_received', 'in_transit', 'out_for_delivery'].includes(code ?? '')
  if (inTransit && row.status === 'bestellt') update.status = 'unterwegs'

  const { error } = await supabase.from('wareneingang').update(update).eq('id', row.id)
  if (error) {
    console.error('Tracking-Update fehlgeschlagen:', error)
    return NextResponse.json({ error: 'DB-Fehler' }, { status: 500 })
  }
  return NextResponse.json({ ok: true, id: row.id, status_code: code })
}

// Offene Sendungen (für einen Aggregator-Poller, falls Webhooks nicht genutzt werden).
export async function GET(request: NextRequest) {
  const secret = process.env.WARENEINGANG_INGEST_SECRET
  if (!secret) return NextResponse.json({ error: 'nicht konfiguriert' }, { status: 503 })
  const provided = request.headers.get('x-ingest-secret')
  if (!provided || !secretsMatch(provided, secret)) {
    return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 })
  }

  const supabase = createSupabaseServiceClient()
  const { data, error } = await supabase
    .from('wareneingang')
    .select('id, tracking_number, carrier_code, tracking_status_code')
    .not('tracking_number', 'is', null)
    .neq('status', 'empfangen')
    .or('tracking_status_code.is.null,tracking_status_code.not.in.(delivered,expired)')
    .limit(500)

  if (error) return NextResponse.json({ error: 'DB-Fehler' }, { status: 500 })
  return NextResponse.json({ trackings: data ?? [] })
}
