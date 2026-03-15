import { NextRequest, NextResponse } from 'next/server'
import {
  createSupabaseServerClient,
  createSupabaseServiceClient,
} from '@/lib/supabase-server'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: entryId } = await params
    const type = request.nextUrl.searchParams.get('type') // 'original' | 'result'

    // 1. Validate ID format (UUID)
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(entryId)) {
      return NextResponse.json(
        { error: 'Ungültige ID' },
        { status: 400 }
      )
    }

    // 2. Authenticate user via cookies
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

    // 3. Load entry and verify ownership
    const supabase = createSupabaseServiceClient()
    const { data: entry, error: queryError } = await supabase
      .from('lieferantenlisten')
      .select('uploaded_by, file_path, result_file_path')
      .eq('id', entryId)
      .single()

    if (queryError || !entry) {
      return NextResponse.json(
        { error: 'Eintrag nicht gefunden' },
        { status: 404 }
      )
    }

    // Verify the requesting user owns the entry
    if (entry.uploaded_by !== user.id) {
      return NextResponse.json(
        { error: 'Keine Berechtigung' },
        { status: 403 }
      )
    }

    // 4. Determine which file to serve
    const filePath =
      type === 'result' ? entry.result_file_path : entry.file_path

    if (!filePath) {
      return NextResponse.json(
        { error: 'Gefilterte Datei noch nicht verfügbar' },
        { status: 404 }
      )
    }

    // 5. Generate signed URL (valid for 1 hour)
    // Strip bucket prefix if stored with it (e.g. "lieferantenlisten/gmail/...")
    const storagePath = filePath.startsWith('lieferantenlisten/')
      ? filePath.slice('lieferantenlisten/'.length)
      : filePath

    const { data: signedUrlData, error: signedUrlError } =
      await supabase.storage
        .from('lieferantenlisten')
        .createSignedUrl(storagePath, 3600)

    if (signedUrlError || !signedUrlData?.signedUrl) {
      console.error('Signed URL generation failed:', signedUrlError)
      return NextResponse.json(
        { error: 'Download-URL konnte nicht erstellt werden' },
        { status: 500 }
      )
    }

    return NextResponse.json({ url: signedUrlData.signedUrl })
  } catch (err) {
    console.error('GET /api/lieferantenlisten/[id]/download error:', err)
    return NextResponse.json(
      { error: 'Interner Serverfehler' },
      { status: 500 }
    )
  }
}
