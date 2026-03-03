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
    const { id: jobId } = await params

    // 1. Validate job ID format (UUID)
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(jobId)) {
      return NextResponse.json({ error: 'Ungültige Job-ID' }, { status: 400 })
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

    // 3. Load job and verify ownership
    const supabase = createSupabaseServiceClient()
    const { data: job, error: jobError } = await supabase
      .from('jobs')
      .select('user_id, result_file_url, status')
      .eq('id', jobId)
      .single()

    if (jobError || !job) {
      return NextResponse.json(
        { error: 'Job nicht gefunden' },
        { status: 404 }
      )
    }

    // Verify the requesting user owns the job
    if (job.user_id !== user.id) {
      return NextResponse.json(
        { error: 'Keine Berechtigung' },
        { status: 403 }
      )
    }

    // 4. Check that result file exists
    if (!job.result_file_url) {
      return NextResponse.json(
        { error: 'Keine Ergebnisdatei vorhanden' },
        { status: 404 }
      )
    }

    // 5. Generate signed URL (valid for 1 hour)
    const { data: signedUrlData, error: signedUrlError } = await supabase.storage
      .from('workflow-results')
      .createSignedUrl(job.result_file_url, 3600)

    if (signedUrlError || !signedUrlData?.signedUrl) {
      console.error('Signed URL generation failed:', signedUrlError)
      return NextResponse.json(
        { error: 'Download-URL konnte nicht erstellt werden' },
        { status: 500 }
      )
    }

    return NextResponse.json({ url: signedUrlData.signedUrl })
  } catch (err) {
    console.error('GET /api/jobs/[id]/download error:', err)
    return NextResponse.json(
      { error: 'Interner Serverfehler' },
      { status: 500 }
    )
  }
}
