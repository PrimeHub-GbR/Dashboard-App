import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { fetch as undiciFetch, ProxyAgent } from 'undici'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { rateLimit } from '@/lib/rate-limit'

// undici (ProxyAgent) tunnelt HTTPS zuverlässig über den DataImpulse-HTTP-Proxy.
export const runtime = 'nodejs'

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
    // Seller profile page works for ALL valid sellers, even those with no active listings.
    // The old search URL (/s?me=...&i=stripbooks) returned "no results" when the seller
    // had no books listed at that moment, causing false negatives.
    const profileUrl = `https://www.amazon.de/sp?seller=${encodeURIComponent(seller_id)}`

    let exists = false
    let seller_name: string | null = null

    // Über DataImpulse-Residential-Proxy abrufen, damit Amazon die Anfrage nicht blockt.
    // WICHTIG: undici's eigenes fetch verwenden — das globale fetch wird von Next.js gepatcht
    // und ignoriert dabei die dispatcher-Option (Proxy würde sonst nicht greifen).
    const proxyUrl = process.env.DATAIMPULSE_PROXY_URL
    const dispatcher = proxyUrl ? new ProxyAgent(proxyUrl) : undefined

    try {
      const response = await undiciFetch(profileUrl, {
        redirect: 'follow',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
          'Accept-Language': 'de-DE,de;q=0.9',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
        signal: AbortSignal.timeout(15000),
        dispatcher,
      })

      if (response.ok) {
        const html = await response.text()

        // CAPTCHA detection
        const isCaptcha = html.includes('Enter the characters you see below') ||
                          html.includes('Geben Sie die Zeichen ein') ||
                          html.includes('api-services-support.amazon.com')

        if (isCaptcha) {
          return NextResponse.json({
            exists: null,
            seller_name: null,
            message: 'Amazon-Verifikation nicht möglich (CAPTCHA). Bitte Seller-ID manuell auf amazon.de prüfen.',
          })
        }

        // A valid seller profile page contains these markers.
        // Invalid IDs get redirected to the homepage (no "seller=" in final URL).
        const finalUrlHasSeller = response.url.includes('seller=')
        const hasProfileMarker = html.includes('Verkäuferprofilseite') ||
                                 html.includes('seller-profile') ||
                                 html.includes('feedback-summary')

        exists = finalUrlHasSeller && hasProfileMarker

        if (exists) {
          // Try multiple patterns — Amazon page structure varies
          // 1. Page title: "Buch_Service : Amazon-Verkäuferprofilseite"
          const titleMatch = html.match(/<title[^>]*>\s*([^<]{2,80?}?)\s*[:|]/)
          if (titleMatch?.[1]) seller_name = titleMatch[1].trim()

          // 2. Seller name in H1 or store heading
          if (!seller_name) {
            const h1Match = html.match(/<h1[^>]*>\s*([^<]{2,80})\s*<\/h1>/i)
            if (h1Match?.[1]) seller_name = h1Match[1].trim()
          }

          // 3. Embedded JSON: "sellerName":"Buch_Service"
          if (!seller_name) {
            const jsonMatch = html.match(/"sellerName"\s*:\s*"([^"]{2,80})"/)
              ?? html.match(/"storeName"\s*:\s*"([^"]{2,80})"/)
            if (jsonMatch?.[1]) seller_name = jsonMatch[1].trim()
          }

          // 4. span#sellerName or similar element
          if (!seller_name) {
            const spanMatch = html.match(/id=["']sellerName["'][^>]*>\s*([^<]{2,80})\s*</)
              ?? html.match(/class=["'][^"']*store-name[^"']*["'][^>]*>\s*([^<]{2,80})\s*</)
            if (spanMatch?.[1]) seller_name = spanMatch[1].trim()
          }

          // 5. Meta description: often "Entdecke das Sortiment von Buch_Service ..."
          if (!seller_name) {
            const metaMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']{2,100})/)
              ?? html.match(/<meta[^>]*content=["']([^"']{2,100})[^>]*name=["']description["']/)
            const desc = metaMatch?.[1]?.trim()
            if (desc && !desc.startsWith('Amazon')) seller_name = desc.split(/[:\-–]/)[0].trim() || null
          }
        }
      }
    } catch {
      // Network error or timeout
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
