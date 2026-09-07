import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase-server'
import { plentyoneTokenPruefen } from '@/lib/plentyone-token'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const eintrag = z.object({
  mlid: z.union([z.number(), z.string()]).optional(),
  item_id: z.union([z.number(), z.string()]).optional(),
  titel: z.string().max(300).optional(),
  grund: z.string().max(500).optional(),
})

/**
 * Hersteller aus PlentyONE. Der Artikelimport braucht die numerische ID — sein
 * Zielfeld lehnt den Verlagsnamen ab —, und vergeben werden die IDs von
 * PlentyONE. Der Migrationslauf kommt nicht an sie heran, der eBay-Knoten schon.
 */
const hersteller = z.object({
  name: z.string().min(1).max(300),
  id: z.union([z.number().int().positive(), z.string().regex(/^\d+$/)]),
})

const berichtSchema = z.object({
  ok: z.boolean().optional(),
  hersteller: z.array(hersteller).max(2000).optional(),
  zahlen: z.record(z.string(), z.number()).default({}),
  probleme: z.array(eintrag).max(500).default([]),
  uebersprungen: z.array(eintrag).max(500).default([]),
  text: z.string().max(20_000).optional(),
})

/** n8n meldet das Ergebnis der eBay-Kontrolle (verified-Status + Preis-Guard). */
export async function POST(request: NextRequest) {
  if (!plentyoneTokenPruefen(request)) {
    return NextResponse.json({ error: 'Nicht berechtigt' }, { status: 401 })
  }

  const body = await request.json().catch(() => null)
  const parsed = berichtSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Ungültiger Bericht', details: parsed.error.flatten() },
      { status: 400 }
    )
  }
  const d = parsed.data

  // Ein Bericht ist nur dann grün, wenn nichts fehlgeschlagen ist UND kein Listing
  // ohne Buchpreisbindungspreis dasteht — letzteres darf rechtlich nie live gehen.
  const ok =
    d.ok ??
    (d.probleme.length === 0 &&
      (d.zahlen.geprueft_fehler ?? 0) === 0 &&
      (d.zahlen.ohne_bpb_preis ?? 0) === 0)

  const svc = createSupabaseServiceClient()
  const { data, error } = await svc
    .from('plentyone_ebay_berichte')
    .insert({
      ok,
      zahlen: d.zahlen,
      probleme: d.probleme,
      uebersprungen: d.uebersprungen,
      text: d.text ?? null,
    })
    .select('id, erstellt_at')
    .single()

  if (error) {
    console.error('plentyone ebay bericht insert:', error)
    return NextResponse.json({ error: 'Bericht konnte nicht gespeichert werden' }, { status: 500 })
  }

  // Herstellerliste nachziehen, damit der naechste Migrationslauf die IDs kennt.
  // Scheitert das, ist der Bericht trotzdem gespeichert — er ist das Wichtigere,
  // und die Liste holt der uebernaechste Lauf nach.
  let herstellerGepflegt = 0
  if (d.hersteller?.length) {
    const zeilen = d.hersteller.map((h) => ({
      name: h.name.trim(),
      plenty_id: Number(h.id),
      gesehen_am: new Date().toISOString(),
    }))
    const { error: hError } = await svc
      .from('plentyone_hersteller_ids')
      .upsert(zeilen, { onConflict: 'name' })
    if (hError) console.error('plentyone hersteller_ids upsert:', hError)
    else herstellerGepflegt = zeilen.length
  }

  return NextResponse.json({ ok: true, bericht: data, hersteller: herstellerGepflegt },
    { status: 201 })
}

/** Die letzten Berichte für die Anzeige im Dashboard. */
export async function GET() {
  const auth = await createSupabaseServerClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Nicht authentifiziert' }, { status: 401 })

  const svc = createSupabaseServiceClient()
  const { data: rolle } = await svc
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)
    .single()
  if (rolle?.role !== 'admin' && rolle?.role !== 'manager') {
    return NextResponse.json({ error: 'Keine Berechtigung' }, { status: 403 })
  }

  const { data, error } = await svc
    .from('plentyone_ebay_berichte')
    .select('*')
    .order('erstellt_at', { ascending: false })
    .limit(5)

  if (error) {
    return NextResponse.json({ error: 'Berichte konnten nicht geladen werden' }, { status: 500 })
  }
  return NextResponse.json({ berichte: data ?? [] })
}
