import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase-server'
import { rateLimit } from '@/lib/rate-limit'
import { findOrderFiles, downloadFile } from '@/lib/google-drive'
import { parseExcel } from '@/lib/excel-parser'

// Extend Vercel serverless timeout to 60s for large Drive syncs
export const maxDuration = 60

export async function POST(request: NextRequest) {
  try {
    // 1. Authenticate user
    const supabaseAuth = await createSupabaseServerClient()
    const {
      data: { user },
      error: authError,
    } = await supabaseAuth.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Nicht authentifiziert' }, { status: 401 })
    }

    // 1b. Rate limiting (5 sync requests per minute per user)
    if (!rateLimit(`orders-sync:${user.id}`, 5, 60_000)) {
      return NextResponse.json(
        { error: 'Zu viele Sync-Anfragen. Bitte warten Sie einen Moment.' },
        { status: 429 }
      )
    }

    // 2. Check admin role
    const supabase = createSupabaseServiceClient()
    const { data: roleData, error: roleError } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .single()

    if (roleError || !roleData || roleData.role !== 'admin') {
      return NextResponse.json(
        { error: 'Nur Administratoren können die Synchronisation auslösen' },
        { status: 403 }
      )
    }

    // 3. Create sync_log entry
    const { data: syncEntry, error: insertError } = await supabase
      .from('sync_log')
      .insert({ workflow_key: 'google-drive-sync', status: 'running' })
      .select()
      .single()

    if (insertError || !syncEntry) {
      return NextResponse.json(
        { error: `Sync-Log konnte nicht erstellt werden: ${insertError?.message}` },
        { status: 500 }
      )
    }

    // 4. Find files, download, parse, upsert
    try {
      const files = await findOrderFiles()

      if (files.length === 0) {
        await supabase
          .from('sync_log')
          .update({
            status: 'error',
            error_message: 'Keine Ordner mit Endung "Order" in Google Drive gefunden',
          })
          .eq('id', syncEntry.id)

        return NextResponse.json(
          { error: 'Keine Ordner mit Endung "Order" in Google Drive gefunden' },
          { status: 404 }
        )
      }

      const now = new Date().toISOString()
      const ordersToUpsert: (ReturnType<typeof parseExcel>[number] & { synced_at: string })[] = []

      for (const file of files) {
        const buffer = await downloadFile(file.id)
        const folderSupplier = file.folderName.replace(/\s*[Oo]rder\s*$/, '').trim() || file.folderName
        const fileOrderDate = file.createdTime ? file.createdTime.split('T')[0] : null
        const parsed = parseExcel(buffer, folderSupplier, file.id, file.name)
        for (const order of parsed) {
          ordersToUpsert.push({
            ...order,
            // Drive upload date overrides any order_date from Excel content
            ...(fileOrderDate ? { order_date: fileOrderDate } : {}),
            synced_at: now,
          })
        }
      }

      // Deduplicate by order_number to avoid "ON CONFLICT DO UPDATE command cannot affect row a second time"
      const deduped = [...new Map(ordersToUpsert.map((o) => [o.order_number, o])).values()]

      // Upsert in batches of 100 to stay within Supabase request limits
      const BATCH_SIZE = 100
      let totalRowsImported = 0

      for (let i = 0; i < deduped.length; i += BATCH_SIZE) {
        const batch = deduped.slice(i, i + BATCH_SIZE)
        const { error: upsertError } = await supabase
          .from('orders')
          .upsert(batch, { onConflict: 'order_number' })

        if (upsertError) {
          throw new Error(`Upsert fehlgeschlagen: ${upsertError.message}`)
        }

        totalRowsImported += batch.length
      }

      await supabase
        .from('sync_log')
        .update({ status: 'success', rows_imported: deduped.length })
        .eq('id', syncEntry.id)

      return NextResponse.json({
        sync_log_id: syncEntry.id,
        status: 'success',
        rows_imported: totalRowsImported,
        files_processed: files.length,
      })
    } catch (syncErr) {
      const message =
        syncErr instanceof Error ? syncErr.message : 'Unbekannter Fehler beim Google Drive Sync'

      await supabase
        .from('sync_log')
        .update({ status: 'error', error_message: message })
        .eq('id', syncEntry.id)

      return NextResponse.json({ error: message }, { status: 500 })
    }
  } catch (err) {
    console.error('POST /api/orders/sync error:', err)
    return NextResponse.json({ error: 'Interner Serverfehler' }, { status: 500 })
  }
}
