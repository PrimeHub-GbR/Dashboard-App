# Bilder mit Varianten verknüpfen

_Stand 16.09.2026. Gehört zur Cover-Umstellung, siehe [plentyone-cover-per-url.md](plentyone-cover-per-url.md)._

## Das Problem

Der Bild-Import per URL legt das Cover am **Artikel** an — der Schalter „mit
Variante verknüpft" bleibt dabei **aus**. In der Oberfläche sieht man das Bild,
im Angebot erscheint es trotzdem nicht: eBay listet die **Variante**, und daran
muss das Bild hängen.

Am 16.09.2026 betraf das **1.885 von 1.953 Artikeln**. Der eBay-Guard hielt sie
alle zurück, Import 23 bekam null Zeilen, es entstand kein einziges Listing.

PlentyONE kann das weder über eine Standardeinstellung noch per Import noch per
Stapelverarbeitung setzen — geprüft in Handbuch und Entwicklerdoku. Der einzige
Weg ist die Schnittstelle:

```
POST /rest/items/{itemId}/variations/{variationId}/variation_images
{ "imageId": <id> }
```

## Der Workflow

**`Bilder mit Varianten verknuepfen (PrimeHub)`** · ID `VDDcKhyD6AvBKohk` · aktiv

| Knoten | Aufgabe |
|---|---|
| Manuell starten | Klick in der n8n-Oberfläche → verknüpft **alle** offenen Artikel |
| Webhook Start | `POST /webhook/bilder-varianten`, Header `x-primehub-token`, Body `{"limit": N}` |
| Konfiguration | Zugang, `limit` (0 = alle) |
| PlentyONE Login | Token holen |
| Verknuepfen | liest, filtert, schreibt |

**Wiederholbar.** Der Lauf liest zuerst, welche Varianten schon ein Bild haben,
und überspringt sie. Mehrfaches Starten schadet nicht — nach jedem künftigen
Artikelimport einmal laufen lassen.

**Eingebaute Sicherung:** Meldet keine einzige Variante ein Bildfeld, bricht der
Lauf ab, statt blind 2.000 Verknüpfungen zu schreiben. So eine Fehlmessung hat
den Bild-Guard schon einmal zwei Tage blind laufen lassen.

## So startest du den Vollauf

1. https://n8n.primehubgbr.com öffnen
2. Links **Workflows** → **„Bilder mit Varianten verknuepfen (PrimeHub)"**
3. Unten auf **„Execute workflow"** klicken (oder oben „Test workflow")
4. Warten — rund **18 Minuten** für 1.400 Artikel. Der Knoten „Verknuepfen"
   dreht sich, solange er arbeitet. Du musst nicht zuschauen.
5. Am Ende zeigt der Knoten eine Zusammenfassung:

```json
{
  "artikel_gesamt": 1953,
  "ohne_bild_an_variante": 1415,
  "verknuepft": 1415,
  "artikel_ohne_bild_am_artikel": 0,
  "fehler": 0,
  "limit_laut_plentyone": "159 Aufrufe frei, Fenster erneuert sich in 33 s",
  "drossel_treffer": 1
}
```

`fehler: 0` und `verknuepft` ≈ `ohne_bild_an_variante` heißt: alles sitzt.

## Warum es nicht schneller geht

**PlentyONE gibt das Tempo vor.** Gemessen am 16.09.2026: rund **160 bis 175
Aufrufe je Minutenfenster**. Jeder Artikel kostet zwei davon — einen, um die
Bild-ID zu holen, einen für die Verknüpfung. Macht etwa **80 Artikel pro Minute**.

Mehr Gleichzeitigkeit hilft nicht: Das Limit zählt Aufrufe je Minute, nicht
Verbindungen. Ein Versuch mit acht parallelen Schreibvorgängen riss das
Schreiblimit (`short period write limit reached`) — danach scheiterte sogar der
Login der ganzen Instanz. Deshalb stehen jetzt **drei** gleichzeitige Artikel im
Code, und der Lauf liest nach jeder Antwort mit, wie viel Kontingent noch frei
ist (`X-Plenty-Global-Short-Period-Calls-Left`). Wird es eng, wartet er das
Fenster ab, statt hineinzurennen.

Einen Sammelabruf für Bilder, der den ersten Aufruf sparen würde, gibt es nicht:
`/rest/items/images` kennt die Instanz nicht, `/rest/items?with=images` liefert
kein Bildfeld. Beides geprüft.

## Danach

1. Dashboard → Tab 5 → **Aktualisieren**
2. „ohne Artikelbild" muss auf nahezu **null** fallen, „ohne eBay-Listing" auf
   rund **1.850** steigen
3. Dann **Import 23** (Listings), danach **Import 22** (Merkmale)

## Messläufe vom 16.09.2026

| Lauf | Artikel | Ergebnis |
|---|---|---|
| `limit: 5` | 5 | 5 verknüpft, 0 Fehler — der Endpunkt greift |
| `limit: 40` (8 parallel) | 40 | 36 verknüpft, danach **Instanz ausgesperrt** |
| `limit: 40` (Wiederholung) | — | Abbruch beim Login: `short period write limit reached` |
| `limit: 30` (3 parallel, mit Bremse) | 30 | 24 verknüpft, 0 Fehler, 1 Drosseltreffer sauber abgefangen |

Offen waren danach noch **1.415** Artikel. Der Vollauf steht aus.
