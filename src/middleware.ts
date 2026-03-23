import { createServerClient } from '@supabase/ssr'
import { NextRequest, NextResponse } from 'next/server'

const KIOSK_COOKIE = 'kiosk_device'

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

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

  // Logged-in user on login page → redirect to dashboard
  if (user && pathname === '/') {
    return NextResponse.redirect(new URL('/dashboard/workflow-hub', request.url))
  }

  // Not logged-in user on protected dashboard route → redirect to login
  if (!user && pathname.startsWith('/dashboard')) {
    return NextResponse.redirect(new URL('/', request.url))
  }

  return response
}

export const config = {
  // /api/jobs/* is intentionally excluded: those routes handle their own auth
  // (Supabase session check, HMAC for n8n callbacks, CRON_SECRET for timeout).
  matcher: ['/', '/dashboard/:path*', '/kiosk', '/kiosk/:path*'],
}
