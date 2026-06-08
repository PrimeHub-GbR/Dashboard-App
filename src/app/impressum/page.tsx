import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { COMPANY } from '@/lib/company'

export const metadata: Metadata = {
  title: 'Impressum — PrimeHub GbR',
  description: 'Impressum und Anbieterkennzeichnung der PrimeHub GbR gemäß § 5 DDG.',
}

export default function ImpressumPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-12 text-foreground">
      <Link
        href="/"
        className="mb-8 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Zurück
      </Link>

      <h1 className="text-3xl font-bold tracking-tight">Impressum</h1>

      <section className="mt-8 space-y-8 text-[15px] leading-relaxed">
        <div>
          <h2 className="text-lg font-semibold">Angaben gemäß § 5 DDG</h2>
          <p className="mt-2">
            {COMPANY.name}<br />
            {COMPANY.street}<br />
            {COMPANY.zip} {COMPANY.city}<br />
            {COMPANY.country}
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold">Vertretungsberechtigte Gesellschafter</h2>
          <p className="mt-2">
            {COMPANY.partners.map((p) => <span key={p} className="block">{p}</span>)}
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold">Kontakt</h2>
          <p className="mt-2">
            E-Mail:{' '}
            <a href={`mailto:${COMPANY.email}`} className="text-primary underline-offset-2 hover:underline">
              {COMPANY.email}
            </a>
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold">Umsatzsteuer-Identifikationsnummer</h2>
          <p className="mt-2">
            Umsatzsteuer-Identifikationsnummer gemäß § 27a Umsatzsteuergesetz:<br />
            {COMPANY.vatId}
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold">Verbraucherstreitbeilegung / Universalschlichtungsstelle</h2>
          <p className="mt-2">
            Wir sind nicht bereit oder verpflichtet, an Streitbeilegungsverfahren vor einer
            Verbraucherschlichtungsstelle teilzunehmen.
          </p>
        </div>
      </section>
    </main>
  )
}
