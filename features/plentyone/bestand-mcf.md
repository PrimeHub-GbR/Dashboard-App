# Bestand aus Amazon FBA + Versand per MCF

**Status:** In Progress
**Tab:** PlentyONE-Migration `/dashboard/plentyone`
**Zugriff:** Admin + Manager
**Quelle:** PlentyONE-Handbuch + Live-REST-Proben, 06.09.2026
**Verwandt:** [ebay-vollautomatisierung.md](ebay-vollautomatisierung.md) · Technik: [`docs/ebay-kette-technik.md` §13](../../docs/ebay-kette-technik.md)

---

## 1. Warum

Der gesamte physische Bestand — rund 2.000 Bücher, fast durchweg **Einzelstücke** — liegt in
Amazons Logistikzentren. Die eBay-Kette baut Angebote, kennt aber keinen Bestand: jede Menge
steht fest auf 1, die Bestandsautomatik ist aus, Lager 2 ist leer.

Bei Einzelstücken ist das gefährlich. Verkauft ein Amazon-Kunde das letzte Exemplar, steht es
auf eBay weiter zum Verkauf. Der eBay-Käufer bezahlt, und geliefert werden kann nicht.

Drei Dinge sollen deshalb ohne Handarbeit laufen:

1. Die eBay-Menge folgt dem FBA-Bestand.
2. eBay-Aufträge liefert Amazon per Multi-Channel-Versand (MCF).
3. Ein Amazon-Verkauf nimmt das Buch von eBay.

---

## 2. Wer besitzt was

Die wichtigste Architekturentscheidung ist die Eigentümerschaft. Jedes Datum hat **genau ein**
System, das es bestimmt — alle anderen lesen.

| Datum | Eigentümer | Alle anderen |
|---|---|---|
| **Physischer Bestand** | Amazon FBA | lesen; PlentyONE spiegelt ihn in Lager 2 |
| **Amazon-Preise** | externer Repricer | lesen; PlentyONE schreibt nie zurück |
| **Gebundener Ladenpreis** | VLB | PlentyONE speichert ihn als Verkaufspreis 7 |
| **Artikeldaten, Cover** | PlentyONE (aus VLB) | eBay bekommt sie über das Listing |
| **eBay-Angebote** | PlentyONE | eBay ist Anzeigefläche |
| **Aufträge, Rechnungen** | PlentyONE | Amazon liefert nur aus |
| **Wahrheit über den Zustand** | der Statusbericht im Dashboard | — |

Daraus folgt die Grundform: **Amazon ist die Bestandsquelle, PlentyONE die Drehscheibe,
eBay der Kanal, das Dashboard der Beobachter.** Keine Schleife, kein Zurückschreiben.

---

## 3. Datenflüsse

### 3.1 Bestand: Amazon nach eBay

```
Amazon-Verkauf
   └─► Amazon senkt den FBA-Bestand                          sofort
       └─► PlentyONE: FBA-Bestandsimport                     stündlich
           └─► Lager 2: stockPhysical / stockNet
               └─► eBay-Bestandsautomatik                    alle 20 min
                   └─► Menge 0 → "Nicht mehr vorrätig"
                       Angebot bleibt sichtbar, ist unkaufbar
                       kommt Bestand zurück → wieder kaufbar
```

**Worst Case 80 Minuten.** In diesem Fenster ist ein bereits verkauftes Buch auf eBay noch
kaufbar. Bewusst akzeptiert — die Alternative wäre ein Bestandspuffer, der bei Einzelstücken
jedes Angebot dauerhaft ausblendet.

### 3.2 Auftrag: eBay nach Amazon

```
eBay-Verkauf
   └─► PlentyONE: eBay-Auftragsimport                        stündlich
       └─► Auftrag in Lager 2 → reservedStock +1 → stockNet 0
           └─► Automatik nimmt das Angebot heraus            ≤ 20 min
               (schützt den zweiten eBay-Käufer)
       └─► Zahlung → Status [5] Freigabe Versand
           └─► Flow: "Versandfreigabe an FBA erteilen"
               └─► MCF-Auftrag bei Amazon
                   └─► neutrale Lieferung an den eBay-Kunden
                       └─► Paketnummer                       1x täglich
                           └─► eBay: "versendet"
       └─► nächster FBA-Import setzt Lager 2 absolut
```

### 3.3 Beobachtung: PlentyONE nach Dashboard

Der n8n-Knoten *Daten holen* liest `GET /rest/stockmanagement/warehouses/2/stock` und meldet
je Lauf: kaufbare Bücher, Bücher mit Bestand 0, Alter des letzten FBA-Imports.

---

## 4. Zustandsmodell des Bestands

PlentyONE kennt drei Zahlen je Variante und Lager. Nur eine davon steuert eBay:

| Zahl | Bedeutung | Wer verändert sie |
|---|---|---|
| `stockPhysical` | was tatsächlich bei Amazon liegt | **nur** der FBA-Bestandsimport, absolut |
| `reservedStock` | für offene Aufträge zurückgelegt | PlentyONE beim Auftragsimport |
| `stockNet` | physisch minus reserviert — **das ist die eBay-Menge** | ergibt sich |

**eBay-Menge = min(1, stockNet in Lager 2).**

Der Import setzt absolute Werte, keine Differenzen. Ein verpasster Lauf korrigiert sich beim
nächsten von selbst — es gibt keine auflaufenden Fehler.

---

## 5. Leitplanken

Regeln, die nicht gebrochen werden. Jede mit ihrem Grund — eine Leitplanke ohne Begründung
wird beim ersten Termindruck überfahren.

| # | Leitplanke | Warum |
|---|---|---|
| **L1** | **Amazon ist die einzige Bestandsquelle.** Niemand schreibt Bestand nach PlentyONE außer dem FBA-Import. | Zwei Quellen driften auseinander, und niemand weiß, welche recht hat. |
| **L2** | **Amazon bleibt für Preise und Artikeldaten schreibgeschützt.** Artikelexport `Nein`, Preisänderungen und Bestandsänderungen `Keine Übertragung`. | Der externe Repricer hat die Preishoheit. Ein Export würde ihn überschreiben und Amazon-Umsatz kosten. |
| **L3** | **Nur Lager 2 speist eBay.** Unter *Listings » Warenbestand* ist ausschließlich Lager 2 gewählt. | Lager 1 "Sales" führt Nullzeilen. Zählte es mit, wären Bücher scheinbar ausverkauft. |
| **L4** | **Die Kette filtert nie wegen Bestand — sie meldet nur.** Ein unlesbares Lager hält kein Buch zurück und zählt kein Buch als ausverkauft. | Sonst löscht ein Endpunktfehler stillschweigend das halbe Sortiment von eBay. Dasselbe Muster wie beim Preis- und Bild-Guard. |
| **L5** | **MCF nur für Nicht-Amazon-Aufträge.** Der Flow filtert zwingend auf *Herkunft ungleich Amazon*. | Ohne diesen Filter bekäme ein Amazon-Auftrag eine zweite Versandfreigabe — Amazon liefert doppelt. |
| **L6** | **Die Buchpreisbindung schlägt jeden anderen Preis.** Verkaufspreis 7 (Position 2) vor 8 (Position 3); Verkaufspreis 1 bekommt nie eBay-Konten. | Gebundene Bücher unter Ladenpreis anzubieten ist ein Rechtsverstoß. |
| **L7** | **Menge je Listing bleibt 1, Bestandspuffer bleibt 0.** | Es sind Einzelstücke. Ein Puffer von 1 blendet jedes Angebot dauerhaft aus. |
| **L8** | **Bestandsabhängigkeit: Import 2, REST 3** — "beschränkt (ohne Reservierung)". | Die beiden Skalen sind gegeneinander verschoben. Ein `3` im Import ergibt "unbeschränkt ohne Abgleich": keine Automatik, Überverkauf garantiert. |
| **L9** | **Prozesslogik lebt in n8n; Änderungen nur über `scripts/gen_ebay_workflow.py`.** Nie im erzeugten JSON, nie direkt im Live-Knoten. | Der Generator ist die einzige Quelle. Handänderungen gehen beim nächsten Lauf verloren. |
| **L10** | **Read-only-Schalter vor der SP-API.** Erst die drei Export-Schalter auf Nein bzw. Keine Übertragung, dann "Zugriff erlauben". | In der Lücke dazwischen würde PlentyONE sofort Artikel und Preise nach Amazon exportieren. |
| **L11** | **Kein Listing ohne Bild und ohne gültigen Preis.** | eBay lehnt bildlose Angebote ab; ohne Preis entsteht kein Listing. Beides ist bereits eingebaut. |
| **L12** | **Kein stiller Verlust.** Jedes zurückgehaltene Buch steht namentlich im Bericht. | Ein Buch, das unbemerkt nie angeboten wird, kostet dauerhaft Umsatz. |

---

## 6. Akzeptanzkriterien

Prüfbar formuliert — jedes hat eine Beobachtung, die es erfüllt oder widerlegt.

### Bestand

- **AK1 — Typ gesetzt.** `GET /rest/listings/{id}` liefert für jedes eBay-Listing
  `stockDependenceTypeId: 3`.
- **AK2 — Spiegel stimmt.** Für drei Stichproben-SKUs entspricht `stockPhysical` in Lager 2
  der verfügbaren Menge in Seller Central.
- **AK3 — Amazon-Verkauf wirkt.** Nach dem Verkauf des letzten Exemplars bei Amazon ist das
  eBay-Angebot binnen **90 Minuten** nicht mehr kaufbar.
- **AK4 — Rückkehr.** Kommt Bestand zurück, ist das Angebot binnen 20 Minuten wieder kaufbar,
  mit derselben Angebotsnummer und erhaltenem Ranking.
- **AK5 — Frische sichtbar.** Der Bericht nennt `bestand_kaufbar`, `bestand_null` und
  `bestand_alter_min`; bei eingeschalteter Überwachung wird er rot, sobald der letzte
  FBA-Import älter als 120 Minuten ist.
- **AK6 — Kein Fehlalarm-Filter.** Ein Ausfall des Lager-Endpunkts hält kein Buch aus CSV A
  zurück und zählt kein Buch als ausverkauft — er macht nur den Bericht rot.

### Versand

- **AK7 — MCF greift.** Ein bezahlter eBay-Auftrag erzeugt ohne Handgriff einen MCF-Auftrag in
  Seller Central mit der Lieferadresse des eBay-Käufers.
- **AK8 — Kein Doppelversand.** Ein Amazon-Auftrag löst **keine** MCF-Freigabe aus.
- **AK9 — Rückmeldung.** Die Paketnummer erreicht den eBay-Auftrag, der Status wechselt auf
  "versendet", und der Bestand in Lager 2 sinkt beim nächsten Import um 1.
- **AK10 — Neutral.** Das Paket trägt kein Amazon-Logo.

### Grenzen

- **AK11 — Amazon unangetastet.** 24 Stunden nach der Anbindung sind Preise und Angebotsdaten
  der Pilotbücher in Seller Central unverändert.
- **AK12 — Buchpreisbindung.** Kein gebundenes Buch steht auf eBay unter seinem Ladenpreis:
  Stichprobe zeigt Preis-ID 7 mit dem VLB-Betrag.

---

## 7. Fehlerbilder

| Fall | Verhalten | Wer handelt |
|---|---|---|
| Bestand 0 | "Nicht mehr vorrätig", Angebot sichtbar und unkaufbar, Bericht bleibt grün | niemand — Normalfall |
| FBA-Bestandsimport steht | Bericht: "FBA-Bestand veraltet"; mit Überwachung rot | Chef: Amazon-Verbindung prüfen |
| Lager-Endpunkt antwortet nicht | gemeldet, rot, **kein** Buch zurückgehalten | Chef |
| Lager 2 ohne Bestandszeilen | "Der Amazon-Bestandsimport läuft nicht" — rot | Chef |
| Überverkauf im 80-Minuten-Fenster | MCF scheitert mangels Bestand | eBay-Auftrag stornieren, Käufer informieren |
| eBay-Auftrag ohne Amazon-SKU | MCF findet den Artikel nicht | Artikelimport prüfen |
| Artikelpakete | vom FBA-Bestandsimport ausgeschlossen | bei Büchern unkritisch |

---

## 8. Arbeitsteilung

| Teil | Wer | Stand |
|---|---|---|
| Bestandsabhängigkeit 2, CSV-Spalte, Bestandsteil im Bericht, Tests, Doku | Claude | **fertig** |
| Konfiguration in n8n (drei Werte, Code-Knoten) | Nutzer nach Anleitung | offen |
| Zuordnung in Import 22 | Nutzer | offen |
| Elf PlentyONE-Einstellungen inkl. SP-API und Flow | Nutzer | offen |
| Pilot, Messung, Freigabe | Nutzer | offen |

---

## 9. Reihenfolge

1. n8n: `stockDependenceTypeId` = 2, `bestandUeberwachung` = N, `bestandMaxAlterMin` = 120;
   Code-Knoten *Daten holen* ersetzen.
2. Import 22: Zuordnung `bestandsabhaengigkeit` auf *Listing » Bestandsabhängigkeits-ID*.
   **AK1** an einem Buch prüfen, dann an allen.
3. Read-only-Schalter (**L10**), dann SP-API, dann FBA-Block. **AK2** nach dem ersten Stundenlauf.
4. Lager prüfen und anlegen, eBay-Einstellungen, Versandprofil.
5. Flow anlegen — **inaktiv**.
6. Pilot: 5–10 Bücher live. **AK3, AK4**. Dann Flow aktivieren, Testkauf: **AK7 bis AK10**.
7. `bestandUeberwachung` = Y. **AK5, AK6**.
8. **AK11, AK12** auswerten, dann Vollimport der rund 2.000 Bücher.

---

## 10. Offene Punkte

1. **SP-API-Anbindung** — ohne sie sind nur AK1 und die Codetests prüfbar.
2. **Lagertyp von Lager 2** auf "Vertrieb" prüfen (**L3**).
3. **Update bestehender Listings** über Import 22 — unbestätigt; sonst 49 Listings löschen
   und neu anlegen.
4. **Rechnungsumstellung** auf "VCS plentymarkets" mit der PayJoe-Kette abstimmen.
5. **Warenausgang** "Als gebucht markieren" gegen den absoluten FBA-Import gegenprüfen
   (Doppelabbuchung ausschließen).
