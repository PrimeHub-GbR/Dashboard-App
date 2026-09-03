# Product Requirements Document — PrimeHub Dashboard v2

_Letzte Aktualisierung: 2026-09-03_

## Vision

Zentrales Operations-Dashboard der PrimeHub GbR. Ein Ort für alles, was der Betrieb täglich
braucht — Warenwirtschaft, Marktplätze, Personal und Automatisierung. Das Dashboard hat den
Telegram-basierten Zugang zu n8n abgelöst und ist inzwischen die Bedienoberfläche für den
gesamten operativen Alltag.

**Leitsatz:** Der Mensch entscheidet, das System arbeitet. Jede wiederkehrende Handarbeit wird
zu einem N8N-Workflow, den das Dashboard anstößt und dessen Ergebnis es sichtbar macht.

## Nutzer

| Rolle | Anzahl | Zugang |
|---|---|---|
| Admin / Geschäftsführung | 1 | alles |
| Manager | 1–2 | operative Tabs, keine GF-Themen (CashFlow, Manager) |
| Staff | 2–3 | Zeiterfassung, Aufgaben, Lager — über Web und Mitarbeiter-App |
| Kiosk (iPad im Lager) | 1 Gerät | nur Check-in/Check-out |

## Plattformen

| Plattform | Stand |
|---|---|
| Web-Dashboard (Next.js, Vercel) | live auf `dashboard.primehubgbr.com` |
| Mitarbeiter-App (Flutter, iOS + Android) | im Store-Testbetrieb (TestFlight / Closed Test) |
| Öffentliche Website `primehubgbr.com` | live, über den Tab „Webseite" an-/abschaltbar |

---

## Feature-Bestand

Der Detailstand steht in [`features/INDEX.md`](../features/INDEX.md); hier die fachliche Sicht.

### Marktplätze & Preise

| Feature | Tab | Zweck |
|---|---|---|
| Workflow Hub | `/workflow-hub` | Datei hoch, N8N-Workflow los, Ergebnis runter |
| Workflow Monitor | `/workflows` | N8N-Workflows sehen, schalten, Statistik |
| Bestellungen | `/orders` | Google Drive → Supabase → durchsuchbare Tabelle |
| Preisdatenbank | `/prices` | SKU/ASIN, EAN-Map, Repricer-Status |
| Repricer | `/repricer` | Upload, Preisberechnung in N8N, Download |
| Rebuy-Scraper | `/rebuy` | Buchankaufspreise scrapen (LXC-Container) |
| Buchpreisbindung | `/buchpreisbindung` | Amazon-Scraping gegen VLB, Excel-Archiv |
| **PlentyONE-Migration** | `/plentyone` | Amazon-Export → VLB-Anreicherung + Cover → PlentyONE → **eBay** |

### Lager & Logistik

| Feature | Tab | Zweck |
|---|---|---|
| Wareneingang | `/wareneingang` | Palettenannahme, N8N-Mail-Erkennung |
| Lager-Nachbestellung | `/lager` | QR-Etiketten drucken, App scannt und bestellt nach |
| Lieferantenlisten | `/lieferantenlisten` | Bezugsquellen je Artikel pflegen |

### Personal & Organisation

| Feature | Tab | Zweck |
|---|---|---|
| Zeiterfassung | `/zeiterfassung` | Check-in, Stundenauswertung, Schichtplan, ArbZG |
| Aufgaben | `/aufgaben` | To-dos, Delegation, Kommentare, Archiv |
| Organisation | `/organisation` | Mitarbeiterstammdaten und Dokumente |
| Skill-Matrix | `/skill-matrix` | Kompetenzen: kann / lernt / noch nicht |
| Manager (GF) | `/manager` | Pflichtfristen und Firmeninfos, nur Geschäftsführung |

### Kommunikation & Finanzen

| Feature | Tab | Zweck |
|---|---|---|
| Kommunikation | `/kommunikation` | WhatsApp Business: Hub, Vorlagen, Versandhistorie |
| CashFlow | `/cashflow` | Barmittel je Monatsende, Trend — Admin/Manager |
| Webseite | `/website` | öffentliche Landingpage an/aus |

---

## Aktueller Schwerpunkt: Marktplatz-Expansion

**Ziel:** Das Amazon-Sortiment (~2.023 Bücher) ohne Handarbeit auf weitere Marktplätze bringen.
PlentyONE ist die Drehscheibe, Amazon bleibt unangetastet (externer Repricer, nur lesen).

| Stufe | Inhalt | Status |
|---|---|---|
| 1 | Amazon-Export → VLB-Anreicherung → Artikel-, Eigenschaften-CSV + Cover | live |
| 2 | **eBay-Vollautomatisierung** — Listings, Merkmale, Prüfung, Bericht | in Arbeit |
| 3 | Kaufland nach demselben Muster | geplant |
| 4 | Bestandsautomatik / Amazon MCF für Marktplatz-Aufträge | Folgeprojekt |

Spec: [`features/plentyone/ebay-vollautomatisierung.md`](../features/plentyone/ebay-vollautomatisierung.md)

**Betriebsrhythmus:** alle zwei Wochen. Der Nutzer zieht den Amazon-Bericht selbst aus Seller
Central und lädt ihn hoch — bewusst **ohne SP-API**. Danach läuft die Kette allein bis zum
prüfbereiten eBay-Listing; der Live-Start bleibt hinter einer ausdrücklichen Freigabe.

## Erfolgskriterien

- Kein Kernprozess hängt mehr an Telegram.
- Bestellungssuche unter 2 Sekunden bei 10.000 Zeilen.
- Preisdatenbank täglich aktuell (geplanter N8N-Sync).
- Ein Marktplatz-Zyklus kostet den Nutzer höchstens: Export ziehen, hochladen, Bericht lesen,
  Start freigeben.
- Jede automatisch übersprungene Zeile ist im Dashboard benannt — nichts fällt still weg.

## Randbedingungen

- **N8N-First:** Prozesslogik läuft in N8N (`https://n8n.primehubgbr.com`), nie im Next.js-Backend.
  Claude darf N8N-Workflows nur lesen — Änderungen macht der Nutzer nach Anleitung selbst.
- **Buchpreisbindung:** eBay-Preise sind gebundene Ladenpreise (Verkaufspreis-ID 7 aus dem VLB).
  Kein Preisvorschlag, kein Listing ohne gültigen Preis.
- **Amazon:** ausschließlich lesend. Keine Preise, Artikeldaten oder Bestände zurückschreiben.
- **VLB:** höchstens 2 gleichzeitige Sessions — ein Lauf belegt beide, Logout ist Pflicht.
- **Auth:** Single-Tenant, keine Selbstregistrierung. Supabase Auth + RLS auf jeder Tabelle.
- **Stack:** Next.js (App Router), TypeScript, Tailwind, shadcn/ui, Supabase, Vercel.

## Nicht-Ziele

- Kein eigener Repricer — Amazon bleibt beim externen Anbieter.
- Keine Schreibzugriffe zurück nach Google Drive (Drive = Quelle, Supabase = Master).
- Kein Multi-Language-Support.
- Keine Amazon-SP-API-Anbindung (bewusst gestrichen, siehe Betriebsrhythmus).
- OTTO als Marktplatz (keine Bücher-Kategorie) — geparkt.
