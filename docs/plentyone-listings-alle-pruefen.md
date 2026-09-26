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

## Bedienung

1. https://dashboard.primehubgbr.com/dashboard/plentyone → Karte „eBay-Automatisierung"
2. Kasten **„Alle Listings neu prüfen"** → Knopf **„Alle neu prüfen"** → bestätigen
3. Anzeige „Läuft seit …" — die Seite darf geschlossen werden, der Lauf läuft in n8n
4. Nach rund 30 Minuten: „Prüfung abgeschlossen", der Statusbericht darüber ist neu
5. Stichprobe in PlentyONE: Market-Listings → Einstellgebühr ansehen

**Wann drücken?**
- Nach Änderungen am eBay-Konto (Shop-Abo, Gebührenmodell, Versand-/Rücknahmerichtlinien)
- Nach dem Korrigieren fehlgeschlagener Angebote (Grund steht im Statusbericht unter
  „Nicht startklar")
- **Nicht** nötig für frisch angelegte Angebote — die prüft der Nachtlauf von selbst

Nur Admin und Manager sehen den Knopf wirksam (API prüft die Rolle).

## Einrichtung — erledigt am 26.09.2026

- Workflow per n8n-MCP angelegt und aktiviert, **auf ausdrückliche Anweisung des
  Nutzers** (Ausnahme von der Read-Only-Regel, nur dieser neue Workflow; der
  bestehende `ufqiBqiE1atoYopj` blieb unverändert).
- Zugangsdaten (`benutzer`, `passwort`, `webhookToken`) im Knoten „Konfiguration" sind
  dieselben wie im nächtlichen Prüf-Workflow. Der `webhookToken` entspricht der
  Vercel-Variable `N8N_EBAY_TOKEN` (derselbe Wert wie im Statusbericht-Workflow
  `HYDRm1e5J5nIvJce`).
- Vercel: keine neue Variable nötig — die URL ergibt sich aus `N8N_WEBHOOK_BASE_URL`.
- Tests: ohne Token → **401** · `limit: 5` → Lauf ok, Bericht angestoßen (Execution 384158)
  · Volllauf aus dem Dashboard → siehe oben (Execution 384160).

## Wiederherstellen aus der Datei (nur falls der Workflow verloren geht)

Die Datei [`plentyone-listings-alle-pruefen.json`](plentyone-listings-alle-pruefen.json)
enthält den Workflow **ohne** Zugangsdaten (Platzhalter).

1. n8n → Workflows → **„Import from File…"** → Datei wählen
2. Knoten **„Konfiguration"**: `passwort` und `webhookToken` aus „Market-Listings
   pruefen (PrimeHub)" übernehmen, `benutzer` angleichen
3. **Save**, Schalter auf **Active**
4. Testen: `limit` im Knoten „Konfiguration" auf `5`, „Test Workflow", danach wieder `0`

## Wenn etwas hakt

| Meldung | Ursache |
|---|---|
| Dashboard: „Workflow in n8n nicht gefunden oder nicht aktiv" | Workflow in n8n nicht aktiv |
| Dashboard: „n8n antwortete 401" | `webhookToken` passt nicht zu `N8N_EBAY_TOKEN` |
| Dashboard: „n8n nicht erreichbar" | n8n oder Cloudflare-Tunnel down — siehe [n8n-server-betrieb.md](n8n-server-betrieb.md) |
| n8n: „Kein Login-Token von PlentyONE" | Passwort in „Konfiguration" |
| n8n: `Task request timed out` am Knoten „Alle pruefen" | Zeitgrenze für Code-Knoten. Beim Volllauf (28 Min) nicht aufgetreten. Falls doch: fehlgeschlagene und ungeprüfte sind durch (kommen zuerst); für den Rest den Lauf auf Etappen umbauen |
| Dashboard: „Nach 60 Minuten kam kein neuer Bericht" | Lauf in n8n unter „Executions" ansehen — läuft er noch, kommt der Bericht später von selbst |
