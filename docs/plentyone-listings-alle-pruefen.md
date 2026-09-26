# Alle Market-Listings neu prüfen — Knopf im Dashboard

_Stand 26.09.2026._

## Wozu

Der nächtliche Lauf **„Market-Listings pruefen (PrimeHub)"** (`ufqiBqiE1atoYopj`, 04:30)
prüft nur Angebote mit `verified = "unknown"`. Bereits geprüfte (bestanden **oder**
fehlgeschlagen) fasst er nie wieder an.

Das reicht nicht, wenn sich bei eBay etwas am Konto ändert: PlentyONE rechnet die
Gebühr eines Angebots beim Prüfen. Nach dem Wechsel auf den **Top Shop** stand an
jedem geprüften Angebot noch die alte Gebühr (0,42 €) statt 0,06 €. Die
erneute Prüfung jedes Angebots setzt den Wert neu. Ebenso bekommen fehlgeschlagene
Angebote nach einer Korrektur (Bild, GPSR, Preis) so ihre zweite Chance.

Dafür gibt es einen **eigenen Workflow**. Der nächtliche bleibt unverändert.

| | nächtlich 04:30 | Knopf „Alle neu prüfen" |
|---|---|---|
| Workflow | `Market-Listings pruefen (PrimeHub)` | `Market-Listings ALLE neu pruefen (PrimeHub)` |
| prüft | nur `unknown` | **jedes** Market-Listing |
| Reihenfolge | nach MLID | fehlgeschlagene → ungeprüfte → bestandene |
| Webhook | `/webhook/listings-pruefen` | `/webhook/listings-alle-pruefen` |
| danach | — | stößt selbst den Statusbericht an |

Dateien: [`plentyone-listings-alle-pruefen.json`](plentyone-listings-alle-pruefen.json)
(Import) · [`plentyone-listings-alle-pruefen.js`](plentyone-listings-alle-pruefen.js)
(Code des Knotens „Alle pruefen").

## Ablauf

```
Webhook Start (POST, Dashboard) ─┐
Manuell starten ─────────────────┴→ Konfiguration → Start pruefen → Token ok?
    nein → Antwort abgelehnt (401)
    ja   → Vom Dashboard? ja → Antwort angestossen (202) ─┐
                          nein ───────────────────────────┴→ PlentyONE Login
                                                            → Alle pruefen
                                                            → Statusbericht anstossen
```

Dashboard: `POST /api/plentyone/ebay/listings-pruefen` (nur Admin/Manager) schickt den
Aufruf mit Header `x-primehub-token` = `N8N_EBAY_TOKEN`. URL aus
`N8N_LISTINGS_ALLE_PRUEFEN_URL`, sonst `N8N_WEBHOOK_BASE_URL` + `/listings-alle-pruefen`.
Das Dashboard wartet bis zu 60 Minuten auf einen neuen Statusbericht.

**Tempo:** einer je Listing, drei gleichzeitig. Das PlentyONE-Fenster ist schnell
erschöpft, der Lauf wartet dann ab → **rund 30 Minuten** für ~1.950 Angebote.

**Workflow live:** ID `3MuPhuwtEgE8yL2j`, aktiv seit 26.09.2026.

**Erster Volllauf 26.09.2026 (Execution 384160, nach Top-Shop-Wechsel):**

```
1.925 Market-Listings (vorher 1.823 succeeded, 102 failed)
1.822 neu bewertet (affectedRows 1), 103 ohne Aenderung, 0 Fehler, 0 Drosseltreffer
Dauer 27:46 min, davon 23:09 min Warten auf das Aufruffenster
```

`affectedRows` zählt nur **geänderte** Zeilen: Ein Angebot, das erneut mit demselben
Ergebnis durchfällt, meldet 0 — es wurde trotzdem geprüft. Die fehlgeschlagenen
brauchen eine echte Korrektur (Gründe im Statusbericht), dann den Knopf erneut.

---

## N8N Anleitung: Workflow „Market-Listings ALLE neu pruefen" einspielen

**Was geändert werden muss:** Nichts an bestehenden Workflows. Es kommt ein neuer
Workflow dazu, den der Dashboard-Knopf startet.

### Schritt 1 — N8N Dashboard öffnen
1. Öffne https://n8n.primehubgbr.com im Browser
2. Melde dich an

### Schritt 2 — Workflow importieren
1. Links in der Sidebar auf **„Workflows"** klicken
2. Oben rechts auf den Pfeil neben **„Create Workflow"** → **„Import from File…"**
   (alternativ: neuen leeren Workflow öffnen, oben rechts `…` → **„Import from File…"**)
3. Die Datei `Dashboard v2/docs/plentyone-listings-alle-pruefen.json` auswählen
4. Es erscheinen 11 Knoten, von links „Webhook Start" / „Manuell starten" bis rechts
   „Statusbericht anstossen"

### Schritt 3 — Zugangsdaten eintragen
1. Doppelklick auf den Knoten **„Konfiguration"** (zweiter von links)
2. Die Werte aus dem bestehenden Workflow **„Market-Listings pruefen (PrimeHub)"**
   übernehmen (dort ebenfalls Knoten „Konfiguration" — in einem zweiten Browser-Tab öffnen):
   - `passwort`: statt `HIER-TEMPNUTZER-PASSWORT-EINTRAGEN` das PlentyONE-Passwort
   - `webhookToken`: statt `HIER-DEN-WERT-VON-N8N_EBAY_TOKEN-EINTRAGEN` denselben Token
     wie im bestehenden Workflow (= Vercel-Variable `N8N_EBAY_TOKEN`)
   - `plentyUrl` und `benutzer` prüfen — müssen gleich sein wie im bestehenden Workflow
3. `limit` bleibt `0` (= alle)
4. Panel mit ✓ bzw. Klick daneben schließen

### Schritt 4 — Kurz testen (5 Listings)
1. Im Knoten „Konfiguration" `limit` vorübergehend auf **`5`** setzen
2. Oben **„Test Workflow"** klicken (startet über „Manuell starten")
3. Alle Knoten müssen grün werden. Im Knoten **„Alle pruefen"** rechts im OUTPUT:
   `in_diesem_lauf: 5`, `pruefung_angestossen: 5`, `ohne_wirkung: 0`, `fehler: 0`
4. Stichprobe in PlentyONE: bei einem der ersten Angebote die Gebühr ansehen (Top Shop → 0,06 €)
5. `limit` **zurück auf `0`** setzen

### Schritt 5 — Speichern und aktivieren
1. Oben rechts **„Save"** klicken
2. Den Schalter **„Inactive" → „Active"** umlegen (oben rechts). Erst dann ist
   `/webhook/listings-alle-pruefen` erreichbar — sonst meldet das Dashboard
   „Workflow in n8n nicht gefunden oder nicht aktiv".

### Schritt 6 — Im Dashboard starten
1. https://dashboard.primehubgbr.com/dashboard/plentyone → Karte „eBay-Automatisierung"
2. **„Alle neu prüfen"** → bestätigen
3. Nach rund 30 Minuten erscheint „Prüfung abgeschlossen", der Bericht ist neu

## Wenn etwas hakt

| Meldung | Ursache |
|---|---|
| Dashboard: „Workflow in n8n nicht gefunden oder nicht aktiv" | Schritt 5 — Workflow nicht aktiv |
| Dashboard: „n8n antwortete 401" | `webhookToken` passt nicht zu `N8N_EBAY_TOKEN` |
| n8n: „Kein Login-Token von PlentyONE" | Passwort in „Konfiguration" |
| n8n: `Task request timed out` am Knoten „Alle pruefen" | n8n bricht Code-Knoten nach einer Zeitgrenze ab (`N8N_RUNNERS_TASK_TIMEOUT`). Fehlgeschlagene und ungeprüfte sind dann schon durch (sie kommen zuerst). Für die bestandenen den Lauf auf Etappen umbauen lassen |
| Dashboard: „Nach 60 Minuten kam kein neuer Bericht" | Lauf in n8n unter „Executions" ansehen |
