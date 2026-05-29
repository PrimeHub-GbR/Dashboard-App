import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase-server'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// DELETE /api/buchpreisbindung/sellers/[id]/runs
// Loescht alle Laeufe + Items dieses Haendlers. Haendler-Konfiguration bleibt erhalten.
// Items kaskadieren ueber FK ON DELETE CASCADE (Migration 035).
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    if (!UUID_RE.test(id)) {
      return NextResponse.json({ error: 'Ungültige ID' }, { status: 400 })
    }

    const supabaseAuth = await createSupabaseServerClient()
    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Nicht authentifiziert' }, { status: 401 })
    }

    const supabase = createSupabaseServiceClient()

    // Ownership pruefen
    const { data: existing } = await supabase
      .from('buchpreischeck_sellers')
      .select('user_id')
      .eq('id', id)
      .single()

    if (!existing || existing.user_id !== user.id) {
      return NextResponse.json({ error: 'Nicht gefunden oder keine Berechtigung' }, { status: 404 })
    }

    // Sicherheits-Guard: laufende Runs nicht hart loeschen, damit der n8n-Callback
    // nicht ins Leere postet und der Workflow seine VLB-Sitzung sauber zu Ende fuehrt.
    const { count: runningCount } = await supabase
      .from('buchpreischeck_runs')
      .select('id', { count: 'exact', head: true })
      .eq('seller_id', id)
      .eq('status', 'running')

    if ((runningCount ?? 0) > 0) {
      return NextResponse.json(
        { error: 'Ein Lauf läuft gerade. Bitte warten, bis er fertig ist (oder per Timeout-Sweeper abgebrochen wird).' },
        { status: 409 }
      )
    }

    // Alle Runs des Haendlers loeschen — Items kaskadieren via FK ON DELETE CASCADE.
    const { data, error } = await supabase
      .from('buchpreischeck_runs')
      .delete()
      .eq('seller_id', id)
      .select('id')

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Haendler-Zeitstempel "last_run_at" zuruecksetzen, damit das Frontend
    // keinen Spurschatten anzeigt.
    await supabase
      .from('buchpreischeck_sellers')
      .update({ last_run_at: null })
      .eq('id', id)

    return NextResponse.json({ ok: true, deletedRuns: data?.length ?? 0 })
  } catch (err) {
    console.error('DELETE /api/buchpreisbindung/sellers/[id]/runs error:', err)
    return NextResponse.json({ error: 'Interner Serverfehler' }, { status: 500 })
  }
}
