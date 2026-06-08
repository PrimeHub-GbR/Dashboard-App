import type { Metadata } from 'next'
import Link from 'next/link'
import { Mail, MapPin, Package, Boxes, Flame, Sparkles, BookOpen } from 'lucide-react'
import { COMPANY, BUSINESS_AREAS } from '@/lib/company'

export const metadata: Metadata = {
  title: 'PrimeHub GbR — Antiquariat, 3D-Druck, Kerzen & Kosmetik',
  description:
    'PrimeHub GbR aus Leverkusen: Antiquariat (Versandbuchhandel), 3D-Druck-Printfarm & Auftragsdruck, Kerzenmanufaktur und Kosmetik. Hier finden Sie unsere Kontakt- und Unternehmensdaten.',
  keywords: ['PrimeHub', 'PrimeHub GbR', 'Leverkusen', 'Antiquariat', '3D-Druck', 'Printfarm', 'Kerzen', 'Kosmetik'],
  alternates: { canonical: COMPANY.url },
  openGraph: {
    title: 'PrimeHub GbR',
    description: 'Antiquariat, 3D-Druck-Printfarm, Kerzenmanufaktur und Kosmetik aus Leverkusen.',
    url: COMPANY.url,
    siteName: COMPANY.name,
    locale: 'de_DE',
    type: 'website',
  },
}

const AREA_ICONS = [BookOpen, Boxes, Flame, Sparkles] as const

// JSON-LD strukturierte Daten — hilft Suchmaschinen, die Firma zu erkennen
const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: COMPANY.name,
  url: COMPANY.url,
  email: COMPANY.email,
  vatID: COMPANY.vatId,
  address: {
    '@type': 'PostalAddress',
    streetAddress: COMPANY.street,
    postalCode: COMPANY.zip,
    addressLocality: COMPANY.city,
    addressCountry: 'DE',
  },
}

export default function SitePage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      {/* Header */}
      <header className="sticky top-0 z-20 border-b border-border/60 bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <span className="flex items-center gap-2 text-lg font-bold tracking-tight">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Package className="h-5 w-5" />
            </span>
            {COMPANY.shortName}
            <span className="text-muted-foreground font-normal">GbR</span>
          </span>
          <nav className="flex items-center gap-6 text-sm">
            <a href="#leistungen" className="text-muted-foreground transition hover:text-foreground">Leistungen</a>
            <a href="#kontakt" className="text-muted-foreground transition hover:text-foreground">Kontakt</a>
            <Link href="/impressum" className="text-muted-foreground transition hover:text-foreground">Impressum</Link>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 -z-10 bg-gradient-to-b from-primary/10 via-background to-background" />
        <div className="mx-auto max-w-5xl px-6 py-24 text-center sm:py-32">
          <span className="inline-flex items-center rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
            Leverkusen · seit 2025
          </span>
          <h1 className="mt-6 text-4xl font-bold tracking-tight sm:text-6xl">
            {COMPANY.name}
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-muted-foreground">
            E-Commerce mit eigener Fertigung: Wir verbinden Antiquariat, 3D-Druck als Dienstleistung,
            eine Kerzenmanufaktur und Kosmetik unter einem Dach — handgemacht, geprüft und zuverlässig versendet.
          </p>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
            <a
              href="#kontakt"
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-3 text-sm font-medium text-primary-foreground shadow-sm transition hover:opacity-90"
            >
              <Mail className="h-4 w-4" /> Kontakt aufnehmen
            </a>
            <a
              href="#leistungen"
              className="inline-flex items-center gap-2 rounded-lg border border-border px-5 py-3 text-sm font-medium transition hover:bg-muted"
            >
              Unsere Leistungen
            </a>
          </div>
        </div>
      </section>

      {/* Leistungen */}
      <section id="leistungen" className="mx-auto max-w-5xl px-6 py-16">
        <div className="mb-10 text-center">
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">Unsere Geschäftsbereiche</h2>
          <p className="mx-auto mt-3 max-w-xl text-muted-foreground">
            Vier Bereiche, ein Anspruch: Qualität, faire Preise und schneller Versand.
          </p>
        </div>
        <div className="grid gap-5 sm:grid-cols-2">
          {BUSINESS_AREAS.map((area, i) => {
            const Icon = AREA_ICONS[i] ?? Package
            return (
              <div
                key={area.title}
                className="rounded-2xl border border-border bg-card p-6 shadow-sm transition hover:shadow-md"
              >
                <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Icon className="h-6 w-6" />
                </div>
                <h3 className="text-lg font-semibold">{area.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{area.desc}</p>
              </div>
            )
          })}
        </div>
      </section>

      {/* Kontakt */}
      <section id="kontakt" className="border-t border-border/60 bg-muted/30">
        <div className="mx-auto max-w-5xl px-6 py-16">
          <div className="grid gap-8 sm:grid-cols-2">
            <div>
              <h2 className="text-2xl font-bold tracking-tight">Kontakt</h2>
              <p className="mt-3 text-muted-foreground">
                Sie haben eine Anfrage oder möchten zusammenarbeiten? Schreiben Sie uns gerne.
              </p>
            </div>
            <div className="space-y-4">
              <a
                href={`mailto:${COMPANY.email}`}
                className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 transition hover:bg-muted"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Mail className="h-5 w-5" />
                </span>
                <span>
                  <span className="block text-xs text-muted-foreground">E-Mail</span>
                  <span className="font-medium">{COMPANY.email}</span>
                </span>
              </a>
              <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-4">
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <MapPin className="h-5 w-5" />
                </span>
                <span>
                  <span className="block text-xs text-muted-foreground">Anschrift</span>
                  <span className="font-medium">{COMPANY.street}, {COMPANY.zip} {COMPANY.city}</span>
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/60">
        <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-3 px-6 py-8 text-sm text-muted-foreground sm:flex-row">
          <span>© {COMPANY.name}</span>
          <div className="flex items-center gap-5">
            <Link href="/impressum" className="transition hover:text-foreground">Impressum</Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
