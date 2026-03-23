import { NextRequest, NextResponse } from 'next/server'

const KIOSK_COOKIE = 'kiosk_device'
// Kein Ablaufdatum — Cookie bleibt dauerhaft gültig
const MAX_AGE = 2147483647 // 2^31 - 1 Sekunden (~68 Jahre, Browserlimit)

export async function GET(request: NextRequest) {
  const secret = process.env.KIOSK_DEVICE_SECRET
  if (!secret) {
    return new NextResponse('KIOSK_DEVICE_SECRET nicht konfiguriert', { status: 500 })
  }

  const key = request.nextUrl.searchParams.get('key')
  if (!key || key !== secret) {
    return new NextResponse('Ungültiger Schlüssel', { status: 403 })
  }

  const response = NextResponse.redirect(new URL('/kiosk', request.url))
  response.cookies.set(KIOSK_COOKIE, secret, {
    httpOnly: true,
    secure: true,
    sameSite: 'strict',
    maxAge: MAX_AGE,
    path: '/',
  })
  return response
}
