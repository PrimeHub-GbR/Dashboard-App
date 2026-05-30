import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

export const metadata = { title: 'Datenschutz — PrimeHub Mitarbeiter-Portal' }

export default function PortalDatenschutzPage() {
  return (
    <div className="min-h-screen bg-background">
      <div className="sticky top-0 z-10 bg-background border-b px-4 py-3 flex items-center gap-3">
        <Link
          href="/portal"
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="w-4 h-4" />
          Zurück
        </Link>
        <p className="font-semibold text-sm">Datenschutz</p>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-6 text-sm leading-relaxed">

        <section>
          <h1 className="text-xl font-bold mb-2">Datenschutzerklärung Mitarbeiter-Portal</h1>
          <p className="text-muted-foreground">
            Stand: Mai 2026. Diese Erklärung gilt für die Nutzung des Mitarbeiter-Portals
            der PrimeHub GbR.
          </p>
        </section>

        <section>
          <h2 className="font-semibold text-base mb-1">1. Verantwortlicher</h2>
          <p>
            PrimeHub GbR<br />
            Geschäftsführung: Seydi Çetin Taya, Mohammed Ozdorf<br />
            Kontakt für Datenschutzanfragen: <a href="mailto:primehubgbr@gmail.com" className="text-primary underline">primehubgbr@gmail.com</a>
          </p>
        </section>

        <section>
          <h2 className="font-semibold text-base mb-1">2. Welche Daten verarbeitet werden</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>Stammdaten: Name, Anzeigefarbe, persönliche PIN (nur als verschlüsselter Hashwert gespeichert), optional E-Mail und Telefon.</li>
            <li>Arbeitszeiten: Ein- und Ausstempelzeiten am Kiosk, automatisch berechnete Pausen nach ArbZG, eventuelle Korrekturen durch den Vorgesetzten.</li>
            <li>Wochenplanungs-Abgaben: Pro Woche die von dir angegebenen Verfügbarkeiten (z. B. „Mo 9–17 Uhr"), optionale Notiz.</li>
            <li>Sitzungsdaten: Im Browser eine temporäre Anmelde-Sitzung (max. 8 Stunden, lokal im Gerät, nicht serverseitig gespeichert).</li>
          </ul>
        </section>

        <section>
          <h2 className="font-semibold text-base mb-1">3. Zwecke und Rechtsgrundlagen</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li><strong>Arbeitszeiterfassung</strong> — gesetzliche Pflicht nach § 16 Abs. 2 Arbeitszeitgesetz (ArbZG) sowie BAG-Urteil 1 ABR 22/21 vom 13.09.2022. Rechtsgrundlage: Art. 6 Abs. 1 lit. c DSGVO.</li>
            <li><strong>Durchführung des Arbeitsverhältnisses</strong> — Erstellung von Lohnabrechnungen, Schicht- und Wochenplanung. Rechtsgrundlage: Art. 6 Abs. 1 lit. b DSGVO i. V. m. § 26 Abs. 1 BDSG.</li>
            <li><strong>Benachrichtigungen bei Überstunden</strong> — basierend auf einer Schwellenwert-Konfiguration durch die Geschäftsführung. Rechtsgrundlage: berechtigtes Interesse, Art. 6 Abs. 1 lit. f DSGVO.</li>
          </ul>
        </section>

        <section>
          <h2 className="font-semibold text-base mb-1">4. Empfänger und Auftragsverarbeiter</h2>
          <p>Folgende Dienstleister verarbeiten die Daten in unserem Auftrag:</p>
          <ul className="list-disc pl-5 space-y-1 mt-1">
            <li><strong>Supabase Inc.</strong> (Datenbank-Hosting, Region: Frankfurt/EU)</li>
            <li><strong>Vercel Inc.</strong> (Hosting der Anwendung)</li>
            <li><strong>n8n GmbH</strong> (selbst gehostet, Benachrichtigungs-Workflows)</li>
          </ul>
          <p className="mt-2 text-muted-foreground">
            Mit allen Anbietern bestehen Auftragsverarbeitungsverträge (AV-Verträge) nach Art. 28 DSGVO.
          </p>
        </section>

        <section>
          <h2 className="font-semibold text-base mb-1">5. Speicherdauer</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>Arbeitszeitdaten werden während des Arbeitsverhältnisses und mindestens für die gesetzlichen Aufbewahrungsfristen (i. d. R. 2 Jahre nach § 16 Abs. 2 ArbZG, bei lohnsteuerlicher Relevanz 6–10 Jahre) gespeichert.</li>
            <li>Wochenplanungs-Abgaben werden 12 Monate nach Ende der jeweiligen Woche gelöscht.</li>
            <li>Sitzungsdaten werden nach Abmeldung bzw. nach 8 Stunden automatisch im Gerät gelöscht.</li>
          </ul>
        </section>

        <section>
          <h2 className="font-semibold text-base mb-1">6. Datenübermittlung in Drittländer</h2>
          <p>
            Die Verarbeitung erfolgt grundsätzlich in der EU (Frankfurt). Sollte im Einzelfall
            ein Drittlandstransfer notwendig sein (z. B. durch US-Subunternehmer eines
            Auftragsverarbeiters), erfolgt dies auf Basis der EU-Standardvertragsklauseln
            (Art. 46 DSGVO).
          </p>
        </section>

        <section>
          <h2 className="font-semibold text-base mb-1">7. Deine Rechte</h2>
          <p>Du hast jederzeit das Recht auf:</p>
          <ul className="list-disc pl-5 space-y-1 mt-1">
            <li>Auskunft über die zu deiner Person gespeicherten Daten (Art. 15 DSGVO)</li>
            <li>Berichtigung unrichtiger Daten (Art. 16 DSGVO)</li>
            <li>Löschung, soweit keine gesetzliche Aufbewahrungspflicht besteht (Art. 17 DSGVO)</li>
            <li>Einschränkung der Verarbeitung (Art. 18 DSGVO)</li>
            <li>Datenübertragbarkeit (Art. 20 DSGVO)</li>
            <li>Widerspruch gegen die Verarbeitung (Art. 21 DSGVO)</li>
            <li>Beschwerde bei der Landesbeauftragten für Datenschutz und Informationsfreiheit NRW (LDI NRW)</li>
          </ul>
          <p className="mt-2">
            Anfragen richte bitte schriftlich an: <a href="mailto:primehubgbr@gmail.com" className="text-primary underline">primehubgbr@gmail.com</a>
          </p>
        </section>

        <section>
          <h2 className="font-semibold text-base mb-1">8. Automatisierte Entscheidungen</h2>
          <p>
            Im Portal findet keine automatisierte Entscheidungsfindung im Sinne von
            Art. 22 DSGVO statt. Alle personalrelevanten Entscheidungen (z. B. Korrektur
            von Zeiten, Schichtplanung) werden durch die Geschäftsführung getroffen.
          </p>
        </section>

        <section>
          <h2 className="font-semibold text-base mb-1">9. Änderungen dieser Erklärung</h2>
          <p>
            Bei wesentlichen Änderungen wirst du beim nächsten Login zur erneuten
            Bestätigung aufgefordert. Die jeweils aktuelle Fassung ist jederzeit unter
            <Link href="/portal/datenschutz" className="text-primary underline ml-1">dieser URL</Link> abrufbar.
          </p>
        </section>

        <section className="border-t pt-4 text-xs text-muted-foreground">
          <p>
            Dieser Text ist ein allgemeiner Entwurf und ersetzt keine individuelle
            Rechtsberatung. Vor produktivem Einsatz sollte die Erklärung durch einen
            Anwalt oder Datenschutzbeauftragten geprüft werden.
          </p>
        </section>

      </div>
    </div>
  )
}
