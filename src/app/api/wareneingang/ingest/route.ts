import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { timingSafeEqual } from 'crypto'
import { createSupabaseServiceClient } from '@/lib/supabase-server'
import { WARENEINGANG_BUCKET, buildTrackingUrl } from '@/lib/wareneingang'

// N8N parst eingehende Mails (Blank-Paletten ODER allgemeine Bestellungen/Versand
// von Amazon/eBay & Co.) und POSTet die extrahierten Felder hierher.
// Auth via gemeinsamem Secret-Header.
const ingestSchema = z.object({
  // palette: auftragsbestaetigung|lieferschein ; paket: bestellung|versand
  type: z.enum(['auftragsbestaetigung', 'lieferschein', 'bestellung', 'versand']),
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
  const isPaket = data.type === 'bestellung' || data.type === 'versand'

  if (isPaket) {
    return handlePaket(supabase, data)
  }
  return handlePalette(supabase, data)
}

type Supa = ReturnType<typeof createSupabaseServiceClient>
type Data = z.infer<typeof ingestSchema>

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
