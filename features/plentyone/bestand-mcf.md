# Bestandsspiegelung Amazon FBA → eBay + Versand per MCF

**Status:** In Progress
**Tab:** PlentyONE-Migration `/dashboard/plentyone`
**Zugriff:** Admin + Manager
**Quelle:** Recherche 06.09.2026 — PlentyONE-Handbuch + Live-REST-Proben
**Verwandt:** [ebay-vollautomatisierung.md](ebay-vollautomatisierung.md) · Technik: [`docs/ebay-kette-technik.md` §13](../../docs/ebay-kette-technik.md)

## 1. Ziel

Der gesamte physische Bestand (~2.000 Bücher, meist Einzelstücke) liegt bei Amazon FBA.
Drei Dinge sollen ohne Handarbeit laufen:

1. eBay-Mengen folgen dem FBA-Bestand.
2. eBay-Aufträge liefert Amazon per Multi-Channel-Versand (MCF).
3. Verkauft ein Amazon-Kunde, verschwindet das Buch von eBay.

Amazon bleibt für **Preise und Artikeldaten lesend** — der externe Repricer behält die Hoheit.

## 2. Ablauf

```
Amazon-Verkauf → FBA-Bestandsimport (stündlich) → Lager 2 stockNet
   → eBay-Bestandsautomatik (20 min) → „Nicht mehr vorrätig", zurück bei Bestand

eBay-Verkauf → Auftragsimport (stündlich) → Auftrag Lager 2, reservedStock +1
   → Status [5] → Flow → MCF → neutrale Lieferung → Paketnummer (täglich)
```

## 3. Entscheidungen

| Frage | Entscheidung (06.09.2026) |
|---|---|
| SP-API zwischen PlentyONE und Amazon | **ja** — ohne sie gibt es weder FBA-Bestandsimport noch MCF. Amazon bleibt lesend über drei Schalter (Artikelexport Nein, Preis- und Bestandsübertragung „Keine Übertragung") |
| Amazon-Auftragsimport | **an** — Voraussetzung dafür, dass PlentyONE die Rechnungen erstellt. Senkt das Überverkaufsfenster nicht (FBA-Aufträge kommen nur täglich) |
| Überverkaufsfenster ~80 min | akzeptiert, im Pilot messen. Kein Bestandspuffer: Puffer 1 würde bei Einzelstücken jedes Angebot ausblenden |
| Rechnungen | Umstellung auf „VCS plentymarkets" erst nach Abstimmung mit der PayJoe-Kette |

## 4. Akzeptanzkriterien

- **AK1** Jedes Listing steht auf Bestandsabhängigkeit „beschränkt (ohne Reservierung)" (Import 2 / REST 3).
- **AK2** Ein Amazon-Verkauf blendet das eBay-Angebot binnen ~80 Minuten aus.
- **AK3** Kommt Bestand zurück, ist das Angebot wieder kaufbar — mit erhaltenem eBay-Ranking.
- **AK4** Ein eBay-Auftrag erzeugt ohne Handgriff einen MCF-Auftrag bei Amazon; die Paketnummer erreicht eBay.
- **AK5** Der Bericht nennt kaufbare Bücher, Bücher mit Bestand 0 und das Alter des letzten FBA-Imports.
- **AK6** Ein veralteter oder unlesbarer FBA-Bestand macht den Bericht rot — und hält trotzdem kein Buch zurück.
- **AK7** Amazon bleibt für Preise und Artikeldaten unangetastet.

## 5. Edge Cases

| # | Fall | Verhalten |
|---|---|---|
| B1 | Bestand 0 | Normalfall — „Nicht mehr vorrätig", Angebot bleibt sichtbar, Bericht bleibt grün |
| B2 | FBA-Bestandsimport steht | Bericht meldet „FBA-Bestand veraltet"; mit `bestandUeberwachung = Y` rot |
| B3 | Lager-Endpunkt antwortet nicht | melden, nicht filtern — kein Buch gilt als ausverkauft |
| B4 | Leeres FBA-Lager (0 Zeilen) | Import läuft nicht → gemeldet und rot |
| B5 | Überverkauf im 80-min-Fenster | MCF scheitert mangels Bestand → eBay-Auftrag stornieren |
| B6 | Buch nur bei eBay verkauft, Bestand schon weg | wie B5 |
| B7 | Artikelpakete | vom FBA-Bestandsimport ausgeschlossen — bei Büchern unkritisch |

## 6. Offene Punkte

1. **SP-API anbinden** (Nutzer) — danach erst sind die Tests T2–T7 möglich.
2. **Lagertyp von Lager 2** auf „Vertrieb" prüfen.
3. **Update bestehender Listings** über Import 22 (Spalte `bestandsabhaengigkeit`) — unbestätigt; sonst 49 Listings neu anlegen.
4. **`bestandUeberwachung` auf `Y`** stellen, sobald der Pilot läuft.
5. **Rechnungsumstellung** auf „VCS plentymarkets" mit der PayJoe-Kette abstimmen.
