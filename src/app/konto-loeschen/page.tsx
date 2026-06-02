import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Konto und Daten löschen – PrimeHub App",
  description:
    "Anleitung zur Löschung des Kontos und der zugehörigen Daten in der PrimeHub Mitarbeiter-App.",
}

export default function KontoLoeschenPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-12 text-slate-800">
      <h1 className="mb-2 text-3xl font-bold">Konto und Daten löschen</h1>
      <p className="mb-8 text-sm text-slate-500">
        Gilt für die PrimeHub Mitarbeiter-App (Android &amp; iOS). Stand: 3. Juni
        2026.
      </p>

      <section className="prose prose-slate max-w-none space-y-6">
        <div>
          <h2 className="text-xl font-semibold">Verantwortlicher</h2>
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
          <h2 className="text-xl font-semibold">So beantragen Sie die Löschung</h2>
          <p>
            PrimeHub ist eine interne Mitarbeiter-App. Konten werden vom
            Arbeitgeber angelegt und verwaltet. Um Ihr Konto und die zugehörigen
            personenbezogenen Daten löschen zu lassen, senden Sie eine E-Mail an{" "}
            <a className="underline" href="mailto:primehubgbr@gmail.com">
              primehubgbr@gmail.com
            </a>{" "}
            mit folgenden Angaben:
          </p>
          <ul className="list-disc pl-6">
            <li>Betreff: „Kontolöschung PrimeHub App"</li>
            <li>Ihr vollständiger Name</li>
            <li>Die mit dem Konto verknüpfte E-Mail-Adresse</li>
          </ul>
          <p>
            Wir bestätigen den Eingang und führen die Löschung innerhalb von
            <strong> 30 Tagen</strong> durch.
          </p>
        </div>

        <div>
          <h2 className="text-xl font-semibold">Welche Daten gelöscht werden</h2>
          <ul className="list-disc pl-6">
            <li>Anmeldedaten (E-Mail-Adresse, Zugangsdaten)</li>
            <li>Profildaten (Name, Telefon, Anschrift)</li>
            <li>Wochenplanungs-Anfragen und Notizen</li>
            <li>Aufgaben, Kommentare und Anhänge</li>
            <li>Geräte-Token für Push-Benachrichtigungen</li>
          </ul>
        </div>

        <div>
          <h2 className="text-xl font-semibold">
            Daten mit gesetzlicher Aufbewahrungspflicht
          </h2>
          <p>
            Bestimmte Arbeitszeit- und lohnrelevante Datensätze müssen wir
            aufgrund gesetzlicher Vorgaben aufbewahren und können sie erst nach
            Ablauf der Fristen löschen:
          </p>
          <ul className="list-disc pl-6">
            <li>
              Arbeitszeit-Daten: 2 Jahre nach Ende des Kalenderjahres (§ 16 Abs.
              2 ArbZG).
            </li>
            <li>
              Steuer- und lohnrelevante Datensätze: 10 Jahre (§ 257 HGB, § 147
              AO).
            </li>
          </ul>
          <p>
            Diese Daten werden nach Ablauf der jeweiligen Frist automatisch
            gelöscht oder anonymisiert.
          </p>
        </div>

        <div>
          <h2 className="text-xl font-semibold">Weitere Informationen</h2>
          <p>
            Details zur Verarbeitung Ihrer Daten finden Sie in der{" "}
            <a className="underline" href="/datenschutz-app">
              Datenschutzerklärung der PrimeHub App
            </a>
            .
          </p>
        </div>
      </section>
    </main>
  )
}
