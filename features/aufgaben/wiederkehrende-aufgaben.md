# Feature-Spec: Wiederkehrende Aufgaben (Fristen für alle Mitarbeiter)

**Tab:** App → Aufgaben → Unterrubrik „Wiederkehrend" · Web `/dashboard/manager` (Fristen-Verwaltung)
**Status:** Deployed
**Spec-Pfad:** `features/aufgaben/wiederkehrende-aufgaben.md`
**Migrationen:** 148 (Empfänger für alle) + 149 (Wiederkehrend, GF-Meldung) · Edge `notify-scheduled` v10
**App-Version:** 1.0.58+79

---

## Übersicht

Die GF-Fristen (Lexoffice-Buchung, OSS-Meldung, Zusammenfassende Meldung, USt-VA …) sind
wiederkehrende Pflichtaufgaben. Sie werden **nur von der Geschäftsführung** angelegt und an
einen beliebigen aktiven Mitarbeiter delegiert (GF, Manager, Finanzbuchhaltung, Mitarbeiter).
Der Empfänger sieht sie in der App im Aufgaben-Tab unter **„Wiederkehrend"** (neben
„Einmalig") mit Stichtag, Turnus und Empfängern und hakt sie dort ab. Damit springt die Frist
auf die nächste Periode. Wird sie **nicht bis zum Stichtag** abgehakt, bekommt die
Geschäftsführung einmalig pro Periode einen Push „Wiederkehrende Aufgabe nicht erledigt".

## Regeln

| Regel | Umsetzung |
|---|---|
| Nur GF legt an / bearbeitet / löscht / delegiert | `gf_add_reminder`, `gf_update_reminder`, `gf_delete_reminder` sind `is_gf()`-gated. App: „Neu"-Button in „Wiederkehrend" nur für GF; Web: Manager-Tab. |
| Empfänger = jeder aktive Mitarbeiter | `get_reminder_recipient_options` + `_gf_normalize_recipients` (Mig 148). Anzeige mit Kürzel und Volltext: GF, MGR, FIBU, MA. |
| Empfänger sieht nur eigene, GF alle | `gf_list_reminders` (vorhanden), App-Provider ohne Chef-Gate. |
| Abhaken durch Empfänger oder GF | `gf_complete_reminder`: Ack pro Periode, Vorrollen nur beim ersten Abhaken. |
| Popup beim Empfänger | `GfFristPopupHost` auf Übersicht (Mitarbeiter/FIBU) und Team (Chef); Button „Zu den Aufgaben" bzw. „Zum Manager". |
| GF-Meldung bei Nichterledigung | `gf_reminder_overdue_internal()` + Cron `gf-frist-overdue` (06:12 UTC) → Edge `notify-scheduled` Modus `frist_overdue` → Push an alle aktiven GF, einmal pro Periode (Ack `fristover:<id>:<due>`). |
| Push/WhatsApp im Erinnerungsfenster | unverändert (`gf_frist_reminders`, jetzt an alle Empfänger). |

**Verworfen (Mig 149 baut zurück):** automatische Einzel-Aufgabe pro Frist. Nutzer-Entscheidung:
wiederkehrende Pflichten gehören in eine eigene Rubrik, nicht zu den einmaligen Aufgaben.

## Code

- App: `lib/features/aufgaben/presentation/recurring_tasks_view.dart` (Liste, nutzt `FristCard`
  aus `manager_screen.dart`), `aufgaben_screen.dart` (SegmentedButton Einmalig | Wiederkehrend,
  FAB-Logik), `manager_models.dart` (`positionShort/positionLabel`, `chipLabel`),
  `gf_frist_popup.dart` (alle Empfänger, „Zu den Aufgaben"), `dashboard_screen.dart` (Popup-Host).
- Web: `ReminderDialog.tsx` (Empfänger mit Kürzel + Volltext), `src/lib/manager.ts`.
- DB/Edge: `supabase/migrations/148_*.sql`, `149_*.sql`, `supabase/functions/notify-scheduled/index.ts`.

## Verifikation (2026-09-20)

SQL-Tests mit Ilayda Cetinkaya (FIBU) als Empfängerin: Validierung akzeptiert; überfällige Frist
liefert genau einmal eine GF-Meldung (2 GF-Ziele), zweiter Aufruf leer; `flutter analyze` und
`tsc --noEmit` ohne Befund.
