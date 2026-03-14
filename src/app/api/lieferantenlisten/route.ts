import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import {
  createSupabaseServerClient,
  createSupabaseServiceClient,
} from '@/lib/supabase-server'

const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024 // 50 MB

const ACCEPTED_MIME_TYPES = [
  'text/csv',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // xlsx
  'application/vnd.ms-excel', // xls
]

const lieferantSchema = z.enum(['blank', 'a43-kulturgut', 'avus'])
const listendatumSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Ungültiges Datumsformat (YYYY-MM-DD)')

// POST /api/lieferantenlisten — Upload a supplier list file
export async function POST(request: NextRequest) {
  try {
    // 1. Authenticate user via cookies (SSR client)
    const supabaseAuth = await createSupabaseServerClient()
    const {
      data: { user },
      error: authError,
    } = await supabaseAuth.auth.getUser()

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Nicht authentifiziert' },
        { status: 401 }
      )
    }

    // 2. Parse FormData
    const formData = await request.formData()
    const rawLieferant = formData.get('lieferant')
    const rawListendatum = formData.get('listendatum')
    const file = formData.get('file') as File | null

    // 3. Validate lieferant
    const lieferantResult = lieferantSchema.safeParse(rawLieferant)
    if (!lieferantResult.success) {
      return NextResponse.json(
        { error: 'Ungültiger Lieferant. Erlaubt: blank, a43-kulturgut, avus' },
        { status: 400 }
      )
    }
    const lieferant = lieferantResult.data

    // 4. Validate listendatum
    const datumResult = listendatumSchema.safeParse(rawListendatum)
    if (!datumResult.success) {
      return NextResponse.json(
        { error: 'Ungültiges Listendatum. Format: YYYY-MM-DD' },
        { status: 400 }
      )
    }
    const listendatum = datumResult.data

    // Verify it's actually a valid date (not e.g. 2026-02-30)
    const parsedDate = new Date(listendatum)
    if (isNaN(parsedDate.getTime())) {
      return NextResponse.json(
        { error: 'Ungültiges Datum' },
        { status: 400 }
      )
    }

    // 5. Validate file
    if (!file) {
      return NextResponse.json(
        { error: 'Datei wird benötigt' },
        { status: 400 }
      )
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      return NextResponse.json(
        { error: 'Datei darf maximal 50 MB groß sein' },
        { status: 400 }
      )
    }

    if (!ACCEPTED_MIME_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: `Ungültiger Dateityp: ${file.type}. Erlaubt: CSV, XLSX, XLS` },
        { status: 400 }
      )
    }

    // 6. Service role client for storage + DB operations
    const supabase = createSupabaseServiceClient()

    // 7. Upload file to Supabase Storage
    const timestamp = Date.now()
    const sanitizedName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const filePath = `${user.id}/${timestamp}-${sanitizedName}`

    const fileBuffer = Buffer.from(await file.arrayBuffer())
    const { error: uploadError } = await supabase.storage
      .from('lieferantenlisten')
      .upload(filePath, fileBuffer, {
        contentType: file.type,
        upsert: false,
      })

    if (uploadError) {
      return NextResponse.json(
        { error: `Upload fehlgeschlagen: ${uploadError.message}` },
        { status: 500 }
      )
    }

    // 8. Insert record into lieferantenlisten table
    const { data: entry, error: insertError } = await supabase
      .from('lieferantenlisten')
      .insert({
        lieferant,
        filename: file.name,
        file_path: filePath,
        listendatum,
        uploaded_by: user.id,
      })
      .select()
      .single()

    if (insertError || !entry) {
      return NextResponse.json(
        { error: `Eintrag konnte nicht erstellt werden: ${insertError?.message}` },
        { status: 500 }
      )
    }

    // 9. Trigger N8N workflow in the background (fire-and-forget)
    const n8nWebhookBase = process.env.N8N_WEBHOOK_BASE_URL
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://dashboard.primehubgbr.com'
    if (n8nWebhookBase) {
      const payload = {
        entry_id: entry.id,
        lieferant,
        file_path: filePath,
        callback_url: `${appUrl}/api/lieferantenlisten/${entry.id}/callback`,
      }
      fetch(`${n8nWebhookBase}/lieferantenlisten-${lieferant}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }).catch((err) => {
        console.error('N8N trigger failed (non-blocking):', err)
      })
    }

    return NextResponse.json(entry, { status: 201 })
  } catch (err) {
    console.error('POST /api/lieferantenlisten error:', err)
    return NextResponse.json(
      { error: 'Interner Serverfehler' },
      { status: 500 }
    )
  }
}

// GET /api/lieferantenlisten — List all entries for the authenticated user
export async function GET() {
  try {
    // 1. Authenticate user via cookies (SSR client)
    const supabaseAuth = await createSupabaseServerClient()
    const {
      data: { user },
      error: authError,
    } = await supabaseAuth.auth.getUser()

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Nicht authentifiziert' },
        { status: 401 }
      )
    }

    // 2. Service role client for DB query
    const supabase = createSupabaseServiceClient()

    // 3. Query entries ordered by listendatum DESC, created_at DESC
    const { data: entries, error: queryError } = await supabase
      .from('lieferantenlisten')
      .select('*')
      .eq('uploaded_by', user.id)
      .order('listendatum', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(200)

    if (queryError) {
      return NextResponse.json(
        { error: `Abfrage fehlgeschlagen: ${queryError.message}` },
        { status: 500 }
      )
    }

    return NextResponse.json(entries ?? [])
  } catch (err) {
    console.error('GET /api/lieferantenlisten error:', err)
    return NextResponse.json(
      { error: 'Interner Serverfehler' },
      { status: 500 }
    )
  }
}
