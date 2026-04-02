# WhatsApp Business Kommunikation

## Status: Planned
**Created:** 2026-04-02
**Last Updated:** 2026-04-02

## Dependencies
- Requires: `_foundation/login` — nur authentifizierte Nutzer dürfen Nachrichten senden
- Requires: `organisation` (employees-Tabelle) — Empfänger + Telefonnummern
- Requires: `aufgaben/overview` — Kontext-Button bei Tasks (Aufgaben-Erinnerung)
- Requires: `zeiterfassung/overview` — Kontext-Button bei Mitarbeitern (Stunden-Report)
- Extern: N8N WhatsApp Business Cloud Node (wird nach dem Dashboard eingerichtet)

## Übersicht

Zentraler Kommunikations-Tab `/dashboard/kommunikation` + kontextbezogene Schnellsenden-Buttons in bestehenden Tabs. Nachrichten werden via N8N WhatsApp Business Cloud Node gesendet. Das Dashboard ist der Auslöser — N8N übernimmt den Versand.

---

## User Stories

### Zentraler Kommunikations-Tab
- Als Admin möchte ich einen Freitext an einen einzelnen Mitarbeiter senden, damit ich schnell individuell kommunizieren kann.
- Als Admin möchte ich eine Gruppen-Nachricht an mehrere (oder alle) Mitarbeiter gleichzeitig senden, damit ich keine Einzelnachrichten schreiben muss.
- Als Admin möchte ich die komplette Versandhistorie einsehen (Datum, Empfänger, Text, Absender, Kontext, Status), damit ich nachvollziehen kann wer wann was erhalten hat.

### Kontext-Buttons in Aufgaben
- Als Admin möchte ich direkt bei einer Aufgabe einen "WhatsApp-Erinnerung senden"-Button haben, damit der zugewiesene Mitarbeiter sofort eine vorformulierte Erinnerung erhält.
- Als Admin möchte ich den vorformulierten Erinnerungstext vor dem Senden sehen und anpassen können, damit die Nachricht im richtigen Ton ist.

### Kontext-Button in Zeiterfassung
- Als Admin möchte ich bei einem Mitarbeiter in der Zeiterfassung einen "Stunden-Report senden"-Button haben, damit der Mitarbeiter seine aktuellen Stunden per WhatsApp erhält.
- Als Admin möchte ich den generierten Stunden-Report vor dem Senden bestätigen, damit keine falschen Daten versendet werden.

---

## Acceptance Criteria

### Zentraler Tab `/dashboard/kommunikation`

#### Layout
- [ ] Sidebar-Eintrag "Kommunikation" mit MessageCircle-Icon erscheint zwischen Aufgaben und Organisation
- [ ] Tab zeigt zwei Bereiche: "Neue Nachricht" (links/oben) und "Versandhistorie" (rechts/unten)

#### Neue Nachricht — Freitext
- [ ] Empfänger-Auswahl: Dropdown mit allen aktiven Mitarbeitern (Name + Telefon)
- [ ] Textarea für Freitext (max. 1000 Zeichen, Zeichenzähler sichtbar)
- [ ] Senden-Button ist deaktiviert wenn Empfänger oder Text fehlt
- [ ] Nach erfolgreichem Senden: Toast "Nachricht gesendet" + Formular wird zurückgesetzt
- [ ] Bei Fehler (kein Telefon hinterlegt, N8N nicht erreichbar): Toast mit Fehlermeldung

#### Neue Nachricht — Gruppen-Nachricht
- [ ] Checkbox "An alle senden" → alle aktiven Mitarbeiter werden ausgewählt
- [ ] Alternativ: Multi-Select für mehrere einzelne Empfänger
- [ ] Vorschau: "Wird an X Empfänger gesendet" vor dem Abschicken
- [ ] Gruppen-Versand sendet eine separate N8N-Anfrage pro Empfänger

#### Versandhistorie
- [ ] Tabelle mit Spalten: Datum/Uhrzeit, Empfänger, Nachrichtentext (gekürzt auf 80 Zeichen), Kontext (Manuell / Aufgabe / Zeiterfassung), Absender, Status (Gesendet ✅ / Fehlgeschlagen ❌)
- [ ] Klick auf eine Zeile öffnet Detail-Sheet mit vollständigem Nachrichtentext
- [ ] Filterbar nach: Empfänger, Kontext, Status, Zeitraum
- [ ] Pagination: 20 Einträge pro Seite
- [ ] Einträge der letzten 90 Tage werden angezeigt

### Kontext-Button in Aufgaben

- [ ] Button "WhatsApp senden" erscheint in der Aufgaben-Detailansicht bei Tasks mit zugewiesenem Mitarbeiter, der eine Telefonnummer hat
- [ ] Button ist ausgegraut (mit Tooltip "Kein Mitarbeiter / keine Telefonnummer") wenn Voraussetzungen fehlen
- [ ] Klick öffnet Dialog mit vorformuliertem Text:
  ```
  Hallo [Name], eine kurze Erinnerung: Die Aufgabe "[Titel]" ist fällig am [Datum]. Bitte melde dich falls du Fragen hast.
  ```
- [ ] Text ist editierbar vor dem Senden
- [ ] Nach dem Senden: Button-Label wechselt zu "Gesendet ✓" (für diese Session)

### Kontext-Button in Zeiterfassung

- [ ] Button "Stunden senden" erscheint in der Mitarbeiter-Detailansicht der Zeiterfassung
- [ ] Klick öffnet Dialog mit vorformuliertem Text:
  ```
  Hallo [Name], hier deine aktuellen Stunden: Diese Woche [X]h, dieser Monat [Y]h von [Ziel]h. Stand: [Datum]
  ```
- [ ] Stundenwerte werden live aus der Zeiterfassung geladen (kein hartcodierter Text)
- [ ] Text ist editierbar vor dem Senden

---

## Edge Cases

- **Mitarbeiter ohne Telefonnummer:** Buttons sind deaktiviert + Tooltip. Im Zentralen Tab wird der Mitarbeiter in der Auswahl angezeigt aber mit "(kein Telefon)" markiert und ist nicht wählbar.
- **N8N nicht erreichbar:** Dashboard zeigt Fehler-Toast. Nachricht wird trotzdem in `message_logs` mit Status `failed` gespeichert.
- **Doppeltes Senden:** Kein technischer Block, aber Senden-Button wird nach Klick für 3 Sekunden deaktiviert (Debounce).
- **Leere Gruppen-Auswahl:** Senden-Button bleibt deaktiviert, kein leerer Versand möglich.
- **Sehr langer Text:** Textarea begrenzt auf 1000 Zeichen, Überschreitung wird im UI verhindert.
- **N8N noch nicht eingerichtet:** API-Route `/api/kommunikation/send` gibt 503 zurück mit Meldung "WhatsApp nicht konfiguriert" — Dashboard zeigt entsprechenden Hinweis.

---

## Datenmodell

### Neue Tabelle: `message_logs`
```
id              uuid PRIMARY KEY DEFAULT gen_random_uuid()
created_at      timestamptz NOT NULL DEFAULT now()
sent_by         uuid REFERENCES auth.users(id)         -- wer hat gesendet
recipient_id    uuid REFERENCES employees(id)          -- Empfänger-Mitarbeiter
recipient_phone text NOT NULL                          -- Telefonnummer zum Zeitpunkt des Versands
message_text    text NOT NULL
context         text NOT NULL                          -- 'manual' | 'aufgabe' | 'zeiterfassung'
context_ref_id  uuid                                   -- z.B. Task-ID oder Entry-ID
status          text NOT NULL DEFAULT 'pending'        -- 'pending' | 'sent' | 'failed'
error_message   text
n8n_triggered_at timestamptz
```

---

## API-Routen

| Route | Methode | Beschreibung |
|-------|---------|-------------|
| `POST /api/kommunikation/send` | POST | Nachricht senden (triggert N8N, loggt in message_logs) |
| `GET /api/kommunikation/history` | GET | Versandhistorie laden (mit Pagination + Filter) |

### POST /api/kommunikation/send — Request Body
```json
{
  "recipient_ids": ["uuid", "..."],   // ein oder mehrere Empfänger
  "message": "string",
  "context": "manual" | "aufgabe" | "zeiterfassung",
  "context_ref_id": "uuid | null"
}
```

### N8N-Trigger (Webhook)
Das Dashboard sendet pro Empfänger einen POST an den N8N-Webhook:
```json
{
  "log_id": "uuid",
  "phone": "+49...",
  "message": "string"
}
```
N8N sendet die WhatsApp-Nachricht und ruft `/api/kommunikation/[log_id]/callback` zurück mit `{ "status": "sent" | "failed" }`.

---

## Technical Requirements

- **Auth:** Alle API-Routen erfordern authentifizierten Nutzer (admin oder manager)
- **RLS:** `message_logs` — admin sieht alles, manager nur eigene Nachrichten
- **Performance:** Historien-Abfrage < 300ms für 90 Tage
- **N8N-Kopplung:** Loser Coupling — Dashboard funktioniert auch wenn N8N nicht konfiguriert ist (503-Handling im UI)
- **Telefonnummern-Format:** Validierung beim Senden: muss mit `+` beginnen (internationales Format)

---

## Tech Design (Solution Architect)
_To be added by /architecture_

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
