import type { NextRequest } from 'next/server'

export const PIN_REGEX = /^\d{4,8}$/

/**
 * Prüft den Kiosk-Token aus dem `x-kiosk-token`-Header gegen `KIOSK_TOKEN`.
 * Ist keine Umgebungsvariable gesetzt, wird der Zugriff erlaubt (lokale Entwicklung).
 * Vergleich erfolgt constant-time, um Timing-Angriffe zu vermeiden.
 */
export function verifyKioskToken(req: NextRequest): boolean {
  const expected = process.env.KIOSK_TOKEN
  if (!expected) return true
  const token = req.headers.get('x-kiosk-token')
  if (!token) return false
  if (token.length !== expected.length) return false
  let diff = 0
  for (let i = 0; i < token.length; i++) {
    diff |= token.charCodeAt(i) ^ expected.charCodeAt(i)
  }
  return diff === 0
}

/** Hasht eine PIN mit SHA-256 und gibt den Hex-String zurück. */
export async function hashPin(pin: string): Promise<string> {
  const encoder = new TextEncoder()
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(pin))
  return Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}
