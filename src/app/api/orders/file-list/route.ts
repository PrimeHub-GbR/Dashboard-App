import { NextResponse } from 'next/server'
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase-server'

export interface OrderFileEntry {
  file_id: string
  file_name: string
  supplier: string | null
  order_date: string | null
}

export async function GET() {
  try {
    // Authenticate user
    const supabaseAuth = await createSupabaseServerClient()
    const {
      data: { user },
      error: authError,
    } = await supabaseAuth.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Nicht authentifiziert' }, { status: 401 })
    }

    // Distinct-Dateiliste via RPC (eine Zeile pro Datei, unabhängig von der
    // Zeilenanzahl — ersetzt die fehleranfällige .limit(500)-Stichprobe)
    const supabase = createSupabaseServiceClient()
    const { data, error } = await supabase.rpc('order_files')

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const files: OrderFileEntry[] = (data ?? [])
      .map((row: OrderFileEntry) => ({
        file_id: row.file_id,
        file_name: row.file_name,
        supplier: row.supplier,
        order_date: row.order_date,
      }))
      .sort((a: OrderFileEntry, b: OrderFileEntry) => {
        const s = (a.supplier ?? '').localeCompare(b.supplier ?? '')
        return s !== 0 ? s : a.file_name.localeCompare(b.file_name)
      })

    return NextResponse.json({ files })
  } catch (err) {
    console.error('GET /api/orders/file-list error:', err)
    return NextResponse.json({ error: 'Interner Serverfehler' }, { status: 500 })
  }
}
