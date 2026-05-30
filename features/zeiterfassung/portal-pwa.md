# Feature-Spec: Mitarbeiter-Portal als PWA + Wochenplanungs-Abgabe

**Tab:** `/portal` (eigener Bereich neben `/dashboard`)
**Status:** In Progress
**Spec-Pfad:** `features/zeiterfassung/portal-pwa.md`

---

## Übersicht

Das bestehende Mitarbeiter-Portal (`src/app/portal/`, PIN-basierter Login) wird zu einer installierbaren PWA ausgebaut und um eine Wochenplanungs-Abgabe ergänzt. Mitarbeitende können das Portal über ihren Browser („Zum Startbildschirm hinzufügen" auf iOS / „App installieren" auf Android) wie eine native App nutzen — ohne App-Store, ohne Konto-Erstellung, ohne kostenpflichtige Entwickler-Programme.

---

## User Stories

### Mitarbeiter
- Ich kann das Portal vom Startbildschirm starten wie eine App.
- Ich kann meine Verfügbarkeiten pro Wochentag (von–bis) für die kommenden Wochen eintragen.
- Ich kann bereits abgegebene Wochenplanungen einsehen und anpassen.
- Ich werde beim ersten Login zur Bestätigung der Datenschutzerklärung aufgefordert.
- Ich sehe weiterhin meine Ist/Soll/Differenzstunden wie zuvor.

### Admin (Geschäftsführung)
- Sieht alle eingereichten Wochenplanungen serverseitig in `employee_schedule_requests` (Web-UI im Admin-Dashboard nicht Teil dieser Spec).
- Es gibt **keinen** Genehmigungs-Workflow in v1 — Mitarbeitende geben nur ihre Verfügbarkeiten an, Status bleibt unbeachtet.

---

## Funktionale Anforderungen

### Wochenplanungs-Abgabe
- Wochen-Stepper: laufende KW + nächste 4 Wochen (= 5 Wochen wählbar)
- Pro Wochentag (Mo–So): Toggle „verfügbar / nicht verfügbar", bei verfügbar zwei native `<input type="time">`-Picker (von / bis), Default 09:00–17:00
- Optionales Notizfeld (max. 500 Zeichen)
- Speichern: UPSERT auf `employee_schedule_requests` (UNIQUE auf `employee_id, week_start`)
- Hinweis-Banner: „Abgabe bis Freitag 18:00 für die folgende Woche"
- Frist-Badge: rote Badge „Frist überschritten" wenn Freitag 18:00 verstrichen und die Woche noch nicht begonnen hat — Speichern bleibt trotzdem möglich
- Status-Badge: „Abgegeben" wenn bereits eingereicht, sonst „Noch nicht abgegeben"

### DSGVO-Bestätigung
- Beim ersten Login (`employees.privacy_accepted_at IS NULL`) zeigt der Login-Screen einen Pflicht-Dialog
- Dialog enthält Checkbox + Link zur Datenschutzerklärung (`/portal/datenschutz`)
- Bestätigung setzt `employees.privacy_accepted_at = now()` über `POST /api/zeiterfassung/portal/accept-privacy`
- Erst danach Weiterleitung ins Dashboard

### PWA-Installierbarkeit
- Web-App-Manifest unter `/manifest.webmanifest` (Name „PrimeHub App", Short-Name „PrimeHub")
- App-Icon als SVG (`/icons/app-icon.svg`, maskable + any), Theme-Color `#0a1a10` (Forest-Green-Dark)
- Service Worker `/sw.js` (network-first für Portal-Routen, cache-first für statische Assets, API-Calls nie gecacht)
- Meta-Tags im Portal-Layout: `apple-mobile-web-app-capable`, `theme-color`, `apple-touch-icon`, `manifest`
- Standalone-Display, Portrait-Orientation, Start-URL `/portal`

### Tab-Navigation
- Header (`PortalHeader.tsx`) sticky oben: Avatar + Name + Logout-Button
- Tab-Bar: „Übersicht" (`/portal/dashboard`) und „Wochenplanung" (`/portal/planung`)
- Beide Seiten gemeinsam genutzt: Übersicht (KPI/Chart/Buchungen) und Planung

---

## Nicht-funktionale Anforderungen
- Mobile-first Layout, `max-w-lg`, Touch-Targets ≥ 44 px
- Branding konsistent zu Dashboard: Forest Green (`#005e30` light, `#1ad06a` dark)
- Sprache: Deutsch
- Auth via `x-kiosk-token` Header + PIN (unverändert vom bestehenden Portal)
- DSGVO-konformer Erst-Login-Flow

---

## Tech Design

### Neue Datenbank-Spalte (Migration 040)
- `employees.privacy_accepted_at TIMESTAMPTZ` (nullable) — Zustimmungsdatum, NULL = noch nicht bestätigt

### Neue API-Routen
- `GET  /api/zeiterfassung/portal/availability?employee_id=&from=` — Liste der Abgaben ab gegebenem Montag (`x-kiosk-token`)
- `POST /api/zeiterfassung/portal/availability` — UPSERT auf `employee_schedule_requests`
- `POST /api/zeiterfassung/portal/accept-privacy` — setzt `privacy_accepted_at`

### Erweiterte API-Routen
- `POST /api/zeiterfassung/portal/login` — Response um `privacy_accepted_at` ergänzt
- `GET /api/zeiterfassung/portal/me` — Response um `submissions` (kommende 8 Wochen) ergänzt

### Neue Komponenten & Seiten
- `src/components/zeiterfassung/portal/PortalHeader.tsx` — Sticky-Header + Tabs
- `src/components/zeiterfassung/portal/PortalAvailability.tsx` — Wochenplanungs-Formular
- `src/components/zeiterfassung/portal/PWAInit.tsx` — Service-Worker-Registrierung
- `src/app/portal/planung/page.tsx` — Seite für die Wochenplanung
- `src/app/portal/datenschutz/page.tsx` — Datenschutzerklärung (allgemeiner Entwurf, vor Live-Gang juristisch prüfen)

### Geänderte Dateien
- `src/app/portal/layout.tsx` — Metadata + Viewport (manifest, theme-color, apple-icon), `<PWAInit />` eingebunden
- `src/app/portal/dashboard/page.tsx` — Wrapped jetzt mit `PortalHeader`
- `src/components/zeiterfassung/portal/PortalDashboard.tsx` — eigenen Header entfernt (kommt jetzt aus `PortalHeader`)
- `src/components/zeiterfassung/portal/PortalLogin.tsx` — Wordmark statt Clock-Icon, Privacy-Dialog als Schritt 3

### Neue statische Assets
- `public/manifest.webmanifest` — PWA-Manifest
- `public/sw.js` — Service Worker (handgeschrieben, ohne Library)
- `public/icons/app-icon.svg` — App-Icon (512×512)
- `public/icons/app-icon-maskable.svg` — Maskable-Variante
- `public/icons/wordmark.svg` — Wordmark (für Login-Header, falls Image-Variante gewünscht)

---

## Akzeptanzkriterien

- [ ] Migration 040 läuft sauber gegen Prod ohne Web-Regression
- [ ] PIN-Login + Privacy-Dialog erscheinen beim ersten Einloggen eines Mitarbeitenden
- [ ] Nach Bestätigung wird `employees.privacy_accepted_at` gesetzt und der Dialog erscheint beim nächsten Login nicht mehr
- [ ] Wochenplanung kann pro Woche eingetragen und gespeichert werden, UPSERT respektiert UNIQUE auf `(employee_id, week_start)`
- [ ] Hinweis-Banner und Frist-Badge erscheinen korrekt
- [ ] Tab-Navigation funktioniert zwischen `/portal/dashboard` und `/portal/planung`
- [ ] PWA ist auf Android und iOS installierbar (manifest + Service Worker)
- [ ] `npm run build` ist grün
- [ ] Datenschutzerklärung unter `/portal/datenschutz` öffnet sich
- [ ] Bestehender Dashboard-Bereich `/dashboard/*` ist nicht beeinträchtigt

---

## Bekannte offene Punkte (für Phase 2)

- Manager-Sicht in der App (read-only Team-Übersicht)
- Push-Notifications (FCM / Web-Push) bei Wochenplanungs-Erinnerungen
- Feiertage NRW automatisch im Soll abziehen
- PNG-Icons für ältere iOS-Versionen (heute SVG, was auf iOS 16+ funktioniert; alte Geräte fallen auf Default zurück)
- Optional: Flutter-App mit eigener E-Mail+PW-Auth, falls native Features (Biometrie, robuster Push) gebraucht werden

---

## Deployment

**Production URL:** https://dashboard.primehubgbr.com/portal
**Stand:** 2026-05-31 — Implementation abgeschlossen, Deploy ausstehend
