import { NextRequest, NextResponse } from 'next/server'
import {
  createSupabaseServerClient,
  createSupabaseServiceClient,
} from '@/lib/supabase-server'

// DELETE /api/lieferantenlisten/[id] — Delete entry + files from storage
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: entryId } = await params

    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(entryId)) {
      return NextResponse.json({ error: 'Ungültige ID' }, { status: 400 })
    }

    // 1. Authenticate user
    const supabaseAuth = await createSupabaseServerClient()
    const {
      data: { user },
      error: authError,
    } = await supabaseAuth.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Nicht authentifiziert' }, { status: 401 })
    }

    const supabase = createSupabaseServiceClient()

    // 2. Load entry and verify ownership
    const { data: entry, error: queryError } = await supabase
      .from('lieferantenlisten')
      .select('uploaded_by, file_path, result_file_path')
      .eq('id', entryId)
      .single()

    if (queryError || !entry) {
      return NextResponse.json({ error: 'Eintrag nicht gefunden' }, { status: 404 })
    }

    if (entry.uploaded_by !== user.id) {
      return NextResponse.json({ error: 'Keine Berechtigung' }, { status: 403 })
    }

    // 3. Delete files from storage
    const pathsToDelete = [entry.file_path, entry.result_file_path].filter(Boolean) as string[]
    if (pathsToDelete.length > 0) {
      const { error: storageError } = await supabase.storage
        .from('lieferantenlisten')
        .remove(pathsToDelete)

      if (storageError) {
        console.error('Storage delete error (non-blocking):', storageError)
        // Continue — DB record should still be deleted
      }
    }

    // 4. Delete DB record
    const { error: deleteError } = await supabase
      .from('lieferantenlisten')
      .delete()
      .eq('id', entryId)

    if (deleteError) {
      return NextResponse.json(
        { error: `Löschen fehlgeschlagen: ${deleteError.message}` },
        { status: 500 }
      )
    }

    return NextResponse.json({ ok: true }, { status: 200 })
  } catch (err) {
    console.error('DELETE /api/lieferantenlisten/[id] error:', err)
    return NextResponse.json({ error: 'Interner Serverfehler' }, { status: 500 })
  }
}
