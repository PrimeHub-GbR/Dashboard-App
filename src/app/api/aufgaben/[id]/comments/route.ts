import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase-server'

// Kommentar-Thread einer Aufgabe (task_comments, Mig 051/053).
// Service-Role mit Auth-Check — Web-Nutzer sind ausschliesslich Admin/Manager.
// author_name wird beim POST denormalisiert gesetzt (wie die App es tut),
// damit Mitarbeitende in der App sehen, von wem der Kommentar stammt.

const BUCKET = 'task-attachments'
const SIGNED_URL_TTL = 3600 // 1 Stunde

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const MAX_IMAGE_BYTES = 10 * 1024 * 1024 // 10 MB
const IMAGE_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/heic': 'heic',
}

interface CommentRow {
  id: string
  task_id: string
  body: string | null
  image_path: string | null
  created_at: string
  author_name: string | null
}

async function requireAuth() {
  const supabase = await createSupabaseServerClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return null
  return user
}

/** Signierte URL für ein Kommentar-Bild (privater Bucket). */
async function signImageUrl(
  service: ReturnType<typeof createSupabaseServiceClient>,
  path: string | null,
): Promise<string | null> {
  if (!path) return null
  const { data } = await service.storage.from(BUCKET).createSignedUrl(path, SIGNED_URL_TTL)
  return data?.signedUrl ?? null
}

async function toCommentJson(
  service: ReturnType<typeof createSupabaseServiceClient>,
  row: CommentRow,
) {
  return {
    id: row.id,
    task_id: row.task_id,
    body: row.body,
    author_name: row.author_name,
    created_at: row.created_at,
    image_url: await signImageUrl(service, row.image_path),
  }
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireAuth()
  if (!user) return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 })

  const { id } = await params
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: 'Ungültige Aufgaben-ID' }, { status: 400 })
  }

  const service = createSupabaseServiceClient()
  const { data, error } = await service
    .from('task_comments')
    .select('id, task_id, body, image_path, created_at, author_name')
    .eq('task_id', id)
    .order('created_at', { ascending: true })
    .limit(500)

  if (error) return NextResponse.json({ error: 'Datenbankfehler' }, { status: 500 })

  const comments = await Promise.all(
    ((data ?? []) as CommentRow[]).map((row) => toCommentJson(service, row))
  )

  return NextResponse.json({ comments })
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireAuth()
  if (!user) return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 })

  const { id } = await params
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: 'Ungültige Aufgaben-ID' }, { status: 400 })
  }

  // Text + optionales Bild: multipart/form-data (body + image) ODER JSON { body }.
  let bodyText: string | null = null
  let image: File | null = null

  const contentType = req.headers.get('content-type') ?? ''
  if (contentType.includes('multipart/form-data')) {
    let form: FormData
    try { form = await req.formData() } catch {
      return NextResponse.json({ error: 'Ungültiges Formular' }, { status: 400 })
    }
    const rawBody = form.get('body')
    bodyText = typeof rawBody === 'string' ? rawBody.trim() : null
    const rawImage = form.get('image')
    image = rawImage instanceof File && rawImage.size > 0 ? rawImage : null
  } else {
    try {
      const json = await req.json() as { body?: unknown }
      bodyText = typeof json.body === 'string' ? json.body.trim() : null
    } catch {
      return NextResponse.json({ error: 'Ungültiger JSON-Body' }, { status: 400 })
    }
  }

  if ((!bodyText || bodyText.length === 0) && !image) {
    return NextResponse.json({ error: 'Kommentar oder Bild erforderlich' }, { status: 400 })
  }
  if (bodyText && bodyText.length > 4000) {
    return NextResponse.json({ error: 'Kommentar zu lang (max. 4000 Zeichen)' }, { status: 400 })
  }
  if (image) {
    if (image.size > MAX_IMAGE_BYTES) {
      return NextResponse.json({ error: 'Bild zu gross (max. 10 MB)' }, { status: 400 })
    }
    if (!IMAGE_EXT[image.type]) {
      return NextResponse.json({ error: 'Nur Bilder (JPG, PNG, GIF, WebP, HEIC) erlaubt' }, { status: 400 })
    }
  }

  const service = createSupabaseServiceClient()

  // Aufgabe muss existieren.
  const { data: task } = await service.from('tasks').select('id').eq('id', id).maybeSingle()
  if (!task) return NextResponse.json({ error: 'Aufgabe nicht gefunden' }, { status: 404 })

  // Autor denormalisieren (wie App: employees.auth_user_id -> name, sonst E-Mail).
  const { data: employee } = await service
    .from('employees')
    .select('id, name')
    .eq('auth_user_id', user.id)
    .maybeSingle()

  const authorName = employee?.name ?? user.email ?? null

  // Optionales Bild in den privaten Bucket hochladen (Pfad-Schema wie die App).
  let imagePath: string | null = null
  if (image) {
    imagePath = `${id}/${Date.now()}.${IMAGE_EXT[image.type]}`
    const bytes = new Uint8Array(await image.arrayBuffer())
    const { error: uploadError } = await service.storage
      .from(BUCKET)
      .upload(imagePath, bytes, { contentType: image.type, upsert: true })
    if (uploadError) {
      return NextResponse.json({ error: 'Bild-Upload fehlgeschlagen' }, { status: 500 })
    }
  }

  const { data: inserted, error: insertError } = await service
    .from('task_comments')
    .insert({
      task_id: id,
      author_employee_id: employee?.id ?? null,
      author_name: authorName,
      body: bodyText && bodyText.length > 0 ? bodyText : null,
      image_path: imagePath,
    })
    .select('id, task_id, body, image_path, created_at, author_name')
    .single()

  if (insertError || !inserted) {
    return NextResponse.json({ error: 'Fehler beim Speichern' }, { status: 500 })
  }

  return NextResponse.json(
    { comment: await toCommentJson(service, inserted as CommentRow) },
    { status: 201 }
  )
}
