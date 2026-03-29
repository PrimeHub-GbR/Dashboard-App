# Feature-Spec: Zeiterfassungssystem

**Tab:** `/dashboard/zeiterfassung`
**Status:** Deployed
**Spec-Pfad:** `features/zeiterfassung/overview.md`

---

## Übersicht

Vollständiges Zeiterfassungssystem als neuer Dashboard-Tab. Mitarbeiter stempeln sich via PIN an einem iPad ein/aus. Admins verwalten Mitarbeiter, korrigieren Zeiten, planen Schichten und erhalten Überstundenwarnungen via N8N (Telegram/Email).

---

## User Stories

### Admin
- Mitarbeiter anlegen (Name, PIN, Sollstunden/Monat, Anzeigefarbe) und löschen
- Aktuell eingestempelte Mitarbeiter live sehen (Realtime)
- Gesamtstunden pro Mitarbeiter für den aktuellen Kalendermonat sehen
- Historische Zeiten nach Mitarbeiter und Monat filtern
- Einzelne Zeiteinträge korrigieren (Uhrzeit, Notiz)
- Schichtplanung: Soll-Zeiten pro Mitarbeiter und Tag eintragen
- Systemeinstellungen konfigurieren (Überstundenschwelle, Pausenregeln, N8N-Webhook)
- Überstundenwarnungen via Telegram oder Email empfangen

### Mitarbeiter (Staff)
- Eigene abgeleisteten Zeiten einsehen
- Am Kiosk-iPad einstempeln und ausstempeln (PIN-basiert)

### Kiosk (iPad, ohne Login)
- Mitarbeiter per Touch auswählen
- PIN eingeben → Einstempeln oder Ausstempeln
- Bestätigung mit aktueller Uhrzeit / geleisteten Stunden
- ArbZG-Hinweis wenn ≥ 6h ohne Pause

---

## Funktionale Anforderungen

### Zeiterfassung
- Check-in/Checkout via 4-stellige PIN (kein Supabase-Login erforderlich am Kiosk)
- Zeitzone: immer `Europe/Berlin` (automatische Sommer-/Winterzeit-Umstellung)
- Zeiten werden in UTC gespeichert, überall in Berliner Ortszeit angezeigt
- Doppeltes Einstempeln wird verhindert (DB-Constraint)

### ArbZG-Pausenberechnung (§ 4 ArbZG)
Beim Ausstempeln wird die Pause automatisch berechnet und gespeichert:
- Bis 6 Stunden (≤ 360 min): keine Pause
- 6–9 Stunden (361–540 min): 30 Minuten Pflichtpause
- Über 9 Stunden (> 540 min): 45 Minuten Pflichtpause

Kein automatisches Ausstempeln — nur visueller Hinweis ab 6h.

### Überstundenwarnungen
- Nach jedem Checkout: Monatsstand berechnen
- Bei Überschreitung des konfigurierten Schwellwerts: N8N-Webhook triggern (fire-and-forget)
- N8N-Workflow sendet Telegram-Nachricht oder Email

### Schichtplanung
- Admin trägt Soll-Zeiten (Start/Ende) pro Mitarbeiter und Tag ein
- Kalender-Ansicht nach Woche/Monat

---

## Nicht-funktionale Anforderungen

- Kiosk-URL ohne Sidebar, iPad-optimiert (min. 64px Touch-Targets)
- Realtime-Update der Live-Übersicht (Supabase Realtime + 10s Polling-Fallback)
- Alle sensiblen Operationen (Anlegen, Löschen, Korrektur) nur via Admin-Rolle
- PIN-Endpunkte geschützt via `x-kiosk-token` Header (nicht via Supabase-Auth)

---

## Tech Design

### Neue Tabellen (Migrations 018–020)
- `employees` — Mitarbeiterstammdaten
- `time_entries` — Zeitbuchungen (Check-in/out, ArbZG-Pause)
- `shift_plans` — Schichtplanung (Soll-Zeiten)
- `time_tracking_settings` — Systemeinstellungen (Singleton)
- DB-Funktion: `get_employee_month_hours(employee_id, year, month)`

### Neue API-Routen
- `GET/POST /api/zeiterfassung/employees`
- `PATCH/DELETE /api/zeiterfassung/employees/[id]`
- `POST /api/zeiterfassung/checkin` (kiosk-token, kein Supabase-Auth)
- `POST /api/zeiterfassung/checkout` (kiosk-token, kein Supabase-Auth)
- `GET /api/zeiterfassung/entries`
- `PATCH /api/zeiterfassung/entries/[id]`
- `GET/POST /api/zeiterfassung/shifts`
- `PATCH/DELETE /api/zeiterfassung/shifts/[id]`
- `GET/PATCH /api/zeiterfassung/settings`

### Neue Pages & Komponenten
- `src/app/dashboard/zeiterfassung/page.tsx`
- `src/app/dashboard/zeiterfassung/einchecken/layout.tsx` (kein Sidebar)
- `src/app/dashboard/zeiterfassung/einchecken/page.tsx`
- `src/components/zeiterfassung/ZeiterfassungClient.tsx` (6 Admin-Tabs)
- `src/components/zeiterfassung/KioskCheckin.tsx`

### Neue Env-Variablen
```
NEXT_PUBLIC_KIOSK_TOKEN=<32-char random>
N8N_ZEITERFASSUNG_WEBHOOK_URL=https://n8n.primehubgbr.com/webhook/zeiterfassung-overtime
```

---

## N8N-Workflow (manuell im Dashboard anlegen)

**Schritt-für-Schritt-Anleitung wird nach Implementierung bereitgestellt.**

Struktur: `Webhook (POST /zeiterfassung-overtime)` → `Respond 202` → `Switch: Telegram / Email` → Benachrichtigung senden

---

## Akzeptanzkriterien

- [ ] Mitarbeiter anlegen, löschen, bearbeiten (Admin)
- [ ] PIN-Check-in am Kiosk ohne Login funktioniert
- [ ] Doppeltes Einstempeln wird verhindert
- [ ] ArbZG-Pause wird korrekt berechnet (Test: 7h → 30min, 10h → 45min)
- [ ] Live-Übersicht zeigt aktuell Eingestempelte in Echtzeit
- [ ] Monatsauswertung korrekt in Europe/Berlin-Zeit
- [ ] Historische Zeiten filterbar nach Monat + Mitarbeiter
- [ ] Admin kann Zeiteinträge korrigieren
- [ ] Schichtplanung: Schichten eintragen und anzeigen
- [ ] Überstundenwarnung-Webhook wird bei Überschreitung gefeuert
- [ ] Kiosk-Seite ohne Sidebar, touch-optimiert
- [ ] Mitarbeiter (Staff) sieht eigene Zeiten

---

## Deployment

**Production URL:** https://dashboard.primehubgbr.com
**Deployed:** 2026-03-29
**Build:** Ready
**Vercel Deployment:** https://app-rf3ut81zi-primehubgbr-2551s-projects.vercel.app
**Letzte Änderungen:**
- ZeitKorrektur.tsx: Automatische Neuberechnung von break_minutes bei Zeitänderung im Edit-Dialog
- entries/[id]/route.ts: Server-seitiger Safety-Net für ArbZG-Pausenberechnung
- auth_method Feld in TimeEntry (Migration 029)
- Geschäftsführer-Ausschluss aus Statistiken (Migration 030)
- PIN nullable (Migration 031): Self-Setup-Flow beim ersten Kiosk-Check-in, Admin-PIN-Reset
- Kiosk: Anwesenheitsindikator (grüner Punkt) und Manager/Mitarbeiter-Trennung
