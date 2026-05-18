import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { rateLimit } from '@/lib/rate-limit'

const verifySchema = z.object({
  seller_id: z.string().regex(/^A[A-Z0-9]{13}$/, 'Ungültige Amazon Seller-ID (Format: A + 13 Zeichen)'),
})

export async function POST(request: NextRequest) {
  try {
    const supabaseAuth = await createSupabaseServerClient()
    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Nicht authentifiziert' }, { status: 401 })
    }

    if (!rateLimit(`buchpreischeck-verify:${user.id}`, 3, 60_000)) {
      return NextResponse.json({ error: 'Zu viele Anfragen (max. 3/min)' }, { status: 429 })
    }

    const body = await request.json()
    const parsed = verifySchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 })
    }

    const { seller_id } = parsed.data
    const url = `https://www.amazon.de/s?me=${encodeURIComponent(seller_id)}&i=stripbooks`

    let exists = false
    let seller_name: string | null = null

    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
          'Accept-Language': 'de-DE,de;q=0.9',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
        signal: AbortSignal.timeout(8000),
      })

      if (response.ok) {
        const html = await response.text()
        // Check if results exist (Amazon shows "no results" for invalid/inactive sellers)
        exists = !html.includes('Keine Ergebnisse für') &&
                 !html.includes('did not match any products') &&
                 (html.includes('s-result-item') || html.includes('data-asin'))

        // Try to extract seller name from page
        const nameMatch = html.match(/class="[^"]*s-breadcrumb[^"]*"[^>]*>[\s\S]*?<span[^>]*>([^<]{3,80})<\/span>/)
          ?? html.match(/"sellerName"\s*:\s*"([^"]{2,80})"/)
          ?? html.match(/Verkäufer:\s*([A-Za-z0-9\-\s]{2,60})(?:<|,)/)
        if (nameMatch?.[1]) {
          seller_name = nameMatch[1].trim()
        }
      }
    } catch {
      // Network error or timeout — return format-valid but unverified
      return NextResponse.json({
        exists: null,
        seller_name: null,
        message: 'Amazon nicht erreichbar — Format scheint gültig. Bitte manuell prüfen.',
      })
    }

    return NextResponse.json({ exists, seller_name })
  } catch (err) {
    console.error('POST /api/buchpreisbindung/sellers/verify error:', err)
    return NextResponse.json({ error: 'Interner Serverfehler' }, { status: 500 })
  }
}
