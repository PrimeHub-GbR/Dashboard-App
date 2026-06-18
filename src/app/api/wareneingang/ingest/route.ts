import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { timingSafeEqual } from 'crypto'
import { createSupabaseServiceClient } from '@/lib/supabase-server'
import {
  WARENEINGANG_BUCKET,
  buildTrackingUrl,
  normalizeTrackingStatus,
  TRACKING_STATUS_LABEL,
} from '@/lib/wareneingang'

// N8N parst eingehende Mails (Blank-Paletten ODER allgemeine Bestellungen/Versand
// von Amazon/eBay & Co.) und POSTet die extrahierten Felder hierher.
// Auth via gemeinsamem Secret-Header.
const ingestSchema = z.object({
  // palette: auftragsbestaetigung|lieferschein ; paket: bestellung|versand
  // status_update: reine Status-Mail (versandt/zugestellt/verspätet …) zu einer
  // bereits erfassten Bestellung — aktualisiert nur den Sendungsstatus.
  type: z.enum([
    'auftragsbestaetigung',
    'lieferschein',
    'bestellung',
    'versand',
    'status_update',
  ]),
  supplier: z.string().trim().min(1).max(80).optional(),
  shop: z.string().trim().max(120).optional(),
  // Paletten-Felder (Blank)
  ab_nummer: z.string().trim().max(50).optional(),
  ab_datum: z.string().trim().optional(),
  ls_nummer: z.string().trim().max(50).optional(),
  ls_datum: z.string().trim().optional(),
  paletten_erwartet: z.coerce.number().int().min(0).max(999).optional(),
  nettogewicht_kg: z.coerce.number().min(0).max(1_000_000).optional(),
  // Paket-/Tracking-Felder (allgemein)
  order_number: z.string().trim().max(120).optional(),
  bestellt_am: z.string().trim().optional(),
  tracking_number: z.string().trim().max(120).optional(),
  carrier: z.string().trim().max(60).optional(),
  carrier_code: z.string().trim().max(40).optional(),
  tracking_url: z.string().trim().max(500).optional(),
  eta_date: z.string().trim().optional(),
  eta_text: z.string().trim().max(120).optional(),
  // Status-Klartext (für status_update / versand) — wird normalisiert.
  status_text: z.string().trim().max(200).optional(),
  status_code: z.string().trim().max(60).optional(),
  // Lieferadresse (wohin geliefert wird, z. B. "Rilkestr. 5", "Amazon Locker …")
  lieferadresse: z.string().trim().max(300).optional(),
  // Meta
  sender_email: z.string().trim().max(200).optional(),
  betreff: z.string().trim().max(300).optional(),
  gmail_message_id: z.string().trim().max(200).optional(),
  // Optional: PDF-Beleg (Paletten)
  pdf_base64: z.string().optional(),
  pdf_filename: z.string().trim().max(200).optional(),
})

// Status-Rangfolge — wir stufen nie zurueck.
const STATUS_RANK: Record<string, number> = { bestellt: 0, unterwegs: 1, empfangen: 2 }

function secretsMatch(a: string, b: string): boolean {
  const bufA = Buffer.from(a)
  const bufB = Buffer.from(b)
  if (bufA.length !== bufB.length) return false
  return timingSafeEqual(bufA, bufB)
}

// "01.06.2026" / "2026-06-01" → ISO-Datum (YYYY-MM-DD).
function normalizeDate(raw?: string): string | null {
  if (!raw) return null
  const s = raw.trim()
  const de = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/)
  if (de) {
    const [, d, m, y] = de
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
  }
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (iso) return iso[0]
  return null
}

function normalizeTimestamp(raw?: string): string | null {
  if (!raw) return null
  const iso = normalizeDate(raw)
  if (iso) return iso
  const d = new Date(raw)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

export async function POST(request: NextRequest) {
  const secret = process.env.WARENEINGANG_INGEST_SECRET
  if (!secret) {
    return NextResponse.json({ error: 'Wareneingang-Ingest nicht konfiguriert' }, { status: 503 })
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

  const parsed = ingestSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Ungültige Daten', details: parsed.error.flatten() },
      { status: 400 }
    )
  }

  const data = parsed.data
  const supabase = createSupabaseServiceClient()

  if (data.type === 'status_update') {
    return handleStatusUpdate(supabase, data)
  }
  const isPaket = data.type === 'bestellung' || data.type === 'versand'
  if (isPaket) {
    return handlePaket(supabase, data)
  }
  return handlePalette(supabase, data)
}

type Supa = ReturnType<typeof createSupabaseServiceClient>
type Data = z.infer<typeof ingestSchema>

// ---- Status-Update-Mails (Amazon & Co. "versandt/zugestellt/verspätet") -----
// Matching über Sendungsnummer ODER (shop/supplier + Bestellnummer) ODER
// shop + Betreff-Heuristik. Aktualisiert nur den Sendungsstatus eines
// bereits erfassten Eintrags — legt selbst nichts Neues an.
async function handleStatusUpdate(supabase: Supa, data: Data) {
  let target: { id: string; status: string; tracking_status_code: string | null } | null = null

  // 1) Sendungsnummer (stärkster Match).
  if (data.tracking_number) {
    const { data: byT } = await supabase
      .from('wareneingang')
      .select('id, status, tracking_status_code')
      .eq('tracking_number', data.tracking_number)
      .maybeSingle()
    target = byT ?? null
  }
  // 2) Bestellnummer (+ optional supplier).
  if (!target && data.order_number) {
    let q = supabase
      .from('wareneingang')
      .select('id, status, tracking_status_code')
      .eq('order_number', data.order_number)
    if (data.supplier) q = q.eq('supplier', data.supplier)
    const { data: byO } = await q
      .order('created_at', { ascending: false })
      .limit(1)
    target = byO?.[0] ?? null
  }
  // 3) Shop + Betreff-Heuristik (neuester offener Paket-Eintrag dieses Shops).
  if (!target && (data.shop || data.supplier)) {
    let q = supabase
      .from('wareneingang')
      .select('id, status, tracking_status_code')
      .eq('kind', 'paket')
      .neq('status', 'empfangen')
    if (data.supplier) q = q.eq('supplier', data.supplier)
    else if (data.shop) q = q.eq('shop', data.shop)
    const { data: byShop } = await q
      .order('created_at', { ascending: false })
      .limit(1)
    target = byShop?.[0] ?? null
  }

  if (!target) {
    // Bestellung (noch) nicht erfasst — kein Fehler, Status-Mail kann früh kommen.
    return NextResponse.json({ ok: true, ignored: 'kein passender Eintrag' }, { status: 202 })
  }

  const code = normalizeTrackingStatus(data.status_code || data.status_text)
  const update: Record<string, unknown> = {
    tracking_last_checked: new Date().toISOString(),
  }
  if (data.status_text) update.tracking_status = data.status_text
  else if (code) update.tracking_status = TRACKING_STATUS_LABEL[code]
  if (code) update.tracking_status_code = code
  if (data.tracking_number) update.tracking_number = data.tracking_number
  if (data.carrier) update.carrier = data.carrier
  if (data.carrier_code) {
    update.carrier_code = data.carrier_code
    const url = buildTrackingUrl(data.carrier_code, data.tracking_number)
    if (url) update.tracking_url = url
  }
  if (data.eta_date) update.eta_date = normalizeDate(data.eta_date)
  if (data.eta_text) update.eta_text = data.eta_text
  if (data.lieferadresse) update.lieferadresse = data.lieferadresse

  // In-Transit-Codes heben 'bestellt' auf 'unterwegs' (nie zurückstufen, 'empfangen' nie überschreiben).
  const inTransit = ['info_received', 'in_transit', 'out_for_delivery'].includes(code ?? '')
  if (inTransit && target.status === 'bestellt') update.status = 'unterwegs'

  const { error } = await supabase.from('wareneingang').update(update).eq('id', target.id)
  if (error) {
    console.error('Wareneingang Status-Update fehlgeschlagen:', error)
    return NextResponse.json({ error: 'DB-Fehler' }, { status: 500 })
  }
  return NextResponse.json({ ok: true, id: target.id, action: 'status_updated', status_code: code })
}

// ---- Pakete (Amazon, eBay & Co.) -------------------------------------------
async function handlePaket(supabase: Supa, data: Data) {
  const supplier = data.supplier ?? 'shop'
  const trackingUrl =
    data.tracking_url || buildTrackingUrl(data.carrier_code, data.tracking_number)

  const fields: Record<string, unknown> = {
    kind: 'paket',
    supplier,
    shop: data.shop ?? null,
    order_number: data.order_number ?? null,
    bestellt_am: normalizeTimestamp(data.bestellt_am),
    sender_email: data.sender_email ?? null,
    betreff: data.betreff ?? null,
  }
  if (data.tracking_number) fields.tracking_number = data.tracking_number
  if (data.carrier) fields.carrier = data.carrier
  if (data.carrier_code) fields.carrier_code = data.carrier_code
  if (trackingUrl) fields.tracking_url = trackingUrl
  if (data.eta_date) fields.eta_date = normalizeDate(data.eta_date)
  if (data.eta_text) fields.eta_text = data.eta_text
  if (data.lieferadresse) fields.lieferadresse = data.lieferadresse
  // Status-Klartext (z. B. aus Versandmail) übernehmen + normalisieren.
  const paketCode = normalizeTrackingStatus(data.status_code || data.status_text)
  if (data.status_text) fields.tracking_status = data.status_text
  else if (paketCode) fields.tracking_status = TRACKING_STATUS_LABEL[paketCode]
  if (paketCode) fields.tracking_status_code = paketCode
  if (data.gmail_message_id) {
    fields[data.type === 'versand' ? 'gmail_message_id_ls' : 'gmail_message_id_ab'] =
      data.gmail_message_id
  }

  // Bestehenden Eintrag finden: erst per Sendungsnummer, dann per (supplier, order_number).
  let target: { id: string; status: string } | null = null
  if (data.tracking_number) {
    const { data: byT } = await supabase
      .from('wareneingang')
      .select('id, status')
      .eq('tracking_number', data.tracking_number)
      .maybeSingle()
    target = byT ?? null
  }
  if (!target && data.order_number) {
    const { data: byO } = await supabase
      .from('wareneingang')
      .select('id, status')
      .eq('supplier', supplier)
      .eq('order_number', data.order_number)
      .maybeSingle()
    target = byO ?? null
  }

  // Versandmail hebt Status auf 'unterwegs'.
  if (data.type === 'versand') {
    if (!target || STATUS_RANK[target.status] < STATUS_RANK['unterwegs']) {
      fields.status = 'unterwegs'
    }
  }

  if (target) {
    const { error } = await supabase.from('wareneingang').update(fields).eq('id', target.id)
    if (error) {
      console.error('Wareneingang Paket-Update fehlgeschlagen:', error)
      return NextResponse.json({ error: 'DB-Fehler' }, { status: 500 })
    }
    return NextResponse.json({ ok: true, id: target.id, action: 'updated' })
  }

  const { data: inserted, error } = await supabase
    .from('wareneingang')
    .insert({ status: data.type === 'versand' ? 'unterwegs' : 'bestellt', ...fields })
    .select('id')
    .single()
  if (error) {
    console.error('Wareneingang Paket-Insert fehlgeschlagen:', error)
    return NextResponse.json({ error: 'DB-Fehler' }, { status: 500 })
  }
  return NextResponse.json({ ok: true, id: inserted.id, action: 'created' })
}

// ---- Paletten (Blank) ------------------------------------------------------
async function handlePalette(supabase: Supa, data: Data) {
  const supplier = data.supplier ?? 'blank'

  // Optional PDF-Beleg ablegen.
  let pdfPath: string | null = null
  if (data.pdf_base64) {
    try {
      const buffer = Buffer.from(data.pdf_base64, 'base64')
      const nummer = data.type === 'auftragsbestaetigung' ? data.ab_nummer : data.ls_nummer
      const prefix = data.type === 'auftragsbestaetigung' ? 'AB' : 'LS'
      const key = `${supplier}/${prefix}-${nummer ?? Date.now()}.pdf`
      const { error: uploadError } = await supabase.storage
        .from(WARENEINGANG_BUCKET)
        .upload(key, buffer, { contentType: 'application/pdf', upsert: true })
      if (uploadError) console.error('Wareneingang PDF-Upload fehlgeschlagen:', uploadError)
      else pdfPath = key
    } catch (err) {
      console.error('Wareneingang PDF-Verarbeitung fehlgeschlagen:', err)
    }
  }

  if (data.type === 'auftragsbestaetigung') {
    if (!data.ab_nummer) {
      return NextResponse.json({ error: 'ab_nummer fehlt' }, { status: 400 })
    }
    const { data: existing } = await supabase
      .from('wareneingang')
      .select('id')
      .eq('supplier', supplier)
      .eq('ab_nummer', data.ab_nummer)
      .maybeSingle()

    const fields: Record<string, unknown> = {
      kind: 'palette',
      supplier,
      ab_nummer: data.ab_nummer,
      ab_datum: normalizeDate(data.ab_datum),
      paletten_erwartet: data.paletten_erwartet ?? null,
      nettogewicht_kg: data.nettogewicht_kg ?? null,
    }
    if (pdfPath) fields.ab_pdf_path = pdfPath
    if (data.lieferadresse) fields.lieferadresse = data.lieferadresse
    if (data.gmail_message_id) fields.gmail_message_id_ab = data.gmail_message_id

    if (existing) {
      const { error } = await supabase.from('wareneingang').update(fields).eq('id', existing.id)
      if (error) return NextResponse.json({ error: 'DB-Fehler' }, { status: 500 })
      return NextResponse.json({ ok: true, id: existing.id, action: 'updated' })
    }
    const { data: inserted, error } = await supabase
      .from('wareneingang')
      .insert({ ...fields, status: 'bestellt' })
      .select('id')
      .single()
    if (error) return NextResponse.json({ error: 'DB-Fehler' }, { status: 500 })
    return NextResponse.json({ ok: true, id: inserted.id, action: 'created' })
  }

  // Lieferschein → an neueste offene Bestellung anhängen, sonst neu.
  let target: { id: string; status: string } | null = null
  if (data.ab_nummer) {
    const { data: byAb } = await supabase
      .from('wareneingang')
      .select('id, status')
      .eq('supplier', supplier)
      .eq('ab_nummer', data.ab_nummer)
      .maybeSingle()
    target = byAb ?? null
  }
  if (!target) {
    const { data: open } = await supabase
      .from('wareneingang')
      .select('id, status')
      .eq('supplier', supplier)
      .eq('kind', 'palette')
      .is('ls_nummer', null)
      .eq('status', 'bestellt')
      .order('created_at', { ascending: false })
      .limit(1)
    target = open?.[0] ?? null
  }

  const lsFields: Record<string, unknown> = {
    ls_nummer: data.ls_nummer ?? null,
    ls_datum: normalizeDate(data.ls_datum),
  }
  if (pdfPath) lsFields.ls_pdf_path = pdfPath
  if (data.lieferadresse) lsFields.lieferadresse = data.lieferadresse
  if (data.gmail_message_id) lsFields.gmail_message_id_ls = data.gmail_message_id

  if (target) {
    if (STATUS_RANK[target.status] < STATUS_RANK['unterwegs']) lsFields.status = 'unterwegs'
    const { error } = await supabase.from('wareneingang').update(lsFields).eq('id', target.id)
    if (error) return NextResponse.json({ error: 'DB-Fehler' }, { status: 500 })
    return NextResponse.json({ ok: true, id: target.id, action: 'matched' })
  }

  const { data: inserted, error } = await supabase
    .from('wareneingang')
    .insert({ kind: 'palette', supplier, status: 'unterwegs', ...lsFields })
    .select('id')
    .single()
  if (error) return NextResponse.json({ error: 'DB-Fehler' }, { status: 500 })
  return NextResponse.json({ ok: true, id: inserted.id, action: 'created_standalone' })
}
