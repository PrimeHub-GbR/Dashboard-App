import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase-server'

// Web-Konfirm-Seite, auf die der Invite-Link nach Klick zeigt.
// Mitarbeitender setzt dort Passwort und wird auf die Mitarbeiter-App
// hingewiesen. Spaeter durch Android-App-Link / Universal-Link ersetzbar.
const DEFAULT_REDIRECT_PATH = '/portal/welcome'

type UserRole = 'admin' | 'manager' | 'staff'

async function requireAdmin(): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const supabase = await createSupabaseServerClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return { ok: false, status: 401, error: 'Nicht autorisiert' }

  const { data: roleData } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)
    .single()

  const role = roleData?.role as UserRole | undefined
  if (role !== 'admin') {
    return { ok: false, status: 403, error: 'Nur Admins koennen Mitarbeiter einladen' }
  }
  return { ok: true }
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin()
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { id } = await params
  const service = createSupabaseServiceClient()

  // Mitarbeiter laden
  const { data: emp, error: empError } = await service
    .from('employees')
    .select('id, name, email, auth_user_id, is_active')
    .eq('id', id)
    .single()

  if (empError || !emp) {
    return NextResponse.json({ error: 'Mitarbeiter nicht gefunden' }, { status: 404 })
  }

  if (!emp.is_active) {
    return NextResponse.json({ error: 'Mitarbeiter ist nicht aktiv' }, { status: 400 })
  }

  if (emp.auth_user_id) {
    return NextResponse.json(
      { error: 'Mitarbeiter ist bereits eingeladen und mit einem Login verknuepft' },
      { status: 409 }
    )
  }

  if (!emp.email) {
    return NextResponse.json(
      { error: 'Bitte zuerst eine E-Mail-Adresse im Mitarbeiterprofil eintragen' },
      { status: 400 }
    )
  }

  // Redirect-URL zusammensetzen
  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') ??
    'https://dashboard.primehubgbr.com'
  const redirectTo = `${appUrl}${DEFAULT_REDIRECT_PATH}`

  // Invitation versenden — Trigger 044 setzt employees.auth_user_id
  // automatisch, weil raw_user_meta_data.employee_id mitgegeben wird.
  const { data: invited, error: inviteError } = await service.auth.admin.inviteUserByEmail(
    emp.email,
    {
      data: { employee_id: emp.id, name: emp.name },
      redirectTo,
    }
  )

  if (inviteError || !invited) {
    return NextResponse.json(
      {
        error:
          inviteError?.message?.includes('already')
            ? 'Diese E-Mail-Adresse hat bereits ein Konto'
            : `Versand fehlgeschlagen: ${inviteError?.message ?? 'unbekannter Fehler'}`,
      },
      { status: 500 }
    )
  }

  return NextResponse.json({
    invited: true,
    email: emp.email,
    sent_at: new Date().toISOString(),
    redirect_url: redirectTo,
  })
}
