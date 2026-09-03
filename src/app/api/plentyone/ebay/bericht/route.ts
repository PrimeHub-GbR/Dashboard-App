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

const berichtSchema = z.object({
  ok: z.boolean().optional(),
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

  return NextResponse.json({ ok: true, bericht: data }, { status: 201 })
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
