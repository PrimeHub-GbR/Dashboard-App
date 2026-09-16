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
4. Warten — bei rund 1.950 Artikeln etwa **15 bis 25 Minuten**. Der Knoten
   „Verknuepfen" dreht sich, solange er arbeitet.
5. Am Ende zeigt der Knoten eine Zusammenfassung:

```json
{
  "artikel_gesamt": 1953,
  "ohne_bild_an_variante": 1946,
  "verknuepft": 1946,
  "artikel_ohne_bild_am_artikel": 0,
  "fehler": 0
}
```

`fehler: 0` und `verknuepft` ≈ `ohne_bild_an_variante` heißt: alles sitzt.

## Danach

1. Dashboard → Tab 5 → **Aktualisieren**
2. „ohne Artikelbild" muss auf nahezu **null** fallen, „ohne eBay-Listing" auf
   rund **1.850** steigen
3. Dann **Import 23** (Listings), danach **Import 22** (Merkmale)

## Testlauf vom 16.09.2026

Mit `limit: 5` gegen die ersten fünf offenen Artikel:

```
verknuepft: 5, fehler: 0
Artikel 170 -> Variante 1125, Bild 158
Artikel 171 -> Variante 1127, Bild 165
Artikel 172 -> Variante 1129, Bild 172
Artikel 173 -> Variante 1131, Bild 178
Artikel 174 -> Variante 1133, Bild 184
```

Der Endpunkt greift. Der Vollauf steht noch aus.
