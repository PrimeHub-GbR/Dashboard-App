import { createServerClient } from '@supabase/ssr'
import { NextRequest, NextResponse } from 'next/server'

const KIOSK_COOKIE = 'kiosk_device'

const APEX_HOSTS = ['primehubgbr.com', 'www.primehubgbr.com']
const DASHBOARD_URL = 'https://dashboard.primehubgbr.com'

// Prüft, ob die öffentliche Landingpage live ist: Schalter an UND Frist (falls
// gesetzt) noch nicht abgelaufen. Liest direkt via Supabase REST (kein SDK-Overhead).
async function isLandingLive(): Promise<boolean> {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
    const res = await fetch(
      `${supabaseUrl}/rest/v1/site_settings?key=in.(landing_enabled,auto_disable_at)&select=key,value`,
      { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } }
    )
    const rows = await res.json()
    if (!Array.isArray(rows)) return false
    const map = Object.fromEntries(rows.map((r) => [r.key, r.value]))
    if (map.landing_enabled !== true) return false
    const at = typeof map.auto_disable_at === 'string' ? map.auto_disable_at : null
    if (at && new Date(at).getTime() <= Date.now()) return false // Frist abgelaufen
    return true
  } catch {
    return false
  }
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Apex-Domain (primehubgbr.com): öffentliche Firmen-Landingpage statt Login.
  // Nur die Root-Route wird umgeschrieben; /impressum etc. sind ohnehin öffentlich.
  const host = (request.headers.get('host') || '').toLowerCase().split(':')[0]
  if (APEX_HOSTS.includes(host) && pathname === '/') {
    if (await isLandingLive()) {
      return NextResponse.rewrite(new URL('/site', request.url))
    }
    // Website ausgeschaltet → auf das (private) Dashboard umleiten
    return NextResponse.redirect(DASHBOARD_URL)
  }

  // Kiosk-Geräteschutz: /kiosk nur mit registriertem Device-Token erlaubt
  if (pathname.startsWith('/kiosk') && pathname !== '/kiosk/blocked') {
    const deviceToken = request.cookies.get(KIOSK_COOKIE)?.value
    if (!deviceToken) {
      return NextResponse.redirect(new URL('/kiosk/blocked', request.url))
    }

    // Token gegen DB prüfen (direkte REST API, kein SDK-Overhead)
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
    const res = await fetch(
      `${supabaseUrl}/rest/v1/kiosk_devices?token=eq.${deviceToken}&is_active=eq.true&select=id&limit=1`,
      { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } }
    )
    const rows = await res.json()
    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.redirect(new URL('/kiosk/blocked', request.url))
    }

    // last_seen_at aktualisieren (fire & forget)
    fetch(`${supabaseUrl}/rest/v1/kiosk_devices?token=eq.${deviceToken}`, {
      method: 'PATCH',
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({ last_seen_at: new Date().toISOString() }),
    })

    return NextResponse.next()
  }

  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value)
          }
          response = NextResponse.next({ request })
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options)
          }
        },
      },
    }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Rolle ermitteln — NUR admin/manager duerfen ins Web-Dashboard.
  // Mitarbeiter (App-Nutzer mit Supabase-Auth-Account) duerfen NICHT rein.
  let isManagerOrAdmin = false
  if (user) {
    const { data: roleRow } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .maybeSingle()
    isManagerOrAdmin = roleRow?.role === 'admin' || roleRow?.role === 'manager'
  }

  // Eingeloggter Admin/Manager auf Login-Seite → Dashboard
  if (user && isManagerOrAdmin && pathname === '/') {
    return NextResponse.redirect(new URL('/dashboard/aufgaben', request.url))
  }

  // Dashboard-Schutz
  if (pathname.startsWith('/dashboard')) {
    // Nicht eingeloggt → Login
    if (!user) {
      return NextResponse.redirect(new URL('/', request.url))
    }
    // Eingeloggt, aber kein Admin/Manager (z.B. Mitarbeiter) → raus mit Hinweis
    if (!isManagerOrAdmin) {
      return NextResponse.redirect(new URL('/?error=forbidden', request.url))
    }
  }

  return response
}

export const config = {
  // /api/jobs/* is intentionally excluded: those routes handle their own auth
  // (Supabase session check, HMAC for n8n callbacks, CRON_SECRET for timeout).
  matcher: ['/', '/dashboard/:path*', '/kiosk', '/kiosk/:path*'],
}
