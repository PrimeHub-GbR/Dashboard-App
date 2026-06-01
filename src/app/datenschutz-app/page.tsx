import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Datenschutzerklärung – PrimeHub App",
  description:
    "Datenschutzerklärung für die PrimeHub Mitarbeiter-App (Android und iOS).",
}

export default function DatenschutzAppPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-12 text-slate-800">
      <h1 className="mb-2 text-3xl font-bold">Datenschutzerklärung</h1>
      <p className="mb-8 text-sm text-slate-500">
        Gilt für die PrimeHub Mitarbeiter-App (Android &amp; iOS). Stand: 1. Juni
        2026.
      </p>

      <section className="prose prose-slate max-w-none space-y-6">
        <div>
          <h2 className="text-xl font-semibold">1. Verantwortlicher</h2>
          <p>
            PrimeHub GbR
            <br />
            E-Mail:{" "}
            <a className="underline" href="mailto:primehubgbr@gmail.com">
              primehubgbr@gmail.com
            </a>
          </p>
        </div>

        <div>
          <h2 className="text-xl font-semibold">
            2. Welche Daten verarbeiten wir?
          </h2>
          <p>
            Die App verarbeitet ausschließlich Daten, die für die Erfüllung des
            Arbeitsverhältnisses und die gesetzliche Dokumentation von
            Arbeitszeiten notwendig sind:
          </p>
          <ul className="list-disc pl-6">
            <li>E-Mail-Adresse (Login)</li>
            <li>Name (vom Arbeitgeber gepflegt)</li>
            <li>Telefon und Anschrift (optional, vom Mitarbeitenden selbst änderbar)</li>
            <li>
              Arbeitszeit-Datensätze (Check-in/Check-out, Pausen,
              Wochenstunden) – erfasst über das stationäre Kiosk-System, nicht
              über die App
            </li>
            <li>Wochenplanungs-Anfragen (Verfügbarkeiten, Notizen)</li>
            <li>Technische Daten (App-Version, Geräte-OS) zur Fehleranalyse</li>
          </ul>
          <p>
            Die App führt <strong>keinen</strong> mobilen Check-in/Check-out
            durch (Buddy-Punching-Schutz). Standortdaten, Fotos, Kontakte,
            Kalender werden nicht verarbeitet.
          </p>
        </div>

        <div>
          <h2 className="text-xl font-semibold">
            3. Zwecke und Rechtsgrundlagen
          </h2>
          <ul className="list-disc pl-6">
            <li>
              <strong>Anmeldung und Identifikation:</strong> Art. 6 Abs. 1 lit.
              b DSGVO (Vertragserfüllung), § 26 BDSG.
            </li>
            <li>
              <strong>Arbeitszeit-Erfassung:</strong> Art. 6 Abs. 1 lit. c
              DSGVO i. V. m. § 16 ArbZG (gesetzliche Pflicht).
            </li>
            <li>
              <strong>Wochenplanung:</strong> Art. 6 Abs. 1 lit. b DSGVO
              (Vertragserfüllung).
            </li>
            <li>
              <strong>Fehlerdiagnose / Crash-Reports:</strong> Art. 6 Abs. 1
              lit. f DSGVO (berechtigtes Interesse an stabiler App).
            </li>
          </ul>
        </div>

        <div>
          <h2 className="text-xl font-semibold">4. Empfänger der Daten</h2>
          <p>
            Daten werden ausschließlich an Auftragsverarbeiter weitergegeben,
            mit denen Verträge nach Art. 28 DSGVO bestehen:
          </p>
          <ul className="list-disc pl-6">
            <li>
              <strong>Supabase Inc.</strong> – Datenbank- und
              Authentifizierungs-Hosting in der EU (Frankfurt).
            </li>
            <li>
              <strong>Sentry</strong> – optionale Crash-Reports
              (anonymisiert).
            </li>
            <li>
              <strong>Google LLC (Google Play)</strong> bzw.{" "}
              <strong>Apple Inc.</strong> – Distribution der App und
              technische Auth-Metadaten.
            </li>
          </ul>
          <p>
            Eine Weitergabe an Dritte zu Werbezwecken erfolgt nicht. Die App
            enthält <strong>keine</strong> Werbe-Tracker und{" "}
            <strong>keine</strong> Analytics-Cookies.
          </p>
        </div>

        <div>
          <h2 className="text-xl font-semibold">5. Speicherdauer</h2>
          <ul className="list-disc pl-6">
            <li>
              Arbeitszeit-Daten: 2 Jahre nach Ende des Kalenderjahres (§ 16
              Abs. 2 ArbZG).
            </li>
            <li>
              Steuer- und lohnrelevante Datensätze: 10 Jahre (§ 257 HGB,
              § 147 AO).
            </li>
            <li>
              Wochenplanungs-Anfragen: bis 12 Monate nach Ende des
              Arbeitsverhältnisses.
            </li>
            <li>
              Account-Daten (E-Mail, Profil): bis 30 Tage nach Ende des
              Arbeitsverhältnisses, danach Löschung oder Anonymisierung.
            </li>
          </ul>
        </div>

        <div>
          <h2 className="text-xl font-semibold">6. Ihre Rechte</h2>
          <p>
            Sie haben das Recht auf Auskunft (Art. 15), Berichtigung (Art.
            16), Löschung (Art. 17), Einschränkung (Art. 18),
            Datenübertragbarkeit (Art. 20) und Widerspruch (Art. 21) gegen die
            Verarbeitung Ihrer Daten.
          </p>
          <p>
            Anfragen senden Sie an{" "}
            <a className="underline" href="mailto:primehubgbr@gmail.com">
              primehubgbr@gmail.com
            </a>
            .
          </p>
          <p>
            Sie können sich außerdem bei der zuständigen Aufsichtsbehörde
            beschweren (Art. 77 DSGVO).
          </p>
        </div>

        <div>
          <h2 className="text-xl font-semibold">
            7. Sicherheitsmaßnahmen
          </h2>
          <p>
            Die Übertragung erfolgt ausschließlich über TLS-verschlüsselte
            Verbindungen. Zugriff auf Mitarbeiterdaten ist über Row-Level-
            Security in der Datenbank auf das jeweilige Konto bzw. den
            zuständigen Vorgesetzten beschränkt.
          </p>
        </div>

        <div>
          <h2 className="text-xl font-semibold">
            8. Änderungen dieser Erklärung
          </h2>
          <p>
            Wir behalten uns vor, diese Datenschutzerklärung anzupassen, wenn
            sich die Funktionalität der App oder die rechtlichen Vorgaben
            ändern. Maßgeblich ist jeweils die zuletzt veröffentlichte Fassung
            unter dieser URL.
          </p>
        </div>
      </section>
    </main>
  )
}
