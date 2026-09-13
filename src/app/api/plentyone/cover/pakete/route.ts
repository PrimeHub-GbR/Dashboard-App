import { NextResponse } from 'next/server'
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase-server'

export const runtime = 'nodejs'

const RESULT_BUCKET = 'workflow-results'
const GUELTIG_SEK = 600

/**
 * GET /api/plentyone/cover/pakete — alle ZIP-Pakete des Cover-Bestands mit
 * signierten Download-Links (10 Minuten gültig). Grundlage für "Alle Cover
 * herunterladen": der Browser lädt die Pakete nacheinander.
 */
export async function GET() {
  const auth = await createSupabaseServerClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Nicht authentifiziert' }, { status: 401 })

  const svc = createSupabaseServiceClient()
  const { data: rolle } = await svc.from('user_roles').select('role').eq('user_id', user.id).single()
  if (rolle?.role !== 'admin' && rolle?.role !== 'manager') {
    return NextResponse.json({ error: 'Keine Berechtigung' }, { status: 403 })
  }

  const { data: pakete, error } = await svc.rpc('plentyone_cover_pakete')
  if (error) {
    console.error('GET /api/plentyone/cover/pakete:', error)
    return NextResponse.json({ error: 'Pakete konnten nicht geladen werden' }, { status: 500 })
  }

  const liste = (pakete ?? []) as Array<{
    paket: string; paket_pfad: string; cover: number; hochgeladen: number; geladen_am: string
  }>
  if (!liste.length) return NextResponse.json({ pakete: [], gueltig_sekunden: GUELTIG_SEK })

  const { data: signed, error: signError } = await svc.storage
    .from(RESULT_BUCKET)
    .createSignedUrls(liste.map((p) => p.paket_pfad), GUELTIG_SEK, { download: true })
  if (signError || !signed) {
    return NextResponse.json({ error: 'Download-Links konnten nicht erzeugt werden' }, { status: 500 })
  }
  const urlNachPfad = new Map(signed.map((s) => [s.path, s.signedUrl]))

  return NextResponse.json({
    gueltig_sekunden: GUELTIG_SEK,
    pakete: liste.map((p) => ({
      ...p,
      dateiname: p.paket_pfad.split('/').pop() ?? p.paket,
      url: urlNachPfad.get(p.paket_pfad) ?? null,
    })),
  })
}
