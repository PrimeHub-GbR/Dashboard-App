import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase-server'
import { plentyoneTokenPruefen } from '@/lib/plentyone-token'
import { strangAnstossen, type StrangKey } from '@/lib/plentyone-strang'

export const runtime = 'nodejs'
export const maxDuration = 60

const MAX_BYTES = 50 * 1024 * 1024
const BEHALTEN = 3
const UPLOAD_BUCKET = 'workflow-uploads'
const RESULT_BUCKET = 'workflow-results'

const startSchema = z.object({
  zeilen_limit: z
    .union([z.coerce.number().int().min(1).max(100_000), z.literal('')])
    .optional()
    .transform((v) => (v === '' || v === undefined ? null : (v as number))),
  // Welche Straenge sofort starten. Der andere bleibt "pending" und kann
  // spaeter ueber /runs/[id]/strang nachgestartet werden.
  straenge: z.enum(['beide', 'csv', 'cover']).default('beide'),
})

/** admin und manager dürfen einen Lauf starten und sehen. */
async function rolleOderNull(userId: string) {
  const svc = createSupabaseServiceClient()
  const { data } = await svc.from('user_roles').select('role').eq('user_id', userId).single()
  const rolle = data?.role
  return rolle === 'admin' || rolle === 'manager' ? rolle : null
}

// GET /api/plentyone/runs — die letzten Läufe
export async function GET() {
  const auth = await createSupabaseServerClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Nicht authentifiziert' }, { status: 401 })

  if (!(await rolleOderNull(user.id))) {
    return NextResponse.json({ error: 'Keine Berechtigung' }, { status: 403 })
  }

  const svc = createSupabaseServiceClient()
  const { data, error } = await svc
    .from('plentyone_runs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(BEHALTEN)

  if (error) {
    return NextResponse.json({ error: 'Läufe konnten nicht geladen werden' }, { status: 500 })
  }
  return NextResponse.json({ runs: data ?? [] })
}

// POST /api/plentyone/runs — Amazon-Export hochladen und die gewählten Stränge starten
export async function POST(request: NextRequest) {
  try {
    // Zwei Wege herein, ein Ablauf dahinter:
    //   Mensch  — Login-Cookie, Rolle admin/manager (Upload im Dashboard)
    //   Maschine — x-primehub-token bzw. Bearer (n8n holt den Bericht per SP-API)
    // Der Lauf gehoert dann dem System-Benutzer, weil plentyone_runs.user_id auf
    // auth.users zeigt und NOT NULL ist.
    let userId: string
    if (plentyoneTokenPruefen(request)) {
      const systemUser = process.env.PLENTYONE_SYSTEM_USER_ID
      if (!systemUser) {
        return NextResponse.json(
          { error: 'PLENTYONE_SYSTEM_USER_ID ist nicht konfiguriert' },
          { status: 500 }
        )
      }
      userId = systemUser
    } else {
      const auth = await createSupabaseServerClient()
      const { data: { user } } = await auth.auth.getUser()
      if (!user) return NextResponse.json({ error: 'Nicht authentifiziert' }, { status: 401 })

      if (!(await rolleOderNull(user.id))) {
        return NextResponse.json(
          { error: 'Nur Geschäftsführung und Manager können einen Migrationslauf starten.' },
          { status: 403 }
        )
      }
      userId = user.id
    }

    const svc = createSupabaseServiceClient()

    // Die VLB erlaubt nur 2 gleichzeitige Sessions — ein Lauf belegt beide.
    const { data: aktiv } = await svc.rpc('plentyone_lauf_aktiv')
    if (aktiv === true) {
      return NextResponse.json(
        {
          error:
            'Es läuft bereits eine Migration. Die VLB erlaubt nur zwei gleichzeitige Sitzungen — ein Lauf belegt beide. Bitte warte, bis der laufende Vorgang fertig ist.',
        },
        { status: 409 }
      )
    }

    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const parsed = startSchema.safeParse({
      zeilen_limit: formData.get('zeilen_limit') ?? '',
      straenge: formData.get('straenge') ?? 'beide',
    })
    if (!parsed.success) {
      return NextResponse.json({ error: 'Ungültige Zeilenbegrenzung oder Strangauswahl' }, { status: 400 })
    }
    const zeilenLimit = parsed.data.zeilen_limit
    const gewaehlt: StrangKey[] =
      parsed.data.straenge === 'beide' ? ['csv', 'cover'] : [parsed.data.straenge]

    if (!file) {
      return NextResponse.json({ error: 'Bitte den Amazon-Export auswählen' }, { status: 400 })
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: 'Datei darf maximal 50 MB groß sein' }, { status: 400 })
    }
    if (!/\.(txt|csv|tsv)$/i.test(file.name)) {
      return NextResponse.json(
        { error: 'Erwartet wird der Amazon-Bericht als .txt (Tab-getrennt) oder .csv' },
        { status: 400 }
      )
    }

    // --- Aufbewahrung: nur die 3 neuesten Läufe, ältere samt Dateien entfernen ---
    const { data: entfernt } = await svc.rpc('plentyone_retention', { behalten: BEHALTEN - 1 })
    for (const alt of (entfernt ?? []) as Array<{
      geloescht: string
      input_path: string | null
      csv_path: string | null
      cover_pakete: Array<{ datei?: string }> | null
    }>) {
      if (alt.input_path) {
        await svc.storage.from(UPLOAD_BUCKET).remove([alt.input_path]).catch(() => {})
      }
      // Cover-ZIPs liegen seit 13.09.2026 run-unabhängig unter plentyone/cover/
      // und gehören zum Bestand (plentyone_cover) — die bleiben. Gelöscht wird
      // nur, was im Ordner des Laufs liegt.
      const imLaufordner = (pfad: string) => pfad.startsWith(`plentyone/${alt.geloescht}/`)
      const ergebnisse = [
        ...(alt.csv_path ? [alt.csv_path] : []),
        ...((alt.cover_pakete ?? []).map((p) => p?.datei).filter(Boolean) as string[]),
      ].filter(imLaufordner)
      if (ergebnisse.length) {
        await svc.storage.from(RESULT_BUCKET).remove(ergebnisse).catch(() => {})
      }
    }

    // --- Lauf anlegen (id ist zugleich der Storage-Ordner) ---
    const { data: run, error: insertError } = await svc
      .from('plentyone_runs')
      .insert({
        user_id: userId,
        input_path: 'wird-gleich-gesetzt',
        input_name: file.name,
        zeilen_limit: zeilenLimit,
        csv_status: gewaehlt.includes('csv') ? 'running' : 'pending',
        cover_status: gewaehlt.includes('cover') ? 'running' : 'pending',
      })
      .select()
      .single()

    if (insertError || !run) {
      return NextResponse.json(
        { error: `Lauf konnte nicht angelegt werden: ${insertError?.message ?? ''}` },
        { status: 500 }
      )
    }

    const sauber = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const inputPath = `plentyone/${run.id}/${sauber}`

    // Ohne charset-Zusatz: Supabase vergleicht den Content-Type gegen die
    // allowed_mime_types des Buckets und akzeptiert "text/plain; charset=utf-8" nicht.
    const contentType = /\.csv$/i.test(file.name)
      ? 'text/csv'
      : /\.tsv$/i.test(file.name)
        ? 'text/tab-separated-values'
        : 'text/plain'

    const { error: uploadError } = await svc.storage
      .from(UPLOAD_BUCKET)
      .upload(inputPath, Buffer.from(await file.arrayBuffer()), {
        contentType,
        upsert: true,
      })

    if (uploadError) {
      await svc.from('plentyone_runs').delete().eq('id', run.id)
      return NextResponse.json(
        { error: `Upload fehlgeschlagen: ${uploadError.message}` },
        { status: 500 }
      )
    }

    await svc.from('plentyone_runs').update({ input_path: inputPath }).eq('id', run.id)

    // --- Gewählte Stränge parallel anstoßen ---
    const koerper = {
      run_id: run.id,
      input_file_path: inputPath,
      callback_url: `${request.nextUrl.origin}/api/plentyone/runs/${run.id}/callback`,
      limit: zeilenLimit,
    }

    const ergebnisse = await Promise.all(
      gewaehlt.map(async (key) => ({ key, fehler: await strangAnstossen(key, koerper) }))
    )

    const fehlgeschlagen = ergebnisse.filter((r) => r.fehler)
    if (fehlgeschlagen.length) {
      const patch: Record<string, unknown> = {}
      for (const f of fehlgeschlagen) {
        patch[`${f.key}_status`] = 'failed'
        patch[`${f.key}_error`] = f.fehler
      }
      await svc.from('plentyone_runs').update(patch).eq('id', run.id)
    }

    const { data: aktuell } = await svc
      .from('plentyone_runs')
      .select('*')
      .eq('id', run.id)
      .single()

    return NextResponse.json({ run: aktuell ?? run }, { status: 201 })
  } catch (err) {
    console.error('POST /api/plentyone/runs:', err)
    return NextResponse.json({ error: 'Interner Serverfehler' }, { status: 500 })
  }
}
