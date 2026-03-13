import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase-server'

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    // 1. Authenticate
    const supabaseAuth = await createSupabaseServerClient()
    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Nicht authentifiziert' }, { status: 401 })
    }

    const supabase = createSupabaseServiceClient()

    // 2. Load job and verify ownership
    const { data: job, error: fetchError } = await supabase
      .from('jobs')
      .select('id, user_id, status')
      .eq('id', id)
      .single()

    if (fetchError || !job) {
      return NextResponse.json({ error: 'Job nicht gefunden' }, { status: 404 })
    }

    if (job.user_id !== user.id) {
      return NextResponse.json({ error: 'Keine Berechtigung' }, { status: 403 })
    }

    // 3. Only cancellable if pending or running
    if (job.status !== 'pending' && job.status !== 'running') {
      return NextResponse.json(
        { error: 'Nur laufende Jobs können abgebrochen werden' },
        { status: 409 }
      )
    }

    // 4. Mark as failed
    const { error: updateError } = await supabase
      .from('jobs')
      .update({ status: 'failed', error_message: 'Vom Nutzer abgebrochen' })
      .eq('id', id)

    if (updateError) {
      return NextResponse.json({ error: 'Abbruch fehlgeschlagen' }, { status: 500 })
    }

    return NextResponse.json({ success: true }, { status: 200 })
  } catch (err) {
    console.error('DELETE /api/jobs/[id] error:', err)
    return NextResponse.json({ error: 'Interner Serverfehler' }, { status: 500 })
  }
}
