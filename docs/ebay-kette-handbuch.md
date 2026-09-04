# Handbuch: Die eBay-Kette

_Stand: 04.09.2026 — erstes Listing nachweislich live auf eBay._

Dieses Dokument ist die **Betriebs- und Änderungsanleitung** für den Weg
Amazon → PlentyONE → eBay. Es beantwortet drei Fragen:

1. **Was passiert?** — die Kette von der Amazon-Datei bis zum eBay-Angebot
2. **Wie bediene ich sie?** — der Ablauf alle zwei Wochen
3. **Wie ändere ich etwas?** — Kochrezepte für neue Felder, neue Werte, neue
   eBay-Anforderungen

> **Wer etwas ändern will, springt zu Teil C.** Dort stehen die Rezepte.
> Teil A und B erklären, warum sie so aussehen.

---

# Teil A — Wie die Kette funktioniert

## A1 Überblick

```
   Seller Central                Dashboard                    n8n
   ──────────────                ─────────                    ───
   Amazon-Bericht  ──Upload──►  /dashboard/plentyone  ──►  Anreicherung
   (Mensch zieht                                            VLB + Cover
    ihn selbst)                        │                        │
                                       ▼                        ▼
                              artikel.csv + eigenschaften.csv + Bilder
                                       │
                                       ▼
   ┌───────────────────────────────────────────────────────────────────┐
   │                          P L E N T Y O N E                        │
   │                                                                   │
   │  Artikelimport ──► Artikel + Varianten + VLB-Eigenschaften        │
   │        │                                                          │
   │        ▼                                                          │
   │  Import 23  ◄── ebay-listings.csv    „Wer bekommt ein Listing?"   │
   │        │                                                          │
   │        ▼        Listing + Market-Listing (MLID) entsteht          │
   │        │                                                          │
   │        ▼                                                          │
   │  Import 22  ◄── ebay-merkmale.csv    „Wie sieht das Listing aus?" │
   │        │                                                          │
   │        ▼        Merkmale, Kategorie, Preis, Versand, Titel …      │
   │        │                                                          │
   │        ▼                                                          │
   │  Market-Listings prüfen   (Gruppenfunktion)                       │
   │        │                                                          │
   │        ▼                                                          │
   │  Listing starten  ← ausdrückliche Freigabe durch den Menschen     │
   └───────────────────────────────────────────────────────────────────┘
                                       │
                                       ▼
                       Bericht 05:00 ──► Dashboard, Tab „5 · Weiter zu eBay"
```

**Der Kern in einem Satz:** Zwei PlentyONE-Importe holen sich ihre Dateien
selbst über eine URL; die Dateien werden bei jedem Abruf frisch aus dem
*aktuellen* PlentyONE-Zustand berechnet.

Daraus folgen zwei Eigenschaften, die alles Weitere erklären:

- **Idempotent.** `ebay-listings.csv` enthält nur Artikel, die noch **kein**
  Listing haben. Nach dem Import ist sie automatisch leer. Ein zweiter Lauf
  legt keine Dubletten an.
- **Kein Zwei-Lauf-Problem.** `ebay-merkmale.csv` enthält alle *existierenden*
  MLIDs. Da sie erst beim Abruf gerechnet wird, kennt sie die Sekunden zuvor
  angelegten Listings sofort.

## A2 Die Bauteile und wo sie liegen

| Bauteil | Ort | Zweck |
|---|---|---|
| **Generator** | `scripts/gen_ebay_workflow.py` | Erzeugt den n8n-Workflow. **Hier wird geändert.** |
| **Workflow-JSON** | `docs/plentyone-ebay-workflow.json` | Ausgabe des Generators. **Nie von Hand bearbeiten.** |
| **Regressionstest** | `scripts/test_ebay_workflow.js` | Fährt den echten Code-Node gegen einen simulierten PlentyONE-Stand |
| **n8n-Workflow** | „eBay-Dateien und Kontrolle (PrimeHub)", ID `HYDRm1e5J5nIvJce` | Rechnet die Dateien, schickt den Bericht |
| **Export-Route** | `src/app/api/plentyone/export/[datei]/route.ts` | Liefert die Dateien an PlentyONE aus |
| **Bericht-Route** | `src/app/api/plentyone/ebay/bericht/route.ts` | Nimmt den Bericht an, gibt die letzten 5 zurück |
| **Dashboard-UI** | `src/components/plentyone/EbayKette.tsx` | Abschnitt „5 · Weiter zu eBay" |
| **Datenbank** | `supabase/migrations/139_plentyone_ebay.sql` | Freigabe-Flag am Lauf, Tabelle `plentyone_ebay_berichte` |
| **Spec** | `features/plentyone/ebay-vollautomatisierung.md` | Anforderungen, Akzeptanzkriterien, Edge Cases |
| **Arbeitsstand** | `SESSION_STATUS.md` | Chronik, offene Punkte, belegte Werte |

### Der n8n-Workflow im Detail

15 Knoten, vier Eingänge:

| Eingang | Auslöser | Modus |
|---|---|---|
| `Webhook Listings` | GET `https://n8n.primehubgbr.com/webhook/ebay-listings` | `listings` |
| `Webhook Merkmale` | GET `https://n8n.primehubgbr.com/webhook/ebay-merkmale` | `merkmale` |
| `Zeitplan 05:00` | täglich 05:00 | `bericht` |
| `Manuell starten` | Knopf in n8n | `bericht` |

Alle laufen durch dieselbe Mitte:

```
Modus-Knoten → Konfiguration → Zugang pruefen → PlentyONE Login → Daten holen
                                                                       │
                                              ┌──── Bericht oder CSV ◄─┘
                                              ▼                 ▼
                                       Bericht senden    CSV ausliefern
```

- **Konfiguration** — alle festen Werte an einer Stelle (Zugangsdaten, IDs,
  Vorgabewerte). Der einzige Knoten, den man gefahrlos in der n8n-Oberfläche
  anfasst.
- **Zugang pruefen** — vergleicht das Token aus der URL. Ohne gültiges Token
  keine Daten.
- **Daten holen** — das Herz. Liest PlentyONE über die REST-API, baut beide
  CSVs und den Bericht. Rund 300 Zeilen JavaScript.
- **Bericht oder CSV** — Weiche: Bericht ans Dashboard schicken oder Datei
  ausliefern.

### Was „Daten holen" aus PlentyONE liest

| Aufruf | Wofür |
|---|---|
| `/rest/items?with=texts` | Artikel + Titel (`with=itemTexts` wirft 500 — nicht verwenden) |
| `/rest/items/variations` | Hauptvariante je Artikel, Variantennummer |
| `/rest/listings` | welche Artikel schon ein Listing haben |
| `/rest/listings/markets` | MLIDs + Prüfstatus |
| `/rest/v2/properties/relations?with=values` | Autor (Eigenschaft **10**) |
| `/rest/items/variations?with=variationSalesPrices` | Buchpreisbindungspreis (Verkaufspreis **7**) |

## A3 Stufe 1 — Amazon-Bestand nach PlentyONE

Läuft im Tab **`/dashboard/plentyone`** und ist älter als die eBay-Kette.
Kurzfassung:

1. Der Mensch zieht den Bestandsbericht aus Seller Central. **Keine SP-API** —
   bewusste Entscheidung.
2. Der Upload im Dashboard startet zwei parallele n8n-Stränge: VLB-Anreicherung
   (Titel, Autor, Verlag, gebundener Ladenpreis) und Cover-Beschaffung.
3. Ergebnis: `artikel.csv`, `eigenschaften.csv` und die Bilder.
4. Der Lauf wird im Dashboard **freigegeben**. Erst dann liefert
   `/api/plentyone/export/artikel.csv` Daten aus — und das nur
   `PLENTYONE_EXPORT_FENSTER_TAGE` (Vorgabe 7) lang. Danach kommt nur noch die
   Kopfzeile. So kann ein vergessener Zeitplan keine monatealten Daten
   nachimportieren.
5. Der Artikelimport in PlentyONE holt sich die Dateien über HTTPS/URL.

**Ergebnis dieser Stufe:** Artikel mit Varianten, VLB-Eigenschaften und
gebundenem Ladenpreis. Noch kein einziges Listing.

### Woran ein Buch erkannt wird

Alles Weitere betrifft nur Bücher. Erkannt werden sie an der **Variantennummer**:

```
^[A-Z]{2,4}-.+-[0-9]{2}-[0-9]{2}-[0-9]{4}$
```

Also `<PREFIX>-<Nummer>-<TT-MM-JJJJ>`, zum Beispiel `APR-10001-03-05-2026`.

> **Warum kein Prefix-Filter?** Ein früher Entwurf filterte auf `APR-`. Im
> Bestand kommen aber **APR, MAR, PH, FE, BL, JA, SC, SM, MB und MAE** vor —
> nur 901 von 2.048 Zeilen tragen `APR-`. Über die Hälfte des Sortiments wäre
> stumm liegen geblieben. Entscheidend ist das **Muster**, nicht der Prefix.

## A4 Stufe 2 — Listings anlegen (Import 23)

**Frage, die dieser Import beantwortet: _Wer bekommt überhaupt ein Angebot?_**

Datei: `ebay-listings.csv`, neun Spalten, eine Zeile pro Buch **ohne** Listing.

Ein Buch kommt in die Datei, wenn **alle drei** Bedingungen stimmen:

1. Die Variantennummer passt aufs Buch-Muster.
2. Es hat noch kein Listing.
3. Es hat einen **Buchpreisbindungspreis** (Verkaufspreis-ID 7) größer null.

> **Der Preis-Guard.** Bedingung 3 ist keine Bequemlichkeit, sondern Gesetz.
> eBay-Preise sind gebundene Ladenpreise. Ohne gültigen Preis entsteht erst gar
> kein Listing — und das Buch wird im Bericht **namentlich** genannt. Es fällt
> nie stillschweigend weg.
>
> Sonderfall: Lässt sich die Preisliste gar nicht lesen, wird **nicht** gefiltert
> — stattdessen verlangt der Bericht ausdrücklich eine Handprüfung. Lieber ein
> lauter Zweifel als eine stille Lücke.

Spaltenwerte: siehe D1.

**Ergebnis:** Je Buch ein Listing (LID) und ein Market-Listing (MLID) — leer,
ungeprüft, nicht online.

## A5 Stufe 3 — Merkmale und Einstellungen (Import 22)

**Frage: _Wie sieht das Angebot aus?_**

Datei: `ebay-merkmale.csv`, **16 Spalten**, eine Zeile pro existierender MLID.

Diese Stufe hat die meiste Arbeit gemacht, deshalb ausführlich.

### Die drei Spaltengruppen

**Gruppe 1 — die eBay-Merkmale (Spalten `MLID`, `Name`, `Wert`)**

Das sind die Artikelmerkmale, die eBay beim Angebot anzeigt. Sie stecken
**gebündelt** in zwei Spalten:

```
Name:  Autor,Buchtitel,Sprache
Wert:  Jen Besser; Shana Feste,Dirty Diana: Das Erwachen,Deutsch
```

Beide Spalten sind **kommagetrennte Listen**, Position für Position gepaart.
Daraus folgen zwei harte Regeln:

- **Kein Wert darf ein Komma enthalten** — es ist der Trenner. Kommas werden
  aus allen Werten entfernt.
- **Jeder Wert höchstens 65 Zeichen.** Das gilt für *jedes* Merkmal, nicht nur
  den Titel.

> **Wie wir das gelernt haben:** Der Sammelband *„Myrrhe, Mord und Marzipan"*
> hat 26 Autoren und Übersetzer — das Autorenfeld wäre rund 500 Zeichen lang
> geworden. Deshalb wird beim Autor **an der Namensgrenze** gekappt: lieber
> zwei vollständige Namen als ein zerschnittener. Trenner sind `;`, ` and `
> und ` & `; „Nachname, Vorname" wird zu „Vorname Nachname" gedreht.

**Gruppe 2 — die Listing-Einstellungen (12 Spalten)**

Kategorie, Versandprofil, Zustand, Layout, Lager, Steuer, Sprache, UVP,
Preisvorschlag, Bilderzahl, Preisbindung. Für alle Zeilen gleich, aus dem
Knoten **Konfiguration**.

> **Warum diese Spalten existieren.** Früher setzte eine
> Stapelverarbeitungs-Vorlage („Bücher (1)") diese Werte von Hand. Das war der
> letzte manuelle Schritt der Kette. Alle zwölf Werte lassen sich aber als
> Zielfeld **`Market-Listing-Eigenschaft » Wert`** importieren — PlentyONE
> erlaubt dort **mehrere** Zuordnungen nebeneinander. Damit ist die Vorlage
> überflüssig.

**Gruppe 3 — der eBay-Titel (Spalte `titel_ebay`)**

Zielfeld `Market-Listing-Text » Titel`. Eigene Spalte, weil hier **Kommas
erlaubt** sind und ein anderes Limit gilt: **80 Zeichen**.

Der Artikelname kommt aus Amazon und ist oft weit länger — der Rekord im
Testbestand lag bei 185 Zeichen. PlentyONE lässt das Listing dann **gar nicht
erst speichern**: *„Titel enthält zu viele Zeichen."* Gekürzt wird in drei
Stufen:

1. **Marketing-Anhang abschneiden** — alles hinter ` | `, ` – ` oder ` - `
   ```
   Schmerz: Ein Fall für Dora und Rado | Der fesselnde Island-Krimi des Jahres …
   → Schmerz: Ein Fall für Dora und Rado
   ```
2. **Am Satzende kappen**, wenn dabei mindestens 55 Zeichen übrig bleiben
   ```
   Aufklärung jetzt: Für Vernunft, Wissenschaft, Humanismus und Fortschritt.
   ```
3. **An der Wortgrenze kappen**, hängende Füllwörter („und", „Eine") fallen weg

## A6 Stufe 4 — Prüfen und Bericht

**In PlentyONE:** alle Market-Listings markieren →
**Gruppenfunktion » Market-Listings prüfen**. PlentyONE fragt bei eBay an, ob
das Angebot so zulässig wäre. Ergebnis je Zeile: **✓** (bestanden), **!**
(Warnung oder ungeprüft) oder Fehler. Nach bestandener Prüfung erscheint auch
die Einstellgebühr.

**Im Dashboard:** Der Zeitplan um 05:00 schickt einen Bericht an
`/api/plentyone/ebay/bericht`. Sichtbar unter **„5 · Weiter zu eBay"**, die
letzten fünf Berichte bleiben stehen.

Der Bericht ist **nur dann grün**, wenn:

- kein Listing die Prüfung nicht bestanden hat, **und**
- kein Listing **ungeprüft** ist, **und**
- kein Buch wegen fehlendem Buchpreis zurückgehalten wurde, **und**
- der Preis-Guard tatsächlich prüfen konnte

> **Warum die zweite Bedingung dazukam:** Ein Bericht meldete `ok: true`,
> obwohl nur 6 von 11 Listings geprüft waren — die fünf neuen hatten gar keinen
> Prüfstatus. „Nicht geprüft" wurde wie „in Ordnung" behandelt. Seitdem gibt es
> einen eigenen Zähler: **eine vergessene Prüfung macht den Bericht rot.**

**Das Livestellen bleibt Handarbeit.** Bewusst. Kein Automatismus schaltet
Angebote scharf.

---

# Teil B — Der Ablauf alle zwei Wochen

Für den Mitarbeiter. Reine Bedienung, keine Technik.

### Schritt 1 — Amazon-Bericht ziehen und hochladen

1. Seller Central → Bestandsbericht herunterladen
2. Dashboard → **PlentyONE-Migration** → Datei hochladen
3. Warten, bis der Lauf fertig ist (VLB-Anreicherung + Cover)
4. Den Lauf **freigeben** (Schalter am Lauf)

### Schritt 2 — Artikel nach PlentyONE

PlentyONE → **Daten » Import** → Artikelimport und Eigenschaftsimport starten
(oder den Zeitplan laufen lassen).

### Schritt 3 — Listings anlegen

**Import 23** starten. Legt für jedes neue Buch mit gültigem Buchpreis ein
Listing an. Sind alle Bücher schon gelistet, ist die Datei leer und der Import
meldet null Zeilen — das ist **kein Fehler**, sondern der Normalfall.

### Schritt 4 — Merkmale und Einstellungen

**Import 22** starten. Füllt alle Listings mit Merkmalen, Kategorie, Preis,
Versand, Titel.

### Schritt 5 — Prüfen

PlentyONE → Market-Listings → alle markieren →
**Gruppenfunktion » Market-Listings prüfen**.

### Schritt 6 — Bericht lesen

Dashboard → PlentyONE-Migration → **5 · Weiter zu eBay**.

- **Grün** → weiter zu Schritt 7
- **Rot** → der Bericht nennt jedes Problem mit MLID und Buchtitel. Erst klären.

### Schritt 7 — Livestellen

Nach Sichtprüfung: Listings in PlentyONE starten. **Das entscheidet ein Mensch.**

> **Faustregel für Schritt 3 und 4:** Erst 23, dann 22 — nie umgekehrt. Import 22
> braucht MLIDs, die es ohne Import 23 nicht gibt.

---

# Teil C — Änderungen vornehmen

## Die zwei goldenen Regeln

### Regel 1 — Nie die JSON-Datei bearbeiten

`docs/plentyone-ebay-workflow.json` ist **Ausgabe**, nicht Quelle. Geändert
wird immer `scripts/gen_ebay_workflow.py`, danach:

```bash
python scripts/gen_ebay_workflow.py    # JSON neu bauen
node scripts/test_ebay_workflow.js     # muss "alle Pruefungen bestanden" sagen
```

Der Test fährt den **echten** Code-Node gegen einen simulierten PlentyONE-Stand
mit echten Amazon-Büchern — inklusive des 26-Autoren-Sammelbands und des
185-Zeichen-Titels. Er hat bisher jeden eingebauten Fehler gefunden.

### Regel 2 — „Keine Fehler" heißt nicht „richtig"

Das ist die teuerste Lektion des Projekts. **Zweimal** meldete ein Import
*null Fehler* und schrieb trotzdem einen ungültigen Wert ins Listing:

| Wert | Import meldete | Im Listing stand |
|---|---|---|
| `versandprofil_id = 6` | 11 Zeilen, kein Fehler | „Ungültige Auswahl (6)" — und das korrekte Profil war überschrieben |
| `zustand_id = 1` | keine Fehler | ungültiger Eintrag unter Marktplatz |

**Nach jeder neuen Zuordnung muss ein Listing von Hand angesehen werden.**
Der Import beweist nur, dass die Datei lesbar war. Erst „Market-Listings
prüfen" und der rote Bericht fangen solche Fälle ab — einen Schritt später.

---

## Rezept 1 — Einen festen Wert ändern

**Beispiele:** anderes Lager, andere eBay-Kategorie, anderes Versandprofil,
anderer Steuersatz.

**Kein Code, kein Deployment.** Der Wert steht im n8n-Knoten *Konfiguration*.

1. https://n8n.primehubgbr.com öffnen, Workflow
   **„eBay-Dateien und Kontrolle (PrimeHub)"** öffnen
2. Knoten **Konfiguration** anklicken
3. Das passende Feld suchen (Namen siehe D2) und den Wert ändern
4. Oben rechts **Save**
5. Datei zur Kontrolle abrufen:
   ```bash
   curl "https://dashboard.primehubgbr.com/api/plentyone/export/ebay-merkmale.csv?t=TOKEN" | head -2
   ```
6. **Import 22** starten
7. **Ein Listing öffnen und nachsehen** (Regel 2!)

> ⚠️ **Danach nachziehen:** Denselben Wert auch in
> `scripts/gen_ebay_workflow.py` im Block `KONFIG` eintragen. Sonst wird er beim
> nächsten Generatorlauf wieder überschrieben. Das ist die häufigste
> Stolperfalle.

**Wo finde ich die richtige ID?**

| Wert | Fundort |
|---|---|
| eBay-Versandprofil | Einrichtung » Märkte » eBay » Konto `primehub_gbr` » **Versandprofile** — eigener Zahlenraum, **nicht** die PlentyONE-Versandprofile |
| eBay-Kategorie | die eBay-Kategorie-ID (z. B. 261186 = Bücher & Zeitschriften) |
| eBay-Zustand | eBay-Standardcodes: **1000** Neu · 1500 Neu (Sonstige) · 3000 Gebraucht · 5000 Gut · 6000 Akzeptabel |
| Lager | Einrichtung » Bestand » Lager |
| Layout-Vorlage | Einrichtung » Märkte » eBay » Layout-Vorlagen |

---

## Rezept 2 — Ein neues eBay-Merkmal aufnehmen

**Beispiel:** eBay verlangt zusätzlich „Verlag" oder „Erscheinungsjahr".

**Der große Vorteil:** In PlentyONE ist **nichts** zu tun. Die Spalten `Name`
und `Wert` sind bereits zugeordnet — ein zusätzliches Merkmal ist nur ein
weiterer Eintrag in derselben kommagetrennten Liste.

### Schritt 1 — Quelle finden

Woher kommt der Wert? Meist aus einer VLB-Eigenschaft am Artikel. Deren ID
steht in PlentyONE unter **Einrichtung » Artikel » Eigenschaften** (der Autor
ist zum Beispiel Eigenschaft **10**).

### Schritt 2 — Generator anpassen

In `scripts/gen_ebay_workflow.py`:

```javascript
// a) Konfigwert für die Eigenschafts-ID ergänzen (im Block KONFIG):
{"id": "a19", "name": "verlagEigenschaftId", "value": "12", "type": "string"},

// b) Im Code-Node DATEN die Eigenschaft mitlesen — neben autorByVar:
const verlagByVar = {};
for (const rel of relations) {
  if (rel.propertyId === Number(cfg.verlagEigenschaftId) && rel.values && rel.values[0]) {
    verlagByVar[rel.targetId] = rel.values[0].value || '';
  }
}

// c) In der Schleife über marketListings den Wert bilden:
const verlag = aufMaxKuerzen(verlagByVar[ml.variationId]);

// d) Name- und Wert-Liste erweitern — beide an derselben Position!
bRows.push([ml.id,
            'Autor,Buchtitel,Sprache,Verlag',
            autor + ',' + titel + ',' + cfg.sprache + ',' + verlag]
  .concat(ZUSATZ.map(z => z[1]))
  .concat([ebayTitel(titelRoh)]).join('\t'));
```

> **`aufMaxKuerzen` ist Pflicht.** Es entfernt Kommas und kappt bei 65 Zeichen —
> beides sonst tödlich für die Zeile.
>
> **Was, wenn der Wert fehlt?** Überlegen, ob das Buch ohne dieses Merkmal
> gelistet werden darf. Wenn nein: wie beim Autor in `uebersprungen` schieben,
> damit es im Bericht auftaucht, statt unvollständig durchzugehen.

### Schritt 3 — Bauen und testen

```bash
python scripts/gen_ebay_workflow.py && node scripts/test_ebay_workflow.js
```

Im Test die Prüfung auf die Spaltenanzahl und die 65 Zeichen erweitern.

### Schritt 4 — Live nachziehen

Der Code-Node muss in n8n dieselbe Änderung bekommen: Workflow öffnen → Knoten
**Daten holen** → Code anpassen → **Save**.

### Schritt 5 — Import 22 starten und ins Listing schauen

Das neue Merkmal muss unten bei den Merkmalen stehen.

---

## Rezept 3 — Eine neue Listing-Einstellung übernehmen

**Beispiel:** Ein Feld, das bisher von Hand oder gar nicht gesetzt wird —
Zolltarifnummer, Rückgabebedingungen, Mindestpreis.

Anders als Rezept 2 braucht das **eine neue Spalte und eine neue Zuordnung**.

### Schritt 1 — Prüfen, ob es das Zielfeld gibt

PlentyONE → **Daten » Import** → Import 22 → Reiter **Zuordnung** →
*ZUORDNUNG HINZUFÜGEN* → in der Zielfeld-Liste nachsehen. Relevante Gruppen:

| Gruppe | Wofür |
|---|---|
| `Market-Listing` | Grunddaten des Market-Listings |
| `Market-Listing-Eigenschaft » Wert` | **die meisten Einstellungen** — rechts wählt man die Eigenschaft |
| `Market-Listing-Merkmal » Name/Wert` | die eBay-Merkmale (Rezept 2) |
| `Market-Listing-Text » Titel` | eBay-Angebotstitel |
| `Market-Listing-Preis` | Preisfelder |
| `Listing-Eigenschaft » Wert` | Einstellungen am Listing statt am Market-Listing |

### Schritt 2 — Spalte im Generator ergänzen

Im Block `ZUSATZ`:

```javascript
const ZUSATZ = [
  ['kategorie_id',     cfg.kategorieId     || '261186'],
  …
  ['zolltarif',        cfg.zolltarif       || '49019900'],   // neu
];
```

Und den Vorgabewert in `KONFIG` eintragen:

```javascript
{"id": "b13", "name": "zolltarif", "value": "49019900", "type": "string"},
```

Die Spalte erscheint automatisch in Kopfzeile und allen Datenzeilen.

### Schritt 3 — Bauen, testen, live nachziehen

Wie in Rezept 2, Schritte 3 und 4.

### Schritt 4 — Zuordnung in PlentyONE anlegen

Import 22 → **Zuordnung** → *ZUORDNUNG HINZUFÜGEN*:

| Feld | Eingabe |
|---|---|
| Quellspalte (links) | der neue Spaltenname, z. B. `zolltarif` |
| Zielfeld | `Market-Listing-Eigenschaft » Wert` |
| Eigenschaft (rechts) | die passende Eigenschaft aus der Liste |

Speichern.

### Schritt 5 — Import starten und ins Listing schauen

**Regel 2.** Bei Verdacht auf ein falsches Format: D3 lesen.

> **Bei mehreren neuen Spalten: in Wellen arbeiten.** Drei auf einmal, dann
> Import, dann prüfen. Wenn etwas kaputtgeht, weiß man sonst nicht, welcher Wert
> schuld war. Genau so haben wir die zwölf Einstellungen gefunden.

---

## Rezept 4 — Text- und Kürzungsregeln ändern

Alles in `scripts/gen_ebay_workflow.py`, Abschnitt *„Textregeln des Import 22"*:

| Was | Wo | Vorgabe |
|---|---|---|
| Länge je Merkmalswert | `const MAX` | 65 |
| Länge des eBay-Titels | `const EBAY_TITEL_MAX` | 80 |
| Wie Autoren getrennt werden | `autorUmformen` | `;`, ` and `, ` & ` |
| Wo der Marketing-Anhang abgeschnitten wird | `ebayTitel`, `t.search(…)` | ` \| `, ` – `, ` — `, ` - ` |
| Ab wann am Satzende gekappt wird | `satz >= 55` | 55 Zeichen |
| Welche Füllwörter am Ende wegfallen | die Wortliste in `ebayTitel` | und, oder, mit, für … |

Danach immer bauen und testen. Der Test prüft Titellänge, Satzende-Kappung und
die 65 Zeichen je Merkmal.

---

## Rezept 5 — eBay ändert seine Anforderungen

### Fall A: Neues Pflichtmerkmal in der Kategorie

Zeigt sich als **fehlgeschlagene Prüfung** — der Bericht wird rot und nennt die
MLIDs.

1. In PlentyONE ein betroffenes Listing öffnen und die Prüfmeldung lesen; sie
   nennt das fehlende Merkmal.
2. → **Rezept 2**

### Fall B: Ein Wert wird nicht mehr akzeptiert

Zum Beispiel eine geänderte Zustands- oder Kategorie-ID.

1. Neuen gültigen Wert nachschlagen (Tabelle in Rezept 1)
2. → **Rezept 1**

### Fall C: Neue Kategorie mit anderen Merkmalen

1. `kategorieId` ändern (Rezept 1)
2. Merkmale der neuen Kategorie prüfen — meist zusätzlich Rezept 2
3. **An einem einzelnen Listing testen**, bevor alle umgestellt werden

### Immer gilt

Die Prüfung ist das Frühwarnsystem. Sie kostet nichts und läuft vor dem
Livegang. Bei jedem Zweifel: prüfen lassen und den Bericht lesen.

---

## Rezept 6 — Andere Bücher aufnehmen

**Ein neuer Prefix** (etwa `XY-`) braucht **keine** Änderung — das Muster
akzeptiert zwei bis vier Großbuchstaben.

**Ein anderes Nummernschema** dagegen schon: `variantenMuster` im Knoten
*Konfiguration* anpassen (und im Generator nachziehen).

Zum **Testen mit wenigen Büchern** gibt es `variantenPrefix`: steht dort etwas,
kommen nur Nummern mit diesem Prefix durch. Im Normalbetrieb bleibt das Feld
leer.

---

> **Hinweis zu n8n-Änderungen.** Projektregel ist: Claude liest n8n-Workflows
> nur. Für dieses Projekt hat der Nutzer ausdrücklich Schreibrechte erteilt,
> deshalb kann Claude den Knoten *Daten holen* per MCP nachziehen. Ohne diese
> ausdrückliche Erlaubnis erstellt Claude stattdessen eine
> Schritt-für-Schritt-Anleitung zum Selbermachen.

---

# Teil D — Referenz

## D1 Spalten von Import 23

Datei `ebay-listings.csv`, Zielimport **„eBay-Listing-Erstellung"**.

| Spalte | Wert | Bedeutung |
|---|---|---|
| `ItemID` | je Zeile | PlentyONE-Artikel-ID |
| `MarketID` | `1008` | eBay Deutschland |
| `UserID` | `10` | PlentyONE-Benutzer |
| `TypeID` | `2` | Listing-Typ |
| `StockDependenceTypeID` | `1` | Bestandsabhängigkeit |
| `UnitCombinationID` | `1` | Mengeneinheit |
| `DirectoryID` | `1` | Verzeichnis „Bücher" |
| `Enabled` | `Y` | freigeschaltet |
| `Duration` | `GTC` | Endlos (Good 'Til Cancelled) |

## D2 Spalten von Import 22

Datei `ebay-merkmale.csv`, Zielimport **„eBay-Merkmale Bücher"**.
16 Spalten, Reihenfolge wie in der Datei.

| # | Spalte | Zielfeld | Eigenschaft rechts | Wert | Konfigfeld |
|---|---|---|---|---|---|
| 1 | `MLID` | Market-Listing » ID | — | je Zeile | — |
| 2 | `Name` | Market-Listing-Merkmal » Name | — | `Autor,Buchtitel,Sprache` | — |
| 3 | `Wert` | Market-Listing-Merkmal » Wert | — | je Zeile, kommagetrennt | `sprache` |
| 4 | `kategorie_id` | Market-Listing-Eigenschaft » Wert | Kategorie-ID 1 | `261186` | `kategorieId` |
| 5 | `versandprofil_id` | Market-Listing-Eigenschaft » Wert | Versandprofil-ID | `1` | `versandprofilId` |
| 6 | `zustand_id` | Market-Listing-Eigenschaft » Wert | eBay-Zustands-ID | `1000` | `zustandId` |
| 7 | `layout_id` | Market-Listing-Eigenschaft » Wert | Layout-Vorlagen-ID | `1` | `layoutId` |
| 8 | `lager_id` | Market-Listing-Eigenschaft » Wert | Lager-ID | `2` | `lagerId` |
| 9 | `mwst_land` | Market-Listing-Eigenschaft » Wert | MwSt.-Land | `1` | `mwstLand` |
| 10 | `mwst` | Market-Listing-Eigenschaft » Wert | Mehrwertsteuersatz | `7` | `mwst` |
| 11 | `sprache_code` | Market-Listing-Eigenschaft » Wert | Sprache | `de` | `spracheCode` |
| 12 | `uvp` | Market-Listing-Eigenschaft » Wert | eBay UVP übertragen | `N` | `uvpUebertragen` |
| 13 | `preisvorschlag` | Market-Listing-Eigenschaft » Wert | eBay-Preisvorschlag | `N` | `preisvorschlag` |
| 14 | `bilder` | Market-Listing-Eigenschaft » Wert | Anzahl der Bilder | `1` | `anzahlBilder` |
| 15 | `preisbindung` | Listing-Eigenschaft » Wert | An Artikelpreis binden | `Y` | `preisbindungWert` |
| 16 | `titel_ebay` | Market-Listing-Text » Titel | — | je Zeile, ≤ 80 Zeichen | — |

> **Zwei Steuerfelder, nicht eines.** Der Base-Reiter hat *MwSt.-Land* **und**
> *Mehrwertsteuersatz*. Mit `mwst` allein bleiben **beide** leer. Dass es lange
> gefüllt aussah, lag an der alten Stapelvorlage — aufgefallen ist es erst an
> Listings, die die Vorlage nie gesehen hatten.

## D3 Wertformate

Teuer erkauft, deshalb ausdrücklich:

| Feldtyp | Format | Beleg |
|---|---|---|
| **Ja/Nein** | **`Y` / `N`** — niemals `0`/`1` | „An Artikelpreis binden": `7` abgewiesen, `1` abgewiesen, `Y` lief. Ebenso `Enabled = Y`, `Duration = GTC` |
| Auswahl-IDs | reine Zahl | Kategorie `261186`, Lager `2`, Layout `1` |
| **eBay-Zustand** | **eBay-Standardcode**, nicht PlentyONE-ID | `1000` = Neu; `1` erzeugte „ungültiger Eintrag" |
| **eBay-Versandprofil** | **eigener Zahlenraum je eBay-Konto** | `1` = „Bücher DE"; `6` aus den PlentyONE-Versandprofilen war falsch |
| Sprache | Kürzel | `de` |
| MwSt.-Land | PlentyONE-Länder-ID | `1` = Deutschland |
| Merkmalswerte | ≤ 65 Zeichen, **kein Komma** | Komma ist der Trenner |
| eBay-Titel | ≤ 80 Zeichen | PlentyONE verweigert sonst das Speichern |

## D4 Zugänge und Umgebungsvariablen

**Keine Werte in Git.** Fundorte:

| Variable | Wo | Zweck |
|---|---|---|
| `PLENTYONE_EXPORT_TOKEN` | Vercel + `.env.local` | Token in der Abhol-URL (`?t=…`) |
| `N8N_EBAY_TOKEN` | Vercel + n8n-Konfiguration | Token zwischen Dashboard und n8n |
| `N8N_EBAY_LISTINGS_URL` | Vercel | `https://n8n.primehubgbr.com/webhook/ebay-listings` |
| `N8N_EBAY_MERKMALE_URL` | Vercel | `https://n8n.primehubgbr.com/webhook/ebay-merkmale` |
| `PLENTYONE_EXPORT_FENSTER_TAGE` | Vercel (optional) | Gültigkeit der Artikel-Exporte, Vorgabe 7 |
| PlentyONE-Zugang | n8n-Knoten *Konfiguration* | Benutzer `Tempnutzer` + Passwort |

**Die vier Abhol-URLs** (PlentyONE-Importe, Datenquelle *HTTPS / URL*):

```
https://dashboard.primehubgbr.com/api/plentyone/export/artikel.csv?t=TOKEN
https://dashboard.primehubgbr.com/api/plentyone/export/eigenschaften.csv?t=TOKEN
https://dashboard.primehubgbr.com/api/plentyone/export/ebay-listings.csv?t=TOKEN
https://dashboard.primehubgbr.com/api/plentyone/export/ebay-merkmale.csv?t=TOKEN
```

> Das Token steht in der URL, weil PlentyONE bei HTTPS-Quellen **keine Header**
> setzen kann. Der Vergleich läuft zeitkonstant. Kommt ein Token in falsche
> Hände: in Vercel und im n8n-Knoten *Konfiguration* austauschen.

## D5 Fehlerkatalog

| Meldung / Symptom | Ursache | Lösung |
|---|---|---|
| `Use Item Price invalid. \| ( UpdateListingMarket )` | „An Artikelpreis binden" bekam `7` oder `1` | Wert `Y` |
| „Ungültige Auswahl (6)" beim Versandprofil | PlentyONE-Versandprofil-ID statt eBay-Profil-ID | `1` (eBay-Konto » Versandprofile) |
| Ungültiger Eintrag beim Zustand, **kein** Importfehler | `zustand_id = 1` | `1000` |
| „Titel enthält zu viele Zeichen", Speichern schlägt fehl | Amazon-Titel > 80 Zeichen | Spalte `titel_ebay` zuordnen |
| MwSt.-Land und -Satz leer | nur `mwst` zugeordnet | zusätzlich `mwst_land = 1` |
| Bericht grün, obwohl Listings ungeprüft | alter Fehler, behoben | ungeprüfte Listings machen den Bericht jetzt rot |
| Import 23 meldet 0 Zeilen | alle Bücher haben schon ein Listing | **kein Fehler** — Normalfall |
| Buch taucht nirgends auf | Variantennummer passt nicht aufs Muster | Nummer prüfen, ggf. `variantenMuster` |
| Buch im Bericht „kein Buchpreisbindungspreis" | Verkaufspreis 7 fehlt oder ist 0 | VLB-Preis in PlentyONE nachtragen |
| Bericht verlangt Handprüfung der Preise | Preisliste nicht lesbar | PlentyONE-Zugang prüfen, dann erneut |
| Merkmalzeile fehlt, Buch in „übersprungen" | Autor oder Titel fehlt | Eigenschaft am Artikel nachtragen |
| Kategorie steht auf „Unknown" | Import 22 lief noch nicht | Import 22 starten |
| Export liefert nur die Kopfzeile | Lauf nicht freigegeben oder älter als 7 Tage | Lauf freigeben bzw. neu erzeugen |
| Angeblich kein Fehler, Listing trotzdem falsch | siehe **Regel 2** | Listing ansehen, Format in D3 prüfen |

## D6 Grenzen

Was **nicht** geht und warum:

- **PlentyONE-Importe lassen sich nicht per API starten.** Live geprüft am
  04.09.2026: `/rest/data/import(s)`, `/rest/imports`, `/rest/item/import`
  antworten mit 503. Auch `/rest/listings/markets/{id}/verify` gibt es nicht.
  Der interne UI-Endpunkt `ui.php` wäre technisch möglich, wurde aber
  **bewusst verworfen** — Sitzungscookie plus rotierendes Token, das bricht bei
  jedem PlentyONE-Update. Bleibt: **Zeitpläne in PlentyONE** oder ein Klick.
- **Livestellen bleibt Handarbeit.** Bewusst so.
- **Amazon wird nur gelesen.** Keine Preise, Artikeldaten oder Bestände zurück.
- **Keine Amazon-SP-API.** Der Bericht wird von Hand gezogen.
- **VLB erlaubt höchstens 2 gleichzeitige Sitzungen.** Ein Lauf belegt beide,
  Logout ist Pflicht.
