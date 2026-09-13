import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase-server'

export const runtime = 'nodejs'

const SEITE = 100

/** admin und manager dürfen den Cover-Bestand sehen und pflegen. */
async function berechtigt() {
  const auth = await createSupabaseServerClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return null
  const svc = createSupabaseServiceClient()
  const { data: rolle } = await svc.from('user_roles').select('role').eq('user_id', user.id).single()
  return rolle?.role === 'admin' || rolle?.role === 'manager' ? svc : null
}

/**
 * GET /api/plentyone/cover?q=&nur_offen=1&seite=1
 * Cover-Bestand: eine Zeile je ISBN mit Ladezeitpunkt, Paket und
 * PlentyONE-Haken. Dazu die Zähler für die Kopfzeile.
 */
export async function GET(request: NextRequest) {
  const svc = await berechtigt()
  if (!svc) return NextResponse.json({ error: 'Keine Berechtigung' }, { status: 403 })

  const sp = request.nextUrl.searchParams
  const q = (sp.get('q') ?? '').trim().slice(0, 100)
  const nurOffen = sp.get('nur_offen') === '1'
  const seite = Math.max(1, parseInt(sp.get('seite') ?? '1', 10) || 1)

  let abfrage = svc
    .from('plentyone_cover')
    .select('isbn, titel, status, grund, paket, paket_pfad, run_id, geladen_am, plenty_hochgeladen_am', {
      count: 'exact',
    })
    .order('geladen_am', { ascending: false })
    .range((seite - 1) * SEITE, seite * SEITE - 1)

  if (q) {
    // PostgREST-Filterzeichen entschärfen, dann ISBN-Präfix oder Titelsuche
    const sicher = q.replace(/[%,()]/g, ' ').trim()
    abfrage = /^[0-9]{3,13}$/.test(sicher)
      ? abfrage.like('isbn', `${sicher}%`)
      : abfrage.ilike('titel', `%${sicher}%`)
  }
  if (nurOffen) abfrage = abfrage.eq('status', 'ok').is('plenty_hochgeladen_am', null)

  const [{ data: zeilen, count, error }, zaehler] = await Promise.all([
    abfrage,
    svc.rpc('plentyone_cover_zaehler'),
  ])
  if (error) {
    console.error('GET /api/plentyone/cover:', error)
    return NextResponse.json({ error: 'Bestand konnte nicht geladen werden' }, { status: 500 })
  }

  return NextResponse.json({
    zeilen: zeilen ?? [],
    gesamt: count ?? 0,
    seite,
    seiten_groesse: SEITE,
    zaehler: zaehler.data ?? { ok: 0, fehlt: 0, hochgeladen: 0 },
  })
}

const patchSchema = z.object({
  paket_pfad: z.string().min(1).max(500),
  hochgeladen: z.boolean().default(true),
})

/**
 * PATCH /api/plentyone/cover — ein ganzes ZIP-Paket als „in PlentyONE
 * hochgeladen" markieren (oder den Haken wieder entfernen).
 */
export async function PATCH(request: NextRequest) {
  const svc = await berechtigt()
  if (!svc) return NextResponse.json({ error: 'Keine Berechtigung' }, { status: 403 })

  const parsed = patchSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Ungültige Daten' }, { status: 400 })

  const { paket_pfad, hochgeladen } = parsed.data
  const { data, error } = await svc
    .from('plentyone_cover')
    .update({ plenty_hochgeladen_am: hochgeladen ? new Date().toISOString() : null })
    .eq('paket_pfad', paket_pfad)
    .eq('status', 'ok')
    .select('isbn')
  if (error) {
    console.error('PATCH /api/plentyone/cover:', error)
    return NextResponse.json({ error: 'Paket konnte nicht markiert werden' }, { status: 500 })
  }
  return NextResponse.json({ ok: true, betroffen: data?.length ?? 0 })
}
