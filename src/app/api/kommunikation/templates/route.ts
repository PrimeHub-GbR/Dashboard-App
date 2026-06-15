import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createSupabaseServiceClient } from '@/lib/supabase-server'
import { requireChefUser, countTemplateVars } from '@/lib/kommunikation-server'

const createSchema = z.object({
  name: z
    .string()
    .regex(/^[a-z0-9_]{3,512}$/, 'Name: nur Kleinbuchstaben, Ziffern und Unterstriche'),
  display_name: z.string().max(120).optional().nullable(),
  category: z.enum(['UTILITY', 'MARKETING']).default('UTILITY'),
  language: z.string().min(2).max(10).default('de'),
  body_text: z.string().min(1, 'Text darf nicht leer sein').max(1024),
  example_values: z.array(z.string()).default([]),
})

// GET — alle Vorlagen (neueste zuerst)
export async function GET() {
  const user = await requireChefUser()
  if (!user) return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 })

  const service = createSupabaseServiceClient()
  const { data, error } = await service
    .from('whatsapp_templates')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: 'Fehler beim Laden' }, { status: 500 })
  return NextResponse.json({ templates: data ?? [] })
}

// POST — neue Vorlage anlegen + bei Meta einreichen (via N8N)
export async function POST(req: NextRequest) {
  const user = await requireChefUser()
  if (!user) return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 })

  const webhookUrl = process.env.N8N_WHATSAPP_TEMPLATE_WEBHOOK_URL
  if (!webhookUrl) {
    return NextResponse.json({ error: 'Template-Workflow nicht konfiguriert' }, { status: 503 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Ungültiger JSON-Body' }, { status: 400 })
  }

  const parsed = createSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const { name, display_name, category, language, body_text, example_values } = parsed.data
  const varCount = countTemplateVars(body_text)

  // Meta-Regel: ein Platzhalter darf nicht ganz am Anfang oder Ende stehen.
  const trimmedBody = body_text.trim()
  if (/^\{\{\d+\}\}/.test(trimmedBody) || /\{\{\d+\}\}$/.test(trimmedBody)) {
    return NextResponse.json(
      {
        error:
          'Ein Platzhalter ({{…}}) darf nicht am Anfang oder Ende der Vorlage stehen. Bitte mit Text umrahmen (z. B. „Hallo {{1}}, …").',
      },
      { status: 400 }
    )
  }

  // Platzhalter und Beispielwerte muessen zusammenpassen (Meta verlangt Beispiele).
  if (example_values.length !== varCount) {
    return NextResponse.json(
      {
        error: `Es gibt ${varCount} Platzhalter ({{1}}…{{${varCount}}}), aber ${example_values.length} Beispielwert(e). Bitte für jeden Platzhalter genau einen Beispielwert angeben.`,
      },
      { status: 400 }
    )
  }
  if (varCount > 0 && example_values.some((v) => !v.trim())) {
    return NextResponse.json({ error: 'Beispielwerte dürfen nicht leer sein.' }, { status: 400 })
  }

  const service = createSupabaseServiceClient()

  const { data: row, error: insertError } = await service
    .from('whatsapp_templates')
    .insert({
      name,
      display_name: display_name ?? null,
      category,
      language,
      body_text,
      variables_count: varCount,
      example_values,
      status: 'LOCAL_PENDING',
      created_by: user.id,
    })
    .select()
    .single()

  if (insertError || !row) {
    const dup = insertError?.code === '23505'
    return NextResponse.json(
      { error: dup ? 'Eine Vorlage mit diesem Namen existiert bereits.' : 'Anlegen fehlgeschlagen' },
      { status: dup ? 409 : 500 }
    )
  }

  // Bei Meta einreichen (via N8N). Antwort/Status kommt asynchron per Callback.
  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'create',
        template_id: row.id,
        name,
        language,
        category,
        body_text,
        example_values,
      }),
    })
    if (!res.ok) {
      await service
        .from('whatsapp_templates')
        .update({ status: 'ERROR', status_detail: `N8N-Fehler: HTTP ${res.status}` })
        .eq('id', row.id)
      return NextResponse.json(
        { template: { ...row, status: 'ERROR' }, warning: 'Bei Meta-Einreichung fehlgeschlagen' },
        { status: 200 }
      )
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unbekannter Fehler'
    await service
      .from('whatsapp_templates')
      .update({ status: 'ERROR', status_detail: `N8N nicht erreichbar: ${msg}` })
      .eq('id', row.id)
    return NextResponse.json(
      { template: { ...row, status: 'ERROR' }, warning: 'N8N nicht erreichbar' },
      { status: 200 }
    )
  }

  return NextResponse.json({ template: row }, { status: 201 })
}
