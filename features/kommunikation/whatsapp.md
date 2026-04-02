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

## UI/UX Design

### 1. Seiten-Layout — Kommunikations-Tab (Desktop)

```
┌─────────────────────────────────────────────────────────────────────┐
│ Kommunikation                                                        │
│ WhatsApp-Nachrichten senden und Versandhistorie einsehen            │
├────────────────────────────────────────┬────────────────────────────┤
│ NEUE NACHRICHT                         │ VERSANDHISTORIE            │
│ ┌──────────────────────────────────┐   │ ┌─────────────────────┐   │
│ │ Empfänger *                      │   │ │ [Filter] [Filter]   │   │
│ │ [EmpfaengerSelector ▼]           │   │ │ [Filter] [Zeitraum] │   │
│ └──────────────────────────────────┘   │ └─────────────────────┘   │
│                                        │ ┌─────────────────────┐   │
│ ┌──────────────────────────────────┐   │ │ Datum  Empfänger ... │   │
│ │ [x] An alle Mitarbeiter senden   │   │ │ ───────────────────── │   │
│ └──────────────────────────────────┘   │ │ Zeile 1             │   │
│                                        │ │ Zeile 2             │   │
│ Nachricht *                  0/1000    │ │ Zeile 3             │   │
│ ┌──────────────────────────────────┐   │ │ ...                 │   │
│ │                                  │   │ └─────────────────────┘   │
│ │  [Textarea — 4 Zeilen min.]      │   │                            │
│ │                                  │   │  ← 1 2 3 ... →            │
│ └──────────────────────────────────┘   │                            │
│                                        │                            │
│ Wird an 1 Empfänger gesendet           │                            │
│                        [Senden ▶]      │                            │
└────────────────────────────────────────┴────────────────────────────┘
```

### 2. Seiten-Layout — Kommunikations-Tab (Mobile, < 640px)

```
┌───────────────────────────┐
│ Kommunikation             │
│ WhatsApp-Nachrichten ...  │
├───────────────────────────┤
│ [Tabs: Neue Nachricht |   │
│        Verlauf        ]   │
├───────────────────────────┤
│ TAB: NEUE NACHRICHT       │
│ Empfänger *               │
│ [EmpfaengerSelector ▼]    │
│                           │
│ [ ] An alle senden        │
│                           │
│ Nachricht *     0/1000    │
│ ┌─────────────────────┐   │
│ │ [Textarea]          │   │
│ └─────────────────────┘   │
│                           │
│ Wird an 1 Empfänger gesen.│
│ [Senden ▶ — full width]   │
└───────────────────────────┘
```

Auf Mobile werden beide Bereiche (Formular + Verlauf) in shadcn `Tabs` aufgeteilt. Der Verlauf-Tab zeigt die Tabelle als scrollbare Liste.

---

### 3. N8N-nicht-konfiguriert-Banner

Erscheint direkt unter dem Seitentitel, wenn die API 503 mit "WhatsApp nicht konfiguriert" zurückgibt. Ersetzt nicht das Formular — das Formular bleibt sichtbar aber der Senden-Button zeigt einen anderen Tooltip.

```
┌─────────────────────────────────────────────────────────────────────┐
│ [!] WhatsApp nicht konfiguriert                                     │
│     N8N Webhook-URL fehlt. Nachrichten können nicht gesendet werden.│
│     Bitte N8N_WHATSAPP_WEBHOOK_URL in Vercel setzen.               │
└─────────────────────────────────────────────────────────────────────┘
```

**Umsetzung:** shadcn `Alert` mit `variant="default"` und `AlertTriangle`-Icon (Lucide). Hintergrund: `bg-yellow-50 border-yellow-200 text-yellow-800` (dark: `bg-yellow-900/20 border-yellow-800/30 text-yellow-300`).

---

### 4. WhatsApp-Senden-Dialog (Kontext-Buttons)

Öffnet sich bei Klick auf `WhatsAppSendenButton` in AufgabenDialog oder Zeiterfassung.

```
┌──────────────────────────────────────┐
│ WhatsApp senden                  [X] │
│ ──────────────────────────────────── │
│ Empfänger                            │
│ Max Mustermann  +49 170 123456       │
│                                      │
│ Nachricht                  87/1000   │
│ ┌──────────────────────────────────┐ │
│ │ Hallo Max, eine kurze Erinnerung:│ │
│ │ Die Aufgabe "Inventur Q1" ist    │ │
│ │ fällig am 15.04.2026. Bitte melde│ │
│ │ dich falls du Fragen hast.       │ │
│ └──────────────────────────────────┘ │
│                                      │
│             [Abbrechen] [Senden ▶]   │
└──────────────────────────────────────┘
```

---

### 5. Komponenten-Spezifikationen

---

#### KommunikationClient

- **Container:** `mx-auto max-w-7xl space-y-6` — konsistent mit Aufgaben- und Organisations-Seite
- **Inneres Layout Desktop:** `grid grid-cols-1 lg:grid-cols-2 gap-6 items-start`
- **Inneres Layout Mobile:** shadcn `Tabs` mit zwei Tabs (Neue Nachricht / Verlauf)
- **Hintergrund:** `bg-background` (Seite), Karten `bg-card`
- **Tailwind hint:** `className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start"`

---

#### NachrichtFormular

- **Container:** `rounded-xl border border-border bg-card p-6 space-y-4`
- **Titel:** `text-lg font-medium text-foreground` — "Neue Nachricht"
- **Trennlinie:** `<Separator />` unter dem Titel

**Felder:**

| Element | shadcn | Klassen |
|---------|--------|---------|
| Label "Empfänger *" | `Label` | `text-xs font-medium uppercase tracking-wide text-muted-foreground` |
| EmpfaengerSelector | Custom auf Select/Command | siehe unten |
| Checkbox "An alle senden" | `Checkbox` | `flex items-center gap-2` |
| Label "Nachricht *" | `Label` | wie oben |
| Zeichenzähler | `span` | `text-xs text-muted-foreground tabular-nums` — rechts neben Label, `flex justify-between` |
| Textarea | `Textarea` | `min-h-[100px] resize-none` |
| Vorschau-Text | `p` | `text-sm text-muted-foreground` |
| Senden-Button | `Button` | `w-full sm:w-auto` — primary variant |

**Zustandsregeln NachrichtFormular:**

| State | Was passiert | Visuell |
|-------|-------------|---------|
| Default | Leeres Formular | Alle Felder leer, Button disabled |
| Empfänger gewählt | 1 Empfänger selektiert | Vorschau: "Wird an 1 Empfänger gesendet" |
| "An alle" aktiv | Alle Mitarbeiter selektiert | EmpfaengerSelector disabled, Checkbox checked, Vorschau: "Wird an X Empfängern gesendet" |
| Bereit zu senden | Empfänger + Text vorhanden | Senden-Button aktiv (primary) |
| Senden läuft | POST in Bearbeitung | Button: Spinner + "Wird gesendet…", disabled, `opacity-75` |
| Erfolg | Antwort 200 | Toast "Nachricht gesendet", Formular zurückgesetzt |
| Fehler | API-Fehler / N8N-Fehler | Toast mit Fehlermeldung, Formular bleibt gefüllt |
| Debounce | 3s nach Klick | Button disabled, kein Spinner nötig — Button selbst verhindert erneuten Klick |
| N8N nicht konfiguriert | 503 von API | Toast "WhatsApp nicht konfiguriert", gelber Banner erscheint |

---

#### EmpfaengerSelector

Kein nativer Multi-Select — wird als `Popover` + `Command` (shadcn) gebaut. Dies ermöglicht Suche + Multi-Auswahl + Chips.

```
┌────────────────────────────────────────────────┐
│ [Max Mustermann x] [Anna Schmidt x]  [Suchen…] │  ← Trigger (Combobox-Look)
└────────────────────────────────────────────────┘
               ↓ geöffnetes Popover
┌────────────────────────────────────────────────┐
│ [🔍 Mitarbeiter suchen...]                     │
│ ──────────────────────────────────────────────  │
│ [x] Max Mustermann          +49 170 123456     │
│ [ ] Anna Schmidt            +49 151 987654     │
│ ──────────────────────────────────────────────  │
│ Peter Meier (kein Telefon)  — nicht wählbar    │
└────────────────────────────────────────────────┘
```

- **Trigger:** `Button` variant `outline`, `w-full justify-between`, Flex-Wrap für Chips
- **Chips:** `Badge` variant `secondary` mit X-Button (`×`), `className="flex items-center gap-1 text-xs"`
- **Popover-Content:** `w-[--radix-popover-trigger-width] p-0`
- **Command-Item aktiv (checked):** `bg-primary/10` mit `Check`-Icon links
- **Command-Item deaktiviert (kein Telefon):** `opacity-40 cursor-not-allowed`, Text in Klammern: "(kein Telefon)"
- **Hover (wählbare Items):** `hover:bg-muted`

**States EmpfaengerSelector:**

| State | Visuell |
|-------|---------|
| Leer | Placeholder: "Empfänger auswählen…" `text-muted-foreground` |
| 1 gewählt | Chip mit Name + X |
| Mehrere gewählt | Mehrere Chips, Popover-Trigger wächst |
| "An alle" aktiv | gesamter Selector wird disabled: `opacity-50 pointer-events-none` |
| Kein Telefon | Item ausgegraut, nicht klickbar |

---

#### VersandHistorie

- **Container:** `rounded-xl border border-border bg-card space-y-4`
- **Header:** `flex items-center justify-between px-6 pt-6` — Titel links, optional Refresh-Button rechts
- **Titel:** `text-lg font-medium text-foreground` — "Versandhistorie"

---

#### HistorieFilterBar

```
┌──────────────────────────────────────────────────────────┐
│ [Empfänger ▼]  [Kontext ▼]  [Status ▼]  [Zeitraum ▼]   │
└──────────────────────────────────────────────────────────┘
```

- **Container:** `flex flex-wrap gap-2 px-6 py-4 border-b border-border`
- Jeder Filter: shadcn `Select` mit `w-[140px]` — auf Mobile `w-full`
- **Zurücksetzen:** Kleiner `Button` variant `ghost` mit `X`-Icon erscheint rechts sobald Filter aktiv sind
- **Responsive:** Auf Mobile `flex-col`, auf Desktop `flex-row flex-wrap`

**Filter-Optionen:**

| Filter | Optionen |
|--------|---------|
| Empfänger | Alle + je ein Eintrag pro Mitarbeiter |
| Kontext | Alle / Manuell / Aufgabe / Zeiterfassung |
| Status | Alle / Gesendet / Fehlgeschlagen / Ausstehend |
| Zeitraum | Heute / Diese Woche / Dieser Monat / 90 Tage |

---

#### HistorieTabelle

**Spalten:**

| Spalte | Breite | Inhalt |
|--------|--------|--------|
| Datum | `w-[140px]` | `dd.MM.yyyy HH:mm` — `text-sm text-muted-foreground` |
| Empfänger | `w-[160px]` | Name + Telefon (zweizeilig, Telefon kleiner) |
| Nachricht | auto | Text auf 80 Zeichen gekürzt + "…" — `text-sm text-foreground` |
| Kontext | `w-[120px]` | Badge (siehe Status-Badges unten) |
| Absender | `w-[120px]` | E-Mail-Username des Dashboard-Nutzers |
| Status | `w-[100px]` | Badge (siehe Status-Badges unten) |

**Kontext-Badges:**

| Kontext | Badge-Klassen |
|---------|--------------|
| Manuell | `bg-muted text-muted-foreground` |
| Aufgabe | `bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400` |
| Zeiterfassung | `bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400` |

**Status-Badges:**

| Status | Badge-Klassen |
|--------|--------------|
| pending | `bg-muted text-muted-foreground` |
| sent | `bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400` |
| failed | `bg-destructive/10 text-destructive` |

**Tabellen-States:**

| State | Was passiert | Visuell |
|-------|-------------|---------|
| Loading | Erste Daten werden geladen | 5 Skeleton-Zeilen gleicher Höhe wie Datenzeilen |
| Empty (kein Filter) | Noch keine Nachrichten gesendet | Zentriertes Icon (MessageCircle) + "Noch keine Nachrichten gesendet" + `text-muted-foreground` |
| Empty (Filter aktiv) | Filter liefert keine Ergebnisse | "Keine Einträge für diesen Filter." + `Button` ghost "Filter zurücksetzen" |
| Fehler | API-Fehler beim Laden | `Alert` destructive + "Verlauf konnte nicht geladen werden" + Retry-Button |
| Zeileklick | Öffnet NachrichtDetailSheet | Zeile: `cursor-pointer hover:bg-muted/50 transition-colors duration-150` |

**Pagination:**
- shadcn `Pagination` — unten rechts im Card
- `className="flex justify-end px-6 pb-6 pt-4"`
- 20 Einträge pro Seite, maximal 90 Tage Reichweite

---

#### NachrichtDetailSheet

Öffnet sich von rechts (shadcn `Sheet` side="right") bei Zeileklick in der Tabelle.

```
┌──────────────────────────────────┐
│ Nachricht vom 02.04.2026         │
│ 14:32 Uhr                   [X] │
│ ────────────────────────────────  │
│ EMPFÄNGER                        │
│ Max Mustermann                   │
│ +49 170 123456                   │
│                                  │
│ KONTEXT                          │
│ [Aufgabe] Inventur Q1            │
│                                  │
│ ABSENDER                         │
│ admin@primehub.de                │
│                                  │
│ STATUS                           │
│ [Gesendet ✓] 02.04.2026 14:32   │
│                                  │
│ NACHRICHT                        │
│ ┌────────────────────────────┐   │
│ │ Hallo Max, eine kurze      │   │
│ │ Erinnerung: Die Aufgabe    │   │
│ │ "Inventur Q1" ist fällig   │   │
│ │ am 15.04.2026...           │   │
│ └────────────────────────────┘   │
└──────────────────────────────────┘
```

- **Sheet-Breite:** `w-full sm:max-w-[480px]`
- **Labels:** `text-xs font-medium uppercase tracking-wide text-muted-foreground`
- **Werte:** `text-sm text-foreground`
- **Nachrichtentext-Box:** `rounded-lg bg-muted p-4 text-sm text-foreground whitespace-pre-wrap`
- **Status mit Timestamp:** Badge + Datum in `text-xs text-muted-foreground` nebeneinander
- **Fehler-State:** Wenn `status: failed` — `error_message` in roter `Alert`-Box unter dem Status-Badge

---

#### WhatsAppSendenButton

Generische Komponente die in AufgabenDialog und Zeiterfassung eingebettet wird.

**Varianten:**

| State | Aussehen | Tailwind |
|-------|---------|---------|
| Default | `[WhatsApp senden]` grün | `variant="outline"` + grüner Text/Border: `border-green-600 text-green-700 hover:bg-green-50 dark:border-green-500 dark:text-green-400 dark:hover:bg-green-900/20` |
| Hover | Hellgrüner Hintergrund | Wie oben (hover state) |
| Disabled — kein Telefon | Ausgegraut + Tooltip | `opacity-50 cursor-not-allowed` + shadcn `Tooltip`: "Keine Telefonnummer hinterlegt" |
| Disabled — kein Mitarbeiter | Ausgegraut + Tooltip | `opacity-50 cursor-not-allowed` + `Tooltip`: "Kein Mitarbeiter zugewiesen" |
| Ladevorgang | Spinner + "Wird gesendet…" | `Button` disabled mit `Loader2`-Icon animiert |
| Gesendet | "Gesendet ✓" — Session-persistent | `variant="ghost"` + `text-green-600 dark:text-green-400` + `Check`-Icon, nicht klickbar |

**Icon:** `MessageCircle` (Lucide) — 16px, links im Button.

**Tailwind hint (Default-State):**
```
className="gap-2 border-green-600 text-green-700 hover:bg-green-50
           dark:border-green-500 dark:text-green-400 dark:hover:bg-green-900/20"
```

**Tooltip-Wrapper-Pattern:**
```
<Tooltip>
  <TooltipTrigger asChild>
    <span>  {/* span nötig, weil disabled Button keine Events feuert */}
      <Button disabled ...>WhatsApp senden</Button>
    </span>
  </TooltipTrigger>
  <TooltipContent>Keine Telefonnummer hinterlegt</TooltipContent>
</Tooltip>
```

---

#### WhatsAppSendenDialog

shadcn `Dialog` — öffnet sich bei Klick auf `WhatsAppSendenButton`.

- **Dialog-Breite:** `max-w-[500px]`
- **Header:** `DialogHeader` — Titel "WhatsApp senden", kein Untertitel
- **Empfänger-Anzeige (read-only):** Zwei Zeilen: Name (`text-sm font-medium`) + Telefon (`text-sm text-muted-foreground`). In einer `div className="rounded-lg bg-muted px-4 py-3"`.
- **Nachricht-Textarea:** Vorausgefüllt mit `prefillText`, editierbar, `min-h-[120px] resize-none`
- **Zeichenzähler:** `flex justify-end text-xs text-muted-foreground` unter Textarea
- **DialogFooter:** `Abbrechen`-Button (variant ghost) links, `Senden`-Button (primary) rechts
- **Loading-State Senden:** Senden-Button zeigt `Loader2` spinning + "Wird gesendet…", beide Buttons disabled
- **Erfolg:** Dialog schließt sich automatisch, übergeordneter `WhatsAppSendenButton` wechselt zu "Gesendet ✓"
- **Fehler:** Dialog bleibt offen, rote `Alert`-Box erscheint oberhalb des Footer

**States WhatsAppSendenDialog:**

| State | Was passiert |
|-------|-------------|
| Offen / Default | Prefill-Text im Textarea, Senden aktiviert wenn Text vorhanden |
| Text gelöscht | Textarea leer → Senden-Button disabled |
| Text > 1000 Zeichen | Senden disabled, Zeichenzähler rot: `text-destructive` |
| Senden läuft | Beide Buttons disabled, Senden-Button: Spinner + "Wird gesendet…" |
| Erfolg | Dialog schließt, Toast "Nachricht gesendet" |
| API-Fehler | Alert in Dialog: "Fehler beim Senden: [Meldung]" + Retry möglich |

---

### 6. Interaktions-Flow

#### Flow A — Freitext senden (zentraler Tab)

```
1. Nutzer öffnet /dashboard/kommunikation
2. EmpfaengerSelector Popover öffnen → Mitarbeiter suchen → Klick = Chip erscheint
3. Optional: "An alle senden" Checkbox → EmpfaengerSelector deaktiviert
4. Textarea fokussieren → Text eingeben → Zeichenzähler aktualisiert live
5. Vorschau "Wird an X Empfängern gesendet" erscheint sobald Empfänger + Text vorhanden
6. Senden-Button (primary, aktiv) → Klick
7. Button: Spinner + "Wird gesendet…" + disabled (3s Debounce)
8a. Erfolg: Toast (sonner) "Nachricht gesendet" → Formular reset → Button wieder aktiv
8b. Fehler: Toast "Fehler: [Meldung]" → Formular bleibt gefüllt → Button wieder aktiv
```

#### Flow B — Aufgaben-Erinnerung (AufgabenDialog)

```
1. Admin öffnet Aufgabendetail
2. WhatsAppSendenButton sichtbar (grüner Rand, MessageCircle-Icon)
3. Klick → WhatsAppSendenDialog öffnet sich
4. Empfänger read-only angezeigt (Name + Telefon aus task.assigned_employee)
5. Vorformulierter Text im Textarea (editierbar)
6. Admin passt Text an (optional) → Zeichenzähler live
7. "Senden" klicken → Spinner + disabled
8a. Erfolg: Dialog schließt → Button wechselt zu "Gesendet ✓" (grüner Text + Check-Icon)
8b. Fehler: Alert in Dialog → Admin kann erneut senden
```

#### Flow C — Stunden-Report (Zeiterfassung)

```
1. Admin öffnet Mitarbeiter-Detail in Zeiterfassung
2. WhatsAppSendenButton ("Stunden senden") sichtbar
3. Klick → Dialog öffnet sich
4. Vorformulierter Text mit aktuellen Stundenwerten (aus bereits geladenem Hook-State)
5. Text editierbar
6. Wie Flow B ab Schritt 7
```

---

### 7. Animationen & Transitions

| Element | Animation | Dauer |
|---------|-----------|-------|
| EmpfaengerSelector Popover | Radix Default (fade + slide) | `duration-200` |
| Chips erscheinen | `animate-in fade-in-0 zoom-in-95` | `duration-150` |
| Tabellen-Zeilehover | `transition-colors` | `duration-150` |
| NachrichtDetailSheet | Radix Default (slide from right) | `duration-300` |
| WhatsAppSendenDialog | Radix Default (fade + zoom) | `duration-200` |
| Senden-Button Spinner | `animate-spin` | kontinuierlich |
| "Gesendet ✓" Erscheinen | `animate-in fade-in-0` | `duration-200` |
| Skeleton Loading | `animate-pulse` | kontinuierlich |

---

### 8. Responsive-Verhalten

| Breakpoint | Verhalten |
|-----------|-----------|
| Mobile < 640px | Einspaltig. Formular + Verlauf in shadcn `Tabs`. Alle Selects full-width. Senden-Button full-width. Sheet 100% Breite. |
| Tablet 640px–1024px | Noch einspaltig, aber breiterer Container. Filter-Bar: 2 Filter pro Zeile. |
| Desktop >= 1024px | Zweispaltig (`lg:grid-cols-2`). Formular links, Verlauf rechts. NachrichtDetailSheet max-w-[480px]. |

---

### 9. Accessibility (WCAG 2.1 AA)

| Element | Anforderung |
|---------|------------|
| EmpfaengerSelector | `aria-label="Empfänger auswählen"`, `aria-expanded`, `aria-haspopup="listbox"` |
| Checkbox "An alle" | Label via `htmlFor` verknüpft |
| Textarea | `aria-label="Nachrichtentext"`, `aria-describedby` → Zeichenzähler-ID |
| Senden-Button disabled | `aria-disabled="true"` + `title` Attribut mit Begründung |
| WhatsAppSendenButton disabled | Tooltip-Trigger mit `span`-Wrapper (kein disabled-Button als Tooltip-Trigger) |
| Tabellen-Zeilen | `role="button"` + `tabIndex={0}` + `onKeyDown Enter/Space` → öffnet Sheet |
| Sheet | `aria-label="Nachrichtendetails"` |
| Status-Badges | `aria-label` mit vollem Text (z.B. `aria-label="Status: Gesendet"`) |
| Toast-Meldungen | Sonner hat `role="status"` eingebaut |
| Farbkontrast | Alle Farbtokens erfüllen AA (4.5:1) — green-700 auf white: 5.1:1 ✓ |
| Focus-Ring | Nie `outline-none` ohne `focus-visible:ring-2` Ersatz |

---

### 10. Design-Tokens dieser Feature

```
Hintergrund:     bg-background, bg-card, bg-muted
Text:            text-foreground, text-muted-foreground
Border:          border-border
Primary-Button:  bg-primary text-primary-foreground
WhatsApp-Grün:   border-green-600 text-green-700 hover:bg-green-50
                 dark: border-green-500 text-green-400 hover:bg-green-900/20
Erfolg-Badge:    bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400
Fehler-Badge:    bg-destructive/10 text-destructive
Pending-Badge:   bg-muted text-muted-foreground
Aufgabe-Badge:   bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400
Zeiterfassung-Badge: bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400
N8N-Warning:     bg-yellow-50 border-yellow-200 text-yellow-800
                 dark: bg-yellow-900/20 border-yellow-800/30 text-yellow-300
Spacing:         p-6, px-6, gap-4, gap-2, space-y-4
Radius:          rounded-xl (Cards), rounded-lg (interne Boxen), rounded-md (Inputs)
```

---

### 11. shadcn-Komponenten-Mapping

| UI-Element | shadcn-Komponente | Bereits installiert |
|-----------|------------------|-------------------|
| Empfänger-Dropdown | `Popover` + `Command` | Ja (command.tsx vorhanden) |
| Gruppen-Checkbox | `Checkbox` | Ja |
| Freitext-Eingabe | `Textarea` | Ja |
| Senden-Button | `Button` | Ja |
| Verlauf-Tabelle | `Table` | Ja |
| Filter-Selects | `Select` | Ja |
| Pagination | `Pagination` | Ja |
| Detail-Overlay | `Sheet` | Ja |
| Kontext-Dialog | `Dialog` | Ja |
| Tooltip (disabled) | `Tooltip` | Ja |
| Status-Labels | `Badge` | Ja |
| N8N-Banner | `Alert` | Ja |
| Toasts | `Sonner` | Ja |
| Skeleton-Loading | `Skeleton` | Ja |
| Mobile-Tabs | `Tabs` | Ja |
| Empfänger-Chips | `Badge` variant secondary | Ja |

Alle benötigten shadcn-Komponenten sind bereits installiert. Keine neuen `npx shadcn add`-Befehle nötig.

---

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
