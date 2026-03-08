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

    // Query distinct files from orders table
    const supabase = createSupabaseServiceClient()
    const { data, error } = await supabase
      .from('orders')
      .select('file_id, file_name, supplier, order_date')
      .not('file_id', 'is', null)
      .not('file_name', 'is', null)
      .order('supplier', { ascending: true })
      .order('file_name', { ascending: true })
      .limit(500)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Deduplicate by file_id (multiple orders can share same file)
    const seen = new Set<string>()
    const files: OrderFileEntry[] = []
    for (const row of data ?? []) {
      if (!row.file_id || seen.has(row.file_id)) continue
      seen.add(row.file_id)
      files.push({
        file_id: row.file_id,
        file_name: row.file_name,
        supplier: row.supplier,
        order_date: row.order_date,
      })
    }

    return NextResponse.json({ files })
  } catch (err) {
    console.error('GET /api/orders/file-list error:', err)
    return NextResponse.json({ error: 'Interner Serverfehler' }, { status: 500 })
  }
}
