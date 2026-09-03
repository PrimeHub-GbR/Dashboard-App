import { timingSafeEqual } from 'crypto'
import type { NextRequest } from 'next/server'

/**
 * Maschinen-Zugang für die PlentyONE-Kette.
 *
 * PlentyONE holt die Import-CSVs selbst per HTTPS ab und kann dabei keine eigenen
 * Header setzen — deshalb ist der Token auch als Query-Parameter `t` erlaubt.
 * n8n meldet den Statusbericht mit `Authorization: Bearer <token>`.
 */
export function plentyoneTokenPruefen(request: NextRequest): boolean {
  const erwartet = process.env.PLENTYONE_EXPORT_TOKEN
  if (!erwartet || erwartet.length < 16) return false

  const kopf = request.headers.get('authorization') ?? ''
  const gesendet = kopf.toLowerCase().startsWith('bearer ')
    ? kopf.slice(7).trim()
    : (request.nextUrl.searchParams.get('t') ?? '')

  if (!gesendet) return false

  const a = Buffer.from(gesendet)
  const b = Buffer.from(erwartet)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}
