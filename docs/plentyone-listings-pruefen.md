# Market-Listings prüfen — ohne Gruppenfunktion

_Stand 16.09.2026._

## Das Problem

PlentyONE prüft jedes Angebot gegen eBay, bevor es online darf. In der Oberfläche
geht das über die Gruppenfunktion „Market-Listings prüfen" — die schafft aber nur
eine Handvoll auf einmal. Bei **1.873 ungeprüften Angeboten** ist das keine Option.

Die Technik-Doku hielt fest, die REST-API könne das nicht: `/verify` antwortete am
04.09.2026 mit **503**. Das war ein Trugschluss — PlentyONE liefert 503 auch für
Routen, die es gar nicht gibt, und der Pfad war schlicht falsch geraten.

## Der Weg, der funktioniert

```
POST /rest/listings/markets/verify
{ "id": 115 }

→ {"affectedRows": 1}
```

**Nur dieses Format wirkt.** Am 16.09.2026 durchgetestet:

| Pfad / Format | Antwort |
|---|---|
| `POST /rest/listings/markets/{id}/verify` | 503 |
| `POST /rest/listings/markets/{id}/validate` | 503 |
| `POST /rest/listings/markets/{id}/check` | 503 |
| `PUT /rest/listings/markets/{id}/verify` | 503 |
| `POST /rest/listings/verify` | 503 |
| `POST /rest/markets/listings/{id}/verify` | 503 |
| `POST /rest/listings/markets/verify` + `{ids:[…]}` | 200, **`affectedRows: 0`** |
| `POST /rest/listings/markets/verify` + `{listingIds:[…]}` | 200, **`affectedRows: 0`** |
| `POST /rest/listings/markets/verify` + `{marketListingIds:[…]}` | 200, **`affectedRows: 0`** |
| **`POST /rest/listings/markets/verify` + `{id: <MLID>}`** | **200, `affectedRows: 1`** ✓ |

> **Nachtrag 26.09.2026 — `affectedRows` zählt nur geänderte Zeilen.** Ein Angebot,
> das erneut mit demselben Ergebnis geprüft wird, meldet `affectedRows: 0`, obwohl die
> Prüfung lief. Beim Volllauf: 1.822 von 1.823 bestandenen meldeten 1 (Gebühr neu),
> alle 102 fehlgeschlagenen meldeten 0 (Ergebnis unverändert). 0 heißt also nur bei
> `unknown`-Angeboten sicher „nichts passiert".

> **Die eigentliche Falle:** Die drei Bulk-Formate antworten mit **200**, bewirken
> aber nichts. Wer nur auf den Statuscode schaut, hält den Lauf für erfolgreich und
> wundert sich, warum nichts geprüft wird. Der Beweis steckt allein in
> `affectedRows`. Der Workflow zählt deshalb mit, wie oft eine Zeile betroffen war.

Gegenprobe an MLID 115: `verified` ging von `"unknown"` auf `"succeeded"`.

> **`verified` ist ein String, kein Ja/Nein.** `"unknown"` = noch nicht geprüft,
> `"succeeded"` = geprüft und startklar, alles andere = Prüfung fehlgeschlagen.
> Eine Abfrage auf `verified !== true` findet deshalb *alle* Listings.

## Der Workflow

**`Market-Listings pruefen (PrimeHub)`** · ID `ufqiBqiE1atoYopj` · aktiv

| Knoten | Aufgabe |
|---|---|
| **Zeitplan 04:30** | läuft täglich von allein |
| Manuell starten | Klick in n8n → prüft alle offenen |
| Webhook Start | `POST /webhook/listings-pruefen`, Header `x-primehub-token`, Body `{"limit": N}` |
| Konfiguration | Zugang, `limit` (0 = alle) |
| PlentyONE Login | Token holen |
| Pruefen | liest alle Market-Listings, stößt für jedes `unknown` die Prüfung an |

**Wiederholbar:** Bereits geprüfte Angebote werden übersprungen.

> **Alle neu prüfen (seit 26.09.2026):** Bestandene und fehlgeschlagene Angebote fasst
> dieser Lauf nie wieder an. Dafür gibt es den zweiten Workflow
> `Market-Listings ALLE neu pruefen (PrimeHub)` (`3MuPhuwtEgE8yL2j`), gestartet über den
> Knopf „Alle neu prüfen" im Dashboard — nötig z. B. nach dem Top-Shop-Wechsel, damit
> PlentyONE die Einstellgebühr neu rechnet. Siehe
> [plentyone-listings-alle-pruefen.md](plentyone-listings-alle-pruefen.md).

**Eingebaute Sicherung:** Liefert der Abruf keine Market-Listings, bricht der Lauf
ab, statt so zu tun, als sei alles erledigt.

**Tempo:** PlentyONE meldet rund **200 freie Aufrufe je Fenster**, ein Aufruf je
Listing. Der Volllauf über 1.925 Angebote am 26.09.2026 brauchte trotzdem **28 Minuten**,
davon 23 Minuten Warten auf das nächste Fenster — mit rund 30 Minuten rechnen. Der Lauf liest den Kopf
`X-Plenty-Global-Short-Period-Calls-Left` mit und wartet das Fenster ab, wenn es
eng wird. Drei Prüfungen gleichzeitig; mehr reißt das Schreiblimit.

## Die nächtliche Kette

```
01:45  Herstellerimport
02:00  Artikelimport
02:30  Eigenschaftsimport + Import 23 (Listings anlegen)
03:00  Import 22 (Merkmale)
04:00  Bilder mit Varianten verknüpfen      → VDDcKhyD6AvBKohk
04:30  Market-Listings prüfen               → ufqiBqiE1atoYopj
05:00  eBay-Statusbericht                   → HYDRm1e5J5nIvJce
```

> **Uhrzeiten (Beobachtung 26.09.2026):** Laut n8n-Protokoll starten die n8n-Läufe
> sechs Stunden später als oben angegeben — „04:00" lief um 10:00 deutscher Zeit
> (08:00 UTC). n8n rechnet offenbar in New Yorker Zeit. Die Reihenfolge stimmt trotzdem,
> weil die PlentyONE-Importe vorher laufen. Behebbar über `GENERIC_TIMEZONE=Europe/Berlin`
> auf dem n8n-Server — noch nicht umgesetzt.

Jeder Schritt setzt auf dem vorigen auf: Erst hängen die Cover an den Varianten,
dann prüft eBay die Angebote, dann zählt der Bericht das Ergebnis. Im Dashboard
steht am Morgen unter „Nächster Schritt", ob noch etwas zu tun ist.

## Testlauf vom 16.09.2026

```
limit: 5 → 5 angestoßen, 0 ohne Wirkung, 0 Fehler, 0 Drosseltreffer
Dauer 11,4 s (davon ~10 s für das Einlesen aller 1.925 Market-Listings)
limit_laut_plentyone: "199 Aufrufe frei, Fenster erneuert sich in 60 s"
```

Der Vollauf über die restlichen 1.868 läuft in der Nacht von selbst.
