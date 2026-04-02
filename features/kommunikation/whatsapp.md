# WhatsApp Business Kommunikation

## Status: In Progress
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

**Status:** In Progress — Tech Design hinzugefügt 2026-04-02

---

### A) Komponentenstruktur

```
/dashboard/kommunikation          (neue Seite)
└── KommunikationClient           (Client-Wrapper, lädt Mitarbeiter + History)
    ├── NachrichtFormular         (linke Spalte — Freitext + Gruppen-Auswahl)
    │   ├── EmpfaengerSelector    (Multi-Select, baut auf vorhandenem useEmployees-Hook)
    │   ├── NachrichtTextarea     (Textarea + Zeichenzähler, max. 1000 Zeichen)
    │   └── SendenButton          (deaktiviert wenn Empfänger/Text fehlt, Debounce 3s)
    └── VersandHistorie           (rechte Spalte — Tabelle + Filter + Pagination)
        ├── HistorieFilterBar     (Empfänger, Kontext, Status, Zeitraum)
        ├── HistorieTabelle       (shadcn Table, 20 Einträge/Seite)
        └── NachrichtDetailSheet (shadcn Sheet — öffnet bei Zeileklick, Volltext)

Kontext-Buttons (eingebettet in bestehende Tabs):
├── WhatsAppSendenButton          (generische wiederverwendbare Komponente)
│   └── WhatsAppSendenDialog      (shadcn Dialog — vorformulierter/editierbarer Text)
│
├── src/components/aufgaben/AufgabenDialog.tsx
│   └── + WhatsAppSendenButton    (erscheint wenn aufgabe.assigned_employee?.phone vorhanden)
│
└── src/components/zeiterfassung/StundenUebersicht.tsx (oder MitarbeiterVerwaltung.tsx)
    └── + WhatsAppSendenButton    (erscheint pro Mitarbeiter-Zeile, lädt Stunden live)
```

Neue Dateien:
- `src/app/dashboard/kommunikation/page.tsx`
- `src/components/kommunikation/KommunikationClient.tsx`
- `src/components/kommunikation/NachrichtFormular.tsx`
- `src/components/kommunikation/EmpfaengerSelector.tsx`
- `src/components/kommunikation/VersandHistorie.tsx`
- `src/components/kommunikation/HistorieFilterBar.tsx`
- `src/components/kommunikation/HistorieTabelle.tsx`
- `src/components/kommunikation/NachrichtDetailSheet.tsx`
- `src/components/kommunikation/WhatsAppSendenButton.tsx`
- `src/components/kommunikation/WhatsAppSendenDialog.tsx`
- `src/hooks/useKommunikation.ts`

Bereits vorhandene shadcn-Komponenten die genutzt werden (keine neuen nötig):
`Table`, `Sheet`, `Dialog`, `Select`, `Textarea`, `Button`, `Badge`, `Checkbox`, `Tooltip`, `Pagination`

---

### B) Datenbankschema

**Neue Tabelle: `message_logs`**

Speicherort: Supabase PostgreSQL (gleiche DB wie alle anderen Tabellen)

| Spalte | Typ | Beschreibung |
|--------|-----|-------------|
| `id` | uuid PK | Automatisch generiert |
| `created_at` | timestamptz | Zeitpunkt der Erstellung (= Versand-Auslösung) |
| `sent_by` | uuid → auth.users | Welcher Dashboard-Nutzer hat gesendet |
| `recipient_id` | uuid → employees | Welcher Mitarbeiter ist Empfänger |
| `recipient_phone` | text | Telefonnummer zum Versandzeitpunkt (Snapshot — bleibt korrekt auch wenn Mitarbeiter-Nummer sich ändert) |
| `message_text` | text | Vollständiger Nachrichtentext |
| `context` | text | Herkunft: `manual` / `aufgabe` / `zeiterfassung` |
| `context_ref_id` | uuid nullable | Referenz auf Task-ID oder Zeiterfassungs-Eintrag |
| `status` | text | `pending` → `sent` / `failed` |
| `error_message` | text nullable | Fehlermeldung von N8N bei `failed` |
| `n8n_triggered_at` | timestamptz nullable | Zeitpunkt des N8N-Webhook-Aufrufs |

SQL-Migration (Datei: `supabase/migrations/008_message_logs.sql`):

```sql
CREATE TABLE message_logs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  sent_by         uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  recipient_id    uuid REFERENCES employees(id) ON DELETE SET NULL,
  recipient_phone text NOT NULL,
  message_text    text NOT NULL,
  context         text NOT NULL CHECK (context IN ('manual','aufgabe','zeiterfassung')),
  context_ref_id  uuid,
  status          text NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','sent','failed')),
  error_message   text,
  n8n_triggered_at timestamptz
);

CREATE INDEX message_logs_created_at_idx ON message_logs(created_at DESC);
CREATE INDEX message_logs_recipient_id_idx ON message_logs(recipient_id);
CREATE INDEX message_logs_status_idx ON message_logs(status);
CREATE INDEX message_logs_context_idx ON message_logs(context);

ALTER TABLE message_logs ENABLE ROW LEVEL SECURITY;

-- Admin sieht alle Nachrichten
CREATE POLICY "admin_all" ON message_logs
  FOR ALL USING (
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin')
  );

-- Manager sieht nur eigene Nachrichten (sent_by = eigene user_id)
CREATE POLICY "manager_own" ON message_logs
  FOR SELECT USING (
    sent_by = auth.uid() AND
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'manager')
  );
```

---

### C) Tech-Entscheidungen (für PMs erklärt)

**Warum eine eigene `message_logs`-Tabelle statt bestehende Tabellen zu erweitern?**
Nachrichten sind ein eigenes Datenbjet mit eigenem Lebenszyklus (pending → sent/failed). Sie gehören nicht in die `tasks`- oder `employees`-Tabelle. Eine eigene Tabelle ermöglicht saubere Filter, Pagination und Audit-Logs.

**Warum wird die Telefonnummer als Snapshot gespeichert (`recipient_phone`)?**
Wenn ein Mitarbeiter seine Nummer später ändert, soll die Versandhistorie trotzdem zeigen, wohin die Nachricht ging. Der Snapshot verhindert, dass historische Einträge nachträglich "falsch" werden.

**Warum ein separater N8N-Aufruf pro Empfänger (nicht ein Gruppen-Aufruf)?**
Das erlaubt granulares Status-Tracking: Jeder Empfänger bekommt seinen eigenen `message_logs`-Eintrag. Wenn eine Nummer ungültig ist, schlägt nur dieser eine Versand fehl — alle anderen kommen trotzdem an.

**Warum einen `WhatsAppSendenButton` als generische Komponente?**
Derselbe Dialog-Button wird in Aufgaben UND Zeiterfassung benötigt. Eine gemeinsame Komponente mit Props (`recipientId`, `recipientName`, `phone`, `prefillText`, `context`, `contextRefId`) verhindert doppelten Code und stellt konsistentes Verhalten sicher.

**Warum ein Debounce von 3 Sekunden auf dem Senden-Button?**
WhatsApp-Nachrichten können nicht zurückgerufen werden. Versehentliches Doppelklicken würde echte Nachrichten mehrfach versenden. 3 Sekunden Sperrzeit ist die minimale Sicherheit gegen Klickfehler.

**Warum wird der vorhandene `useEmployees`-Hook wiederverwendet?**
`src/hooks/useEmployees.ts` existiert bereits und lädt Mitarbeiterdaten inkl. `phone`-Feld. Kein neuer Datenabruf nötig — der `EmpfaengerSelector` filtert lokal nach `phone != null && is_active == true`.

**Warum `graceful degradation` wenn N8N nicht konfiguriert?**
N8N wird erst nach dem Dashboard eingerichtet. Die API-Route prüft ob `N8N_WHATSAPP_WEBHOOK_URL` gesetzt ist. Fehlt die Variable, gibt sie `503` zurück und das UI zeigt einen gelben Hinweis-Banner anstatt die gesamte Seite unbrauchbar zu machen.

---

### D) Backend — YES

Benötigt werden:

| Route | Zweck |
|-------|-------|
| `POST /api/kommunikation/send` | Auth-Check → Zod-Validation → `message_logs` INSERT (status: pending) → N8N-Webhook pro Empfänger triggern → `n8n_triggered_at` setzen |
| `GET /api/kommunikation/history` | Auth-Check → Query `message_logs` mit JOIN auf `employees` (Name) → Pagination (limit/offset) + Filter (recipient_id, context, status, date range) → max. 90 Tage |
| `PATCH /api/kommunikation/[id]/callback` | Von N8N aufgerufen nach WhatsApp-Versand → `message_logs` UPDATE (status: sent/failed, error_message) — kein Auth-Header-Check nötig, da log_id als Secret wirkt (UUID unratebar) |

Auth-Muster folgt `src/app/api/organisation/members/route.ts` — `getAuthContext()` prüft Rolle (admin/manager), staff wird abgewiesen.

---

### E) N8N — YES

N8N übernimmt den eigentlichen WhatsApp-Versand via WhatsApp Business Cloud Node.

**Ablauf:**
1. Dashboard-API (`POST /api/kommunikation/send`) erstellt `message_logs`-Eintrag mit `status: pending`
2. Dashboard sendet POST an N8N-Webhook (eine Anfrage pro Empfänger):
   ```
   {
     "log_id": "<uuid>",
     "phone": "+49...",
     "message": "Hallo..."
   }
   ```
3. N8N antwortet sofort mit 200 (Webhook-Response-Node) — Dashboard wartet nicht auf Versand
4. N8N sendet Nachricht via WhatsApp Business Cloud Node
5. N8N ruft Dashboard-Callback auf: `PATCH /api/kommunikation/[log_id]/callback` mit `{ "status": "sent" | "failed", "error_message": "..." }`
6. Dashboard-API aktualisiert `message_logs.status`

**Graceful Degradation:** Fehlt `N8N_WHATSAPP_WEBHOOK_URL` in den Vercel-Umgebungsvariablen, schreibt die API trotzdem den `message_logs`-Eintrag mit `status: failed` und gibt HTTP 503 mit dem Hinweis "WhatsApp nicht konfiguriert" zurück. Der Admin sieht einen gelben Banner im Tab.

**N8N-Workflow-Struktur (wird manuell eingerichtet):**
```
Webhook (POST /whatsapp-send)
    ↓
Respond to Webhook (202 — sofort antworten)
    ↓
WhatsApp Business Cloud Node (Nachricht senden)
    ↓
HTTP Request → Dashboard Callback (PATCH /api/kommunikation/[log_id]/callback)
```

---

### F) State Management — Kontext-Buttons

Die `WhatsAppSendenButton`-Komponente erhält alle nötigen Daten als Props — kein globaler State nötig:

```
<WhatsAppSendenButton
  recipientId="uuid"
  recipientName="Max Mustermann"
  phone="+49123456789"
  prefillText="Hallo Max, ..."
  context="aufgabe"
  contextRefId="task-uuid"
/>
```

**Für Aufgaben-Kontext:** `AufgabenDialog.tsx` hat bereits Zugriff auf `task.assigned_employee` (inkl. Name + Telefon aus dem bestehenden JOIN). Der vorformulierte Text wird in der Komponente generiert aus `task.title` + `task.due_date`.

**Für Zeiterfassung-Kontext:** Der Stunden-Report-Text wird im Moment des Dialog-Öffnens aus den bereits im Tab geladenen Stundendaten (`useMonthStats`-Hook o.ä.) zusammengesetzt — kein extra API-Call.

**Nach dem Senden:** Die `WhatsAppSendenButton`-Komponente hält lokal `sent: boolean` als React-State. Nach erfolgreichem API-Aufruf wechselt das Button-Label zu "Gesendet ✓" für die Session-Dauer. Kein globaler Store nötig.

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
