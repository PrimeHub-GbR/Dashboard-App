import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { timingSafeEqual } from 'crypto'
import { createSupabaseServiceClient } from '@/lib/supabase-server'

export const WARENEINGANG_BUCKET = 'wareneingang-belege'

// N8N parst die Blank-Mails (Auftragsbestaetigung / Lieferschein) und POSTet die
// extrahierten Felder hierher. Auth via gemeinsamem Secret-Header.
const ingestSchema = z.object({
  type: z.enum(['auftragsbestaetigung', 'lieferschein']),
  supplier: z.string().trim().min(1).max(50).optional(),
  ab_nummer: z.string().trim().max(50).optional(),
  ab_datum: z.string().trim().optional(),
  ls_nummer: z.string().trim().max(50).optional(),
  ls_datum: z.string().trim().optional(),
  paletten_erwartet: z.coerce.number().int().min(0).max(999).optional(),
  nettogewicht_kg: z.coerce.number().min(0).max(1_000_000).optional(),
  gmail_message_id: z.string().trim().max(200).optional(),
  // Optional: PDF-Beleg als Base64 — wird in Supabase Storage abgelegt.
  pdf_base64: z.string().optional(),
  pdf_filename: z.string().trim().max(200).optional(),
})

// Status-Rangfolge — wir stufen nie zurueck.
const STATUS_RANK: Record<string, number> = {
  bestellt: 0,
  unterwegs: 1,
  empfangen: 2,
}

function secretsMatch(a: string, b: string): boolean {
  const bufA = Buffer.from(a)
  const bufB = Buffer.from(b)
  if (bufA.length !== bufB.length) return false
  return timingSafeEqual(bufA, bufB)
}

// Normalisiert "01.06.2026" oder "2026-06-01" zu ISO-Datum (YYYY-MM-DD).
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

export async function POST(request: NextRequest) {
  const secret = process.env.WARENEINGANG_INGEST_SECRET
  if (!secret) {
    return NextResponse.json(
      { error: 'Wareneingang-Ingest nicht konfiguriert' },
      { status: 503 }
    )
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
  const supplier = data.supplier ?? 'blank'
  const supabase = createSupabaseServiceClient()

  // 1. Optional PDF-Beleg ablegen.
  let pdfPath: string | null = null
  if (data.pdf_base64) {
    try {
      const buffer = Buffer.from(data.pdf_base64, 'base64')
      const nummer = data.type === 'auftragsbestaetigung' ? data.ab_nummer : data.ls_nummer
      const prefix = data.type === 'auftragsbestaetigung' ? 'AB' : 'LS'
      const fileName = `${prefix}-${nummer ?? Date.now()}.pdf`
      const key = `${supplier}/${fileName}`
      const { error: uploadError } = await supabase.storage
        .from(WARENEINGANG_BUCKET)
        .upload(key, buffer, { contentType: 'application/pdf', upsert: true })
      if (uploadError) {
        console.error('Wareneingang PDF-Upload fehlgeschlagen:', uploadError)
      } else {
        pdfPath = key
      }
    } catch (err) {
      console.error('Wareneingang PDF-Verarbeitung fehlgeschlagen:', err)
    }
  }

  // 2. Auftragsbestaetigung → Upsert per (supplier, ab_nummer).
  if (data.type === 'auftragsbestaetigung') {
    if (!data.ab_nummer) {
      return NextResponse.json(
        { error: 'ab_nummer fehlt für Auftragsbestätigung' },
        { status: 400 }
      )
    }

    const { data: existing } = await supabase
      .from('wareneingang')
      .select('id, status')
      .eq('supplier', supplier)
      .eq('ab_nummer', data.ab_nummer)
      .maybeSingle()

    const fields: Record<string, unknown> = {
      supplier,
      ab_nummer: data.ab_nummer,
      ab_datum: normalizeDate(data.ab_datum),
      paletten_erwartet: data.paletten_erwartet ?? null,
      nettogewicht_kg: data.nettogewicht_kg ?? null,
    }
    if (pdfPath) fields.ab_pdf_path = pdfPath
    if (data.gmail_message_id) fields.gmail_message_id_ab = data.gmail_message_id

    if (existing) {
      // Status nur halten/anheben (nicht zurückstufen).
      const { error } = await supabase
        .from('wareneingang')
        .update(fields)
        .eq('id', existing.id)
      if (error) {
        console.error('Wareneingang AB-Update fehlgeschlagen:', error)
        return NextResponse.json({ error: 'DB-Fehler' }, { status: 500 })
      }
      return NextResponse.json({ ok: true, id: existing.id, action: 'updated' })
    }

    const { data: inserted, error } = await supabase
      .from('wareneingang')
      .insert({ ...fields, status: 'bestellt' })
      .select('id')
      .single()
    if (error) {
      console.error('Wareneingang AB-Insert fehlgeschlagen:', error)
      return NextResponse.json({ error: 'DB-Fehler' }, { status: 500 })
    }
    return NextResponse.json({ ok: true, id: inserted.id, action: 'created' })
  }

  // 3. Lieferschein → passende offene Bestellung finden, sonst neuen Eintrag.
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
    // Heuristik: neueste Bestellung dieses Lieferanten ohne Lieferschein.
    const { data: open } = await supabase
      .from('wareneingang')
      .select('id, status')
      .eq('supplier', supplier)
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
    if (STATUS_RANK[target.status] < STATUS_RANK['unterwegs']) {
      lsFields.status = 'unterwegs'
    }
    const { error } = await supabase
      .from('wareneingang')
      .update(lsFields)
      .eq('id', target.id)
    if (error) {
      console.error('Wareneingang LS-Update fehlgeschlagen:', error)
      return NextResponse.json({ error: 'DB-Fehler' }, { status: 500 })
    }
    return NextResponse.json({ ok: true, id: target.id, action: 'matched' })
  }

  const { data: inserted, error } = await supabase
    .from('wareneingang')
    .insert({ supplier, status: 'unterwegs', ...lsFields })
    .select('id')
    .single()
  if (error) {
    console.error('Wareneingang LS-Insert fehlgeschlagen:', error)
    return NextResponse.json({ error: 'DB-Fehler' }, { status: 500 })
  }
  return NextResponse.json({ ok: true, id: inserted.id, action: 'created_standalone' })
}
