import { createServerClient } from '@supabase/ssr'
import { NextRequest, NextResponse } from 'next/server'

export async function middleware(request: NextRequest) {
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
  if (user && request.nextUrl.pathname === '/') {
    return NextResponse.redirect(new URL('/dashboard/workflow-hub', request.url))
  }

  // Not logged-in user on protected dashboard route → redirect to login
  // Ausnahme: Kiosk-Seite ist öffentlich (Sicherheit via x-kiosk-token + PIN auf API-Ebene)
  const isKiosk = request.nextUrl.pathname.startsWith('/dashboard/zeiterfassung/einchecken')
  if (!user && request.nextUrl.pathname.startsWith('/dashboard') && !isKiosk) {
    return NextResponse.redirect(new URL('/', request.url))
  }

  return response
}

export const config = {
  // /api/jobs/* is intentionally excluded: those routes handle their own auth
  // (Supabase session check, HMAC for n8n callbacks, CRON_SECRET for timeout).
  matcher: ['/', '/dashboard/:path*'],
}
