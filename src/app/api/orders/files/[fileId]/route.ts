import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { downloadFile } from '@/lib/google-drive'
import { createSupabaseServiceClient } from '@/lib/supabase-server'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ fileId: string }> }
) {
  const { fileId } = await params

  // Auth check
  const supabaseAuth = await createSupabaseServerClient()
  const { data: { user }, error: authError } = await supabaseAuth.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Nicht authentifiziert' }, { status: 401 })
  }

  // Look up file name from orders table
  const supabase = createSupabaseServiceClient()
  const { data: order } = await supabase
    .from('orders')
    .select('file_name')
    .eq('file_id', fileId)
    .limit(1)
    .single()

  const fileName = order?.file_name ?? 'bestellung.xlsx'

  try {
    const buffer = await downloadFile(fileId)

    return new NextResponse(buffer.buffer as ArrayBuffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${encodeURIComponent(fileName)}"`,
        'Content-Length': String(buffer.length),
      },
    })
  } catch (err) {
    console.error('Download error:', err)
    return NextResponse.json({ error: 'Datei konnte nicht heruntergeladen werden' }, { status: 500 })
  }
}
