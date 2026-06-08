import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { COMPANY } from '@/lib/company'

export const metadata: Metadata = {
  title: 'Datenschutzerklärung — PrimeHub GbR',
  description: 'Datenschutzerklärung der PrimeHub GbR für die Website primehubgbr.com gemäß DSGVO.',
}

export default function DatenschutzPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-12 text-foreground">
      <Link
        href="/"
        className="mb-8 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Zurück
      </Link>

      <h1 className="text-3xl font-bold tracking-tight">Datenschutzerklärung</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Diese Erklärung gilt für die Website <span className="font-medium">{COMPANY.domain}</span>.
      </p>

      <div className="mt-8 space-y-8 text-[15px] leading-relaxed">
        <section>
          <h2 className="text-lg font-semibold">1. Verantwortlicher</h2>
          <p className="mt-2">
            Verantwortlich für die Datenverarbeitung auf dieser Website im Sinne der
            Datenschutz-Grundverordnung (DSGVO) ist:
          </p>
          <p className="mt-2">
            {COMPANY.name}<br />
            {COMPANY.street}<br />
            {COMPANY.zip} {COMPANY.city}<br />
            {COMPANY.country}<br />
            E-Mail:{' '}
            <a href={`mailto:${COMPANY.email}`} className="text-primary underline-offset-2 hover:underline">
              {COMPANY.email}
            </a>
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold">2. Allgemeines &amp; Hosting</h2>
          <p className="mt-2">
            Diese Website ist eine reine Informationsseite. Wir verarbeiten personenbezogene Daten nur,
            soweit dies für die Bereitstellung der Website technisch erforderlich ist.
          </p>
          <p className="mt-2">
            Das Hosting erfolgt durch die Vercel Inc., 340 S Lemon Ave #4133, Walnut, CA 91789, USA.
            Beim Aufruf der Website werden technisch notwendige Daten an den Hoster übermittelt und in
            Server-Logfiles verarbeitet. Mit dem Anbieter besteht ein Vertrag zur Auftragsverarbeitung
            (Art. 28 DSGVO). Eine Übermittlung in die USA ist durch geeignete Garantien
            (EU-Standardvertragsklauseln bzw. EU-US Data Privacy Framework) abgesichert.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold">3. Server-Logfiles</h2>
          <p className="mt-2">
            Beim Besuch der Website werden automatisch Informationen erfasst, die Ihr Browser übermittelt.
            Dies sind insbesondere:
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>IP-Adresse des anfragenden Geräts</li>
            <li>Datum und Uhrzeit des Zugriffs</li>
            <li>aufgerufene Seite / Datei</li>
            <li>verwendeter Browsertyp und Betriebssystem</li>
            <li>Referrer-URL (zuvor besuchte Seite)</li>
          </ul>
          <p className="mt-2">
            Die Verarbeitung erfolgt auf Grundlage von Art. 6 Abs. 1 lit. f DSGVO. Unser berechtigtes
            Interesse liegt in der technisch fehlerfreien Bereitstellung und der Sicherheit unserer Website.
            Die Daten werden nicht mit anderen Datenquellen zusammengeführt und nach kurzer Zeit gelöscht.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold">4. SSL-/TLS-Verschlüsselung</h2>
          <p className="mt-2">
            Diese Website nutzt aus Sicherheitsgründen eine SSL-/TLS-Verschlüsselung. Eine verschlüsselte
            Verbindung erkennen Sie am „https://" in der Adresszeile Ihres Browsers.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold">5. Kontaktaufnahme per E-Mail</h2>
          <p className="mt-2">
            Wenn Sie uns per E-Mail kontaktieren, werden Ihre Angaben (E-Mail-Adresse, Inhalt der Nachricht)
            zur Bearbeitung Ihrer Anfrage gespeichert. Rechtsgrundlage ist Art. 6 Abs. 1 lit. b DSGVO
            (vorvertragliche bzw. vertragliche Maßnahmen) bzw. Art. 6 Abs. 1 lit. f DSGVO (Bearbeitung Ihrer
            Anfrage). Die Daten werden gelöscht, sobald sie nicht mehr erforderlich sind und keine
            gesetzlichen Aufbewahrungspflichten entgegenstehen.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold">6. Keine Cookies, kein Tracking</h2>
          <p className="mt-2">
            Diese Website setzt keine Cookies und verwendet keine Analyse-, Tracking- oder
            Werbe-Dienste. Es findet kein Profiling statt.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold">7. Ihre Rechte</h2>
          <p className="mt-2">Sie haben im Rahmen der gesetzlichen Vorgaben jederzeit das Recht auf:</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>Auskunft über Ihre verarbeiteten Daten (Art. 15 DSGVO)</li>
            <li>Berichtigung unrichtiger Daten (Art. 16 DSGVO)</li>
            <li>Löschung Ihrer Daten (Art. 17 DSGVO)</li>
            <li>Einschränkung der Verarbeitung (Art. 18 DSGVO)</li>
            <li>Datenübertragbarkeit (Art. 20 DSGVO)</li>
            <li>Widerspruch gegen die Verarbeitung (Art. 21 DSGVO)</li>
          </ul>
          <p className="mt-2">
            Zur Ausübung Ihrer Rechte genügt eine E-Mail an{' '}
            <a href={`mailto:${COMPANY.email}`} className="text-primary underline-offset-2 hover:underline">
              {COMPANY.email}
            </a>.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold">8. Beschwerderecht bei der Aufsichtsbehörde</h2>
          <p className="mt-2">
            Sie haben das Recht, sich bei einer Datenschutz-Aufsichtsbehörde über die Verarbeitung Ihrer
            personenbezogenen Daten zu beschweren. Zuständig ist u. a. die Landesbeauftragte für Datenschutz
            und Informationsfreiheit Nordrhein-Westfalen.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold">9. Aktualität und Änderungen</h2>
          <p className="mt-2">
            Wir passen diese Datenschutzerklärung an, sobald Änderungen der Datenverarbeitung dies
            erforderlich machen. Es gilt jeweils die hier veröffentlichte Fassung.
          </p>
        </section>
      </div>
    </main>
  )
}
