import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServiceClient } from '@/lib/supabase-server'
import { findOrderFiles, downloadFile } from '@/lib/google-drive'
import { parseExcel } from '@/lib/excel-parser'

export const maxDuration = 60

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createSupabaseServiceClient()

  const { data: syncEntry, error: insertError } = await supabase
    .from('sync_log')
    .insert({ workflow_key: 'google-drive-sync', status: 'running' })
    .select()
    .single()

  if (insertError || !syncEntry) {
    return NextResponse.json({ error: 'Sync-Log konnte nicht erstellt werden' }, { status: 500 })
  }

  try {
    const files = await findOrderFiles()

    if (files.length === 0) {
      await supabase
        .from('sync_log')
        .update({ status: 'error', error_message: 'Keine Order-Ordner in Google Drive gefunden' })
        .eq('id', syncEntry.id)
      return NextResponse.json({ status: 'no_files' })
    }

    const now = new Date().toISOString()
    const ordersToUpsert: {
      order_number: string
      order_date: string | null
      supplier: string | null
      status: string | null
      notes: string | null
      raw_data: Record<string, unknown>
      synced_at: string
    }[] = []

    for (const file of files) {
      const buffer = await downloadFile(file.id)
      const folderSupplier = file.folderName.replace(/\s*[Oo]rder\s*$/, '').trim() || file.folderName
      const parsed = parseExcel(buffer, folderSupplier, file.id, file.name)
      for (const order of parsed) {
        ordersToUpsert.push({ ...order, synced_at: now })
      }
    }

    // Deduplicate by order_number (keep last occurrence) to avoid
    // "ON CONFLICT DO UPDATE command cannot affect row a second time"
    const deduped = [...new Map(ordersToUpsert.map((o) => [o.order_number, o])).values()]

    const BATCH_SIZE = 100
    let totalRowsImported = 0

    for (let i = 0; i < deduped.length; i += BATCH_SIZE) {
      const batch = deduped.slice(i, i + BATCH_SIZE)
      const { error: upsertError } = await supabase
        .from('orders')
        .upsert(batch, { onConflict: 'order_number' })

      if (upsertError) throw new Error(`Upsert fehlgeschlagen: ${upsertError.message}`)
      totalRowsImported += batch.length
    }

    await supabase
      .from('sync_log')
      .update({ status: 'success', rows_imported: totalRowsImported })
      .eq('id', syncEntry.id)

    return NextResponse.json({ status: 'success', rows_imported: totalRowsImported, files_processed: files.length })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unbekannter Fehler'
    await supabase
      .from('sync_log')
      .update({ status: 'error', error_message: message })
      .eq('id', syncEntry.id)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
