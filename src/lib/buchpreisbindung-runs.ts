import type { SupabaseClient } from '@supabase/supabase-js'

// Läufe ohne Callback (Workflow abgestürzt o.ä.) bleiben sonst für immer auf 'running'.
// Dieser Sweeper markiert sie nach Ablauf der Schwelle als 'timeout'.
export const RUN_TIMEOUT_MINUTES = 15

export async function sweepStaleRuns(
  supabase: SupabaseClient,
  thresholdMin: number = RUN_TIMEOUT_MINUTES
): Promise<number> {
  const cutoff = new Date(Date.now() - thresholdMin * 60 * 1000).toISOString()

  const { data, error } = await supabase
    .from('buchpreischeck_runs')
    .update({
      status: 'timeout',
      error_message: `Kein Callback innerhalb von ${thresholdMin} Min — Workflow vermutlich abgestürzt.`,
      completed_at: new Date().toISOString(),
    })
    .eq('status', 'running')
    .lt('started_at', cutoff)
    .select('id')

  if (error) {
    console.error('sweepStaleRuns error:', error)
    return 0
  }
  return data?.length ?? 0
}
