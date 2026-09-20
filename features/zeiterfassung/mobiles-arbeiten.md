# Feature-Spec: Mobiles Arbeiten (Pauschalzeit für Remote-Mitarbeiter)

**Tab:** Mitarbeiter-App (Übersicht, KW-Detail, Team, Settings) · Web nur Schalter in `/dashboard/organisation`
**Status:** Deployed
**Spec-Pfad:** `features/zeiterfassung/mobiles-arbeiten.md`
**Migration:** `supabase/migrations/146_mobiles_arbeiten.sql` (angewendet 2026-09-20)
**App-Version:** 1.0.55+76 (Ergänzung Position Finanzbuchhaltung: Mig 147, App 1.0.56+77)

---

## Übersicht

Ein Mitarbeiter, der zu 100 % remote arbeitet, kann nicht am Kiosk stempeln. Der Chef/Manager
schaltet pro Mitarbeiter **„Mobiles Arbeiten"** ein (Standard: aus). Nur dann kann der
Mitarbeiter in der App pro Tag eine **Pauschalzeit in Stunden + Minuten** eintragen — ohne
Pausen, **sofort wirksam**, ohne Genehmigung. Für alle anderen Mitarbeiter ändert sich nichts.

## Regeln

| # | Regel |
|---|---|
| E1 | Jeder Tag erlaubt, auch ohne Arbeitsplanung. Tage ohne Planung tragen das Badge „nicht geplant". Kein Push. |
| E2 | Mitarbeiter: Eintrag/Änderung/Löschung nur für heute−7 bis heute (Berlin). Ältere Tage zeigen ein Schloss. |
| A2 | Chef/Manager (Hierarchie `_my_level > _level_of`): 28 Tage rückwirkend, wie Stempelkorrekturen. |
| A3 | Ein Eintrag pro Tag; erneutes Speichern überschreibt (Upsert). |
| A4 | Chef darf korrigieren und löschen, auch nach Abschalten des Flags. |
| A5 | Flag später aus: vorhandene Einträge bleiben im Ist, nur die Eingabe verschwindet. |
| A6 | Remote-Mitarbeiter bleiben in Planungspflicht, fallen aber aus „Nicht erschienen" heraus. |
| — | Keine genehmigte Abwesenheit am selben Tag. Obergrenze 24 h/Tag. Keine ArbZG-Pausenlogik. |

## Technik

- **Speicherort:** `pauschal_entries` mit `kind = 'mobil'`, `status = 'approved'`. Genehmigte Pauschalen
  werden bereits in `get_employee_balance`, `get_all_employees_month_hours`, `get_month_completion_facts`
  und `get_employee_archive_days` addiert — keine Änderung dort. Web-Statistik/Archiv zeigen Mobil-Zeit
  in der Spalte „Pauschal".
- **Flag:** `employees.mobiles_arbeiten boolean NOT NULL DEFAULT false`.
- **Unique-Index:** `(employee_id, datum) WHERE kind = 'mobil'`.
- **RPCs (SECURITY DEFINER, nur `authenticated`):**
  - `admin_set_mobiles_arbeiten(p_employee_id, p_enabled)` — Chef + Hierarchie.
  - `mobile_work_upsert(p_datum, p_minutes, p_note, p_employee_id?)` — selbst (Flag, 7 Tage) / Chef (28 Tage).
  - `mobile_work_delete(p_id)` — Eigentümer (7 Tage) / Chef (28 Tage).
  - `mobile_work_list(p_employee_id?, p_from?, p_to?)` — inkl. `planned` (Schicht oder Verfügbarkeit).
  - Helper `_mobile_window_floor()` = Berlin-heute − 7.
- **Angepasst:** `pauschal_list`, `get_chef_pauschal_notifications` (nur `kind = 'pauschal'`);
  `get_team_no_shows`, `get_employee_no_shows`, `get_no_shows_internal` (Flag-Träger ausgenommen).

## Platzierung in der App

- **Chef:** Settings → Mitarbeiter → Bearbeiten → Schalter „Mobiles Arbeiten" (unter „Aktiv").
  Mitarbeiterliste: Haus-Symbol (Bernstein) bei aktivem Flag.
- **Mitarbeiter (nur bei Flag):** Übersicht → Karte „Mobiles Arbeiten" (Monatssumme, letzte 3
  Einträge, Button „Eintragen", Liste). KW-Detail → pro Tag Zeile „Mobil · 6h 30m" mit Stift bzw.
  Button „Stunden eintragen"; Schloss außerhalb der 7 Tage.
- **Chef:** Team → Mitarbeiter → Monatskarte mit Bernstein-Segment „Mobil", Chip → Liste
  (ändern/löschen), Kopf-Button „Mobil-Zeit eintragen", Hinweis-Banner. KW-Ansicht: Mobil-Zeile
  mit Stift, „+ Mobil"-Button, Badge „Nicht geplant" für ungeplante Tage.
- **Farbe/Icon:** `Icons.home_work_rounded`, Bernstein `#FBBF24`.

## Code

- App: `lib/features/mobil/` (data: `mobile_work_entry.dart`, `mobile_work_repository.dart`;
  presentation: `mobile_work_editor_sheet.dart`, `mobile_work_card.dart`, `mobile_work_row.dart`),
  Einbindung in `dashboard_screen.dart`, `week_detail_screen.dart`, `employee_detail_screen.dart`,
  `team_week_screen.dart`, `employee_edit_screen.dart`, `settings_screen.dart`.
- Web: `EditMemberDialog.tsx` (Schalter), `api/organisation/members/[id]/route.ts` (Zod-Feld).

## Verifikation (2026-09-20)

SQL-Funktionstest mit dem Demo-Mitarbeiter (simulierter Auth-Kontext, per Exception zurückgerollt):
Insert 390 min → Upsert 420 min (eine Zeile) → `get_employee_balance` +420 → Negativfälle
(Zukunft, 8 Tage zurück, 0 min, 25 h, ohne Flag) abgelehnt → `pauschal_list` ohne Mobil-Zeile →
Löschen als Eigentümer. `flutter analyze` und `tsc --noEmit` ohne Befund.

## Ergänzung 2026-09-20: Position „Finanzbuchhaltung" + „Aktiv = beschäftigt" (Migration 147)

- Neue Position `finanzbuchhalter`: Rechte wie Mitarbeiter (Level 1), berichtet direkt an die GF
  (Organigramm Ebene 2 neben Manager, lila). Zusätzlich **Lesezugriff** auf Stunden, Abwesenheiten
  und Urlaubstage aller Mitarbeiter über den App-Tab **„Lohn"** (read-only; nutzt dieselben RPCs wie
  die Chef-Ansicht, Gate `is_chef_or_payroll()`).
- `employees.is_active` heißt jetzt „beschäftigt". Wer Mobiles Arbeiten aktiv hat, wird am Kiosk
  automatisch ausgeblendet (Web-Kiosk und Toggle-Route filtern `mobiles_arbeiten = false`). Dadurch
  erscheinen Remote-Mitarbeiter überall (Skill-Matrix, Team, Urlaub, Aufgaben) ohne Extra-Pflege.
- Web: Position in Typen/Zod/Dialogen/Organigramm/Skill-Matrix (Kürzel FIBU); Labels „Aktiv (beschäftigt)".
- Gepatchte RPCs (Gate): get_employee_balance, get_time_entries, get_absence_summary, get_vacation_balance,
  get_vacation_overview, get_employee_vacation_months, get_archive_employees, get_employee_archive*,
  get_month_completion_facts, mobile_work_list, pauschal_list, get_team_absences,
  get_all_employees_month_hours (jetzt SECURITY DEFINER + Gate), admin_update_employee (2 Overloads),
  admin_create_employee (Position erlaubt).
