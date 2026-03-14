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
      .select('uploaded_by, file_path')
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

    // 4. Generate signed URL (valid for 1 hour)
    const { data: signedUrlData, error: signedUrlError } =
      await supabase.storage
        .from('lieferantenlisten')
        .createSignedUrl(entry.file_path, 3600)

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
