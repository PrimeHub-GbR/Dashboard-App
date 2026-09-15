# Cover ohne Dateimanager: PlentyONE holt die Bilder selbst

_Stand 16.09.2026. Ersetzt das Hochladen der ZIP-Pakete in den PlentyONE-Dateimanager._

## Warum

Der Dateimanager nimmt nur zehn Bilder auf einmal und hängt sich nach ein paar
Durchgängen auf — bei 1.884 Covern ist das unbenutzbar. Es geht auch ohne ihn:
Die Spalte `bild_multi_url` der Artikel-CSV sagt PlentyONE nur, **von welcher
Adresse** ein Bild zu holen ist. Diese Adresse muss nicht im Dateimanager liegen.

Die Cover liegen jetzt öffentlich abrufbar im Supabase-Speicher:

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

## Die Änderung in n8n

**Was geändert wird:** eine einzige Zeile — die Basis-Adresse der Bilder.

### Schritt 1 — n8n öffnen
1. Öffne https://n8n.primehubgbr.com im Browser
2. Melde dich an

### Schritt 2 — Workflow finden
1. Klicke links in der Seitenleiste auf **Workflows**
2. Suche den Workflow **`[Dashboard] plentyone-metadata`**
3. Klicke darauf, um ihn zu öffnen

### Schritt 3 — Den Knoten „Aufbereiten" öffnen
1. Doppelklick auf den Knoten **„Aufbereiten"** (das ist der Code-Knoten mit den
   geschweiften Klammern `{}`)
2. Rechts öffnet sich das Code-Fenster

### Schritt 4 — Zeile 29 ersetzen
Suche diese Zeile (sie steht ganz oben, etwa bei Zeile 29):

```javascript
const CDN = 'https://cdn02.plentyone.com/lwk1xvxv9m6a/frontend/{ordner}/{ean}.jpg;1';
```

Ersetze sie durch:

```javascript
const CDN = 'https://tcqdyzmhwyfamzyeyskj.supabase.co/storage/v1/object/public/plentyone-cover/{ean}.jpg;1';
```

Die Zeile darüber (`const CDN_ORDNER = 'cover';`) bleibt unverändert stehen — sie
wird nur nicht mehr verwendet und stört nicht.

> Das `;1` am Ende ist die Bildposition und muss bleiben.

### Schritt 5 — Speichern
1. Klicke oben rechts auf den roten **Save**-Button
2. Der Button wird grau — gespeichert ✓

---

## Danach: der Testlauf

1. Dashboard → **PlentyONE-Migration**
2. Amazon-Export wählen, ins Feld **Testlauf** eine **5** eintragen,
   „Was starten" auf **Nur CSV-Dateien**, dann **Migration starten**
3. Nach etwa einer halben Minute die `plentyONE_Import_final.csv` herunterladen
   und prüfen: In der Spalte `bild_multi_url` muss jetzt die
   `supabase.co`-Adresse stehen
4. Diese CSV in PlentyONE als **Artikelimport** ausführen
5. Einen der fünf Artikel öffnen → Tab **Bilder**: Das Cover muss da sein

Kommt das Bild an, ist der Weg bewiesen. Dann:

6. Vollen CSV-Lauf starten (ohne Testlauf-Zahl, etwa fünf Minuten)
7. **Hersteller → Artikel → Eigenschaften** importieren
8. Dashboard → Tab 5 → **Aktualisieren**: `ohne Artikelbild` muss auf unter 100 fallen
9. Erst dann **Import 23** (Listings), danach **Import 22** (Merkmale)

---

## Wenn es nicht klappt

Lädt PlentyONE die Bilder nicht, liegt es nicht an der Datei — die Adresse lässt
sich im Browser öffnen, jeder sieht das Cover. Dann verweigert PlentyONE fremde
Quellen, und der nächste Weg wäre der FTP-Zugang (`upload_article_image_<plentyID>`,
200 Bilder je Durchlauf) — sofern eure Instanz einen hat. Neue Systeme bekommen ihn
laut Handbuch nicht mehr.

---

## Was aus den ZIP-Paketen wird

Sie werden nicht mehr gebraucht, sobald der Weg steht — die Einzelbilder sind der
bessere Bestand. Bis zum bestandenen Testlauf bleiben sie liegen.
