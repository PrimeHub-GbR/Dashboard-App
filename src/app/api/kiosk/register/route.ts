import { createSupabaseServiceClient } from '@/lib/supabase-server'
import { NextRequest, NextResponse } from 'next/server'

const KIOSK_COOKIE = 'kiosk_device'
const MAX_AGE = 2147483647 // dauerhaft (~68 Jahre)

export async function GET(request: NextRequest) {
  const secret = process.env.KIOSK_DEVICE_SECRET
  if (!secret) {
    return new NextResponse('KIOSK_DEVICE_SECRET nicht konfiguriert', { status: 500 })
  }

  const key = request.nextUrl.searchParams.get('key')
  if (!key || key !== secret) {
    return new NextResponse('Ungültiger Schlüssel', { status: 403 })
  }

  const label = request.nextUrl.searchParams.get('label') ?? null
  const userAgent = request.headers.get('user-agent') ?? null

  const service = createSupabaseServiceClient()
  const { data, error } = await service
    .from('kiosk_devices')
    .insert({ label, user_agent: userAgent })
    .select('token')
    .single()

  if (error || !data) {
    return new NextResponse('Datenbankfehler', { status: 500 })
  }

  const response = NextResponse.redirect(new URL('/kiosk', request.url))
  response.cookies.set(KIOSK_COOKIE, data.token, {
    httpOnly: true,
    secure: true,
    sameSite: 'strict',
    maxAge: MAX_AGE,
    path: '/',
  })
  return response
}
