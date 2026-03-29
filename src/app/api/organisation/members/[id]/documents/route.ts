import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase-server'

type DocType = 'arbeitsvertrag' | 'personalfragebogen'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createSupabaseServerClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 })

  const { id } = await params

  let formData: FormData
  try { formData = await req.formData() } catch {
    return NextResponse.json({ error: 'Ungültige Formulardaten' }, { status: 400 })
  }

  const docType = formData.get('type') as DocType
  if (docType !== 'arbeitsvertrag' && docType !== 'personalfragebogen') {
    return NextResponse.json({ error: 'Ungültiger Dokumenttyp' }, { status: 400 })
  }

  const file = formData.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'Keine Datei angegeben' }, { status: 400 })
  if (file.type !== 'application/pdf') {
    return NextResponse.json({ error: 'Nur PDF-Dateien erlaubt' }, { status: 400 })
  }
  if (file.size > 10 * 1024 * 1024) {
    return NextResponse.json({ error: 'Datei zu groß (max. 10 MB)' }, { status: 400 })
  }

  const service = createSupabaseServiceClient()
  const storagePath = `${id}/${docType}.pdf`

  const arrayBuffer = await file.arrayBuffer()
  const { error: uploadError } = await service.storage
    .from('employee-documents')
    .upload(storagePath, arrayBuffer, {
      contentType: 'application/pdf',
      upsert: true,
    })

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 })
  }

  // Pfad in employees-Tabelle speichern
  const column = docType === 'arbeitsvertrag' ? 'arbeitsvertrag_path' : 'personalfragebogen_path'
  const { error: dbError } = await service
    .from('employees')
    .update({ [column]: storagePath, updated_at: new Date().toISOString() })
    .eq('id', id)

  if (dbError) {
    return NextResponse.json({ error: dbError.message }, { status: 500 })
  }

  return NextResponse.json({ path: storagePath })
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createSupabaseServerClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 })

  const { id } = await params
  const { searchParams } = new URL(req.url)
  const docType = searchParams.get('type') as DocType

  if (docType !== 'arbeitsvertrag' && docType !== 'personalfragebogen') {
    return NextResponse.json({ error: 'Ungültiger Dokumenttyp' }, { status: 400 })
  }

  const service = createSupabaseServiceClient()
  const storagePath = `${id}/${docType}.pdf`

  await service.storage.from('employee-documents').remove([storagePath])

  const column = docType === 'arbeitsvertrag' ? 'arbeitsvertrag_path' : 'personalfragebogen_path'
  const { error: dbError } = await service
    .from('employees')
    .update({ [column]: null, updated_at: new Date().toISOString() })
    .eq('id', id)

  if (dbError) {
    return NextResponse.json({ error: dbError.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createSupabaseServerClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 })

  const { id } = await params
  const { searchParams } = new URL(req.url)
  const docType = searchParams.get('type') as DocType

  if (docType !== 'arbeitsvertrag' && docType !== 'personalfragebogen') {
    return NextResponse.json({ error: 'Ungültiger Dokumenttyp' }, { status: 400 })
  }

  const service = createSupabaseServiceClient()
  const storagePath = `${id}/${docType}.pdf`

  const { data, error } = await service.storage
    .from('employee-documents')
    .createSignedUrl(storagePath, 300) // 5 Minuten gültig

  if (error) return NextResponse.json({ error: 'Datei nicht gefunden' }, { status: 404 })

  return NextResponse.json({ url: data.signedUrl })
}
