# Cover ohne Dateimanager: PlentyONE holt die Bilder selbst

_Stand 16.09.2026. Ersetzt das Hochladen der ZIP-Pakete in den PlentyONE-Dateimanager._

## Warum

Der Dateimanager nimmt nur zehn Bilder auf einmal und hängt sich nach ein paar
Durchgängen auf — bei 1.884 Covern ist das unbenutzbar. Es geht auch ohne ihn:
Die Spalte `bild_multi_url` der Artikel-CSV sagt PlentyONE nur, **von welcher
Adresse** ein Bild zu holen ist. Diese Adresse muss nicht im Dateimanager liegen.

Die Cover liegen jetzt einzeln und öffentlich abrufbar im Supabase-Speicher:

```
https://tcqdyzmhwyfamzyeyskj.supabase.co/storage/v1/object/public/plentyone-cover/<ISBN13>.jpg
```

PlentyONE lädt sie beim Artikelimport selbst herunter. Kein Upload, keine
ZIP-Pakete, kein Aufhängen — bei jedem Zyklus aufs Neue.

> **Zwei Fallen, die das gekostet hat:**
> 1. Die Bild-URL wird **nur im Moment des Artikelimports** abgeholt. Fehlt die
>    Datei dann, bleibt der Artikel bildlos — PlentyONE holt nichts nach.
> 2. Ein erneuter Artikelimport **ersetzt** das Bild-Set. Zeigen die URLs ins
>    Leere, sind auch die vorhandenen Bilder weg. Genau so stieg `ohne_bild`
>    am 15.09.2026 von 682 auf 1.885, und Import 23 legte kein Listing mehr an.

---

## Was bereits erledigt ist (16.09.2026)

| Schritt | Stand |
|---|---|
| Bucket `plentyone-cover` angelegt, öffentlich lesbar, nur JPEG/PNG bis 10 MB | ✓ |
| 41 ZIP-Pakete ausgepackt, **1.934 Cover** einzeln abgelegt, 0 Fehler | ✓ |
| Stichprobe: 29 von 30 zufälligen ISBN aus der Artikel-CSV abrufbar (die 30. Zeile hat keine EAN) | ✓ |
| n8n `[Dashboard] plentyone-metadata` → Knoten „Aufbereiten" → Zeile 29 umgestellt | ✓ |

Die geänderte Zeile:

```javascript
// vorher
const CDN = 'https://cdn02.plentyone.com/lwk1xvxv9m6a/frontend/{ordner}/{ean}.jpg;1';
// jetzt
const CDN = 'https://tcqdyzmhwyfamzyeyskj.supabase.co/storage/v1/object/public/plentyone-cover/{ean}.jpg;1';
```

Geprüft gegen den Stand vor der Änderung: genau **eine** Codezeile abweichend,
alle 25 Knoten sonst unverändert, Workflow weiterhin aktiv. Das `;1` am Ende ist
die Bildposition und bleibt.

---

## Was noch zu tun ist

### 1 — Testlauf mit fünf Titeln
1. Dashboard → **PlentyONE-Migration**
2. Amazon-Export wählen, Feld **Testlauf** auf **5**, „Was starten" auf
   **Nur CSV-Dateien**, dann **Migration starten**
3. Nach etwa einer halben Minute `plentyONE_Import_final.csv` herunterladen:
   In der Spalte `bild_multi_url` muss jetzt die `supabase.co`-Adresse stehen

### 2 — Diese CSV als Artikelimport ausführen
Einen der fünf Artikel öffnen → Tab **Bilder**: Das Cover muss da sein.
Kommt es an, ist der Weg bewiesen.

### 3 — Vollausbau
1. Vollen CSV-Lauf starten (ohne Testlauf-Zahl, etwa fünf Minuten)
2. **Hersteller → Artikel → Eigenschaften** importieren
3. Dashboard → Tab 5 → **Aktualisieren**:
   `ohne Artikelbild` muss auf unter 100 fallen, `ohne eBay-Listing` auf etwa 1.850 steigen
4. Erst dann **Import 23** (Listings), danach **Import 22** (Merkmale)

---

## Wenn PlentyONE die Bilder nicht zieht

Dann liegt es nicht an den Dateien — die Adressen lassen sich im Browser öffnen.
Dann verweigert PlentyONE fremde Quellen, und der nächste Weg wäre der FTP-Zugang
(`upload_article_image_<plentyID>`, 200 Bilder je Durchlauf) — sofern eure Instanz
einen hat. Neue Systeme bekommen ihn laut Handbuch nicht mehr.

---

## Was aus den ZIP-Paketen wird

696 MB in `workflow-results/plentyone/cover/`. Sie werden nicht mehr gebraucht,
sobald der Weg steht — die Einzelbilder sind der bessere Bestand. **Gelöscht wird
erst nach bestandenem Testlauf**, dann fällt auch der ZIP-Download im Dashboard weg.
