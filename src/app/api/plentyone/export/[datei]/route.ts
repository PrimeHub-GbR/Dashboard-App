import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServiceClient } from '@/lib/supabase-server'
import { plentyoneTokenPruefen } from '@/lib/plentyone-token'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const RESULT_BUCKET = 'workflow-results'

/**
 * Wie lange nach dem Lauf PlentyONE die Artikel-/Eigenschaftsdaten noch abholen darf.
 * Über `PLENTYONE_EXPORT_FENSTER_TAGE` verstellbar, falls ein Rollout länger dauert.
 */
const FENSTER_TAGE = Number(process.env.PLENTYONE_EXPORT_FENSTER_TAGE) || 7

type Datei = 'artikel.csv' | 'eigenschaften.csv' | 'ebay-listings.csv' | 'ebay-merkmale.csv'

const AUS_LAUF: Record<string, 'csv_path' | 'eigenschaften_path'> = {
  'artikel.csv': 'csv_path',
  'eigenschaften.csv': 'eigenschaften_path',
}

const AUS_N8N: Record<string, { url?: string; name: string }> = {
  'ebay-listings.csv': { url: process.env.N8N_EBAY_LISTINGS_URL, name: 'ebay_listing_erstellung.csv' },
  'ebay-merkmale.csv': { url: process.env.N8N_EBAY_MERKMALE_URL, name: 'ebay_merkmale.csv' },
}

function csvAntwort(text: string, dateiname: string) {
  return new NextResponse(text, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `inline; filename="${dateiname}"`,
      'Cache-Control': 'no-store',
    },
  })
}

/**
 * Abhol-Endpunkt für die PlentyONE-Importe (Datenquelle „HTTPS / URL" + Zeitplan).
 *
 *   artikel.csv        Artikelimport      — aus dem letzten freigegebenen Lauf
 *   eigenschaften.csv  Eigenschaftsimport — aus dem letzten freigegebenen Lauf
 *   ebay-listings.csv  Import 23          — frisch aus n8n berechnet
 *   ebay-merkmale.csv  Import 22          — frisch aus n8n berechnet
 *
 * Die beiden eBay-Dateien werden bei JEDEM Abruf neu gerechnet: Import 23 sieht nur
 * Artikel ohne Listing, Import 22 nur bereits existierende MLIDs. Damit ist die Kette
 * beliebig oft wiederholbar und das Zwei-Lauf-Problem (MLID entsteht erst nach der
 * Listing-Anlage) löst sich von selbst.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ datei: string }> }
) {
  if (!plentyoneTokenPruefen(request)) {
    return NextResponse.json({ error: 'Nicht berechtigt' }, { status: 401 })
  }

  const { datei } = await params
  const name = datei as Datei

  // ---------------------------------------------------------------- eBay-CSVs
  if (name in AUS_N8N) {
    const ziel = AUS_N8N[name]
    if (!ziel.url) {
      return NextResponse.json(
        { error: `Webhook-URL fehlt (N8N_EBAY_${name === 'ebay-listings.csv' ? 'LISTINGS' : 'MERKMALE'}_URL)` },
        { status: 503 }
      )
    }
    try {
      const res = await fetch(ziel.url, {
        method: 'GET',
        headers: {
          Accept: 'text/csv, text/plain, */*',
          ...(process.env.N8N_EBAY_TOKEN ? { 'x-primehub-token': process.env.N8N_EBAY_TOKEN } : {}),
        },
        cache: 'no-store',
        signal: AbortSignal.timeout(55_000),
      })
      const text = await res.text()
      if (!res.ok) {
        // Bewusst ein Fehlerstatus: PlentyONE soll den Import abbrechen,
        // statt eine Fehlerseite als Datensatz einzulesen.
        return NextResponse.json(
          { error: `n8n antwortete ${res.status}`, details: text.slice(0, 300) },
          { status: 502 }
        )
      }
      return csvAntwort(text, ziel.name)
    } catch (e) {
      const m = e instanceof Error ? e.message : 'Netzwerkfehler'
      return NextResponse.json({ error: `n8n nicht erreichbar: ${m}` }, { status: 502 })
    }
  }

  // ------------------------------------------------- Artikel / Eigenschaften
  const feld = AUS_LAUF[name]
  if (!feld) {
    return NextResponse.json({ error: 'Unbekannte Datei' }, { status: 404 })
  }

  const svc = createSupabaseServiceClient()
  const { data: lauf } = await svc
    .from('plentyone_runs')
    .select('id, created_at, export_freigabe, csv_status, csv_path, eigenschaften_path')
    .eq('csv_status', 'success')
    .not(feld, 'is', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!lauf) return csvAntwort('', name)

  const { data: blob, error } = await svc.storage
    .from(RESULT_BUCKET)
    .download(lauf[feld] as string)

  if (error || !blob) {
    return NextResponse.json({ error: 'Datei nicht im Storage gefunden' }, { status: 404 })
  }

  const inhalt = await blob.text()

  const alter = Date.now() - new Date(lauf.created_at as string).getTime()
  const offen = lauf.export_freigabe === true && alter < FENSTER_TAGE * 86_400_000

  if (!offen) {
    // Fenster zu: nur die Kopfzeile. Der Import läuft ins Leere, statt beim
    // nächsten Zeitplan gepflegte PlentyONE-Daten erneut zu überschreiben.
    return csvAntwort(inhalt.split('\n')[0] ?? '', name)
  }

  await svc.rpc('plentyone_export_quittieren', { lauf: lauf.id })
  return csvAntwort(inhalt, name)
}
