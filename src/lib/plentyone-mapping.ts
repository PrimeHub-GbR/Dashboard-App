/**
 * Mapping-Tabelle für den PlentyONE-Import.
 *
 * Die Liste steht in **exakter Reihenfolge der CSV-Spalten** — `csvSpalte` ist der
 * Array-Index + 1. Damit lässt sich die Datei im Import von oben nach unten abarbeiten,
 * ohne zu suchen. Ändert sich der Header im Workflow, muss diese Liste mitgezogen werden.
 *
 * Abgleichschlüssel des Imports ist die Variantennr.
 */

export type Herkunft = 'amazon' | 'vlb' | 'berechnet' | 'fest'
export type Block = 'A' | 'B' | 'C' | 'D'

export interface MappingZeile {
  spalte: string
  /** null = wird im Artikelimport nicht gemappt */
  zielfeld: string | null
  zusatz?: string
  herkunft: Herkunft
  block: Block
  beschreibung: string
}

export const HERKUNFT_LABEL: Record<Herkunft, string> = {
  amazon: 'Amazon-Report',
  vlb: 'VLB',
  berechnet: 'berechnet',
  fest: 'Festwert',
}

export const BLOCK_LABEL: Record<Block, string> = {
  A: 'Amazon-Grunddaten',
  B: 'Bild',
  C: 'VLB-Daten',
  D: 'Hilfsspalte',
}

const A = (spalte: string, zielfeld: string | null, beschreibung: string,
           herkunft: Herkunft = 'amazon', zusatz?: string): MappingZeile =>
  ({ spalte, zielfeld, beschreibung, herkunft, zusatz, block: 'A' })

/** In exakter Dateireihenfolge. Nicht umsortieren. */
export const MAPPING_SPALTEN: MappingZeile[] = [
  // ---------------------------------------------------------- Block A (1–27)
  A('variantennummer', 'Varianten » Variantennr.', 'Amazon seller-sku. Abgleichschlüssel des Imports — muss eindeutig sein.'),
  A('hauptvariante_nr', 'Varianten » Nummer der Hauptvariante', 'Bündelt mehrere Amazon-SKUs desselben Buchs zu einem Artikel. Leer = diese Zeile ist selbst die Hauptvariante.', 'berechnet'),
  A('artikelname', 'Artikelbeschreibung » Name', 'Amazon-Titel, bereinigt: Format- und Datumsklammern sowie der angehängte Autor sind entfernt.', 'berechnet', 'Sprache: Deutsch'),
  A('aktiv', 'Varianten » Aktiv', '1 = Amazon-Status „Active", 0 = „Inactive".'),
  A('verfuegbarkeit', 'Varianten » Verfügbarkeit', 'Immer 1.', 'fest'),
  A('sku', 'SKU » SKU', 'Gleich der Variantennummer.'),
  A('marktplatz_id', 'SKU » Marktplatz-ID', '4.01 = Amazon Deutschland.', 'fest'),
  A('account_id', 'SKU » Account-ID', 'Immer 0.', 'fest'),
  A('asin_land', 'ASIN/ePID » Land', 'Immer 1 (Deutschland).', 'fest'),
  A('asin_typ', 'ASIN/ePID » Typ', 'Immer ASIN.', 'fest'),
  A('asin_wert', 'ASIN/ePID » Wert', 'Die ASIN des Listings.'),
  A('barcode_isbn10', 'Barcodes » Code', 'ISBN-10 aus dem Amazon-Feld product-id.', 'amazon', 'Barcode: ISBN'),
  A('barcode_ean', 'Barcodes » Code', 'EAN-13, aus der ISBN-10 berechnet (978-Präfix + neue Prüfziffer).', 'berechnet', 'Barcode: GTIN 13'),
  A('preis', 'Variantenpreise » Preis', 'Aktueller Amazon-Verkaufspreis. Kann unter dem gebundenen Ladenpreis liegen — mit Spalte 39 vergleichen.', 'amazon', 'Verkaufspreis: Preis'),
  A('standardkategorie_id', 'Kategorien » ID der Kategorie', '77 = Kategorie „Books".', 'fest'),
  A('zustand', 'Artikel » Zustand', '0 = neu.', 'fest'),
  A('zustand_api', 'Artikel » Zustand API', '0 = neu.', 'fest'),
  A('fba_versand_durch_amazon', 'Artikel » Versand durch Amazon (FBA)', 'Immer 1 — Verkauf läuft ausschließlich über FBA.', 'fest'),
  A('fba_abwicklung', 'Artikel » Amazon-Abwicklung (FBA)', 'Immer 1.', 'fest'),
  A('wb_beschraenkung', 'Varianten » WB-Beschränkung', 'Immer 1.', 'fest'),
  A('hauptlager_id', 'Varianten » Hauptlager', '2 = Amazon FBA-Lager BuchDepot24.', 'fest'),
  A('amazon_produkttyp', 'Artikel » Amazon-Produkttyp', 'Immer PRODUCT.', 'fest'),
  A('umsatzsteuer', 'Varianten » Umsatzsteuer', 'Pauschal 7 %. Bei Nonbook-Artikeln prüfen — siehe Spalte 58.', 'fest'),
  A('mandant_aktiv', 'Mandant (Shop) » Aktiv', 'Immer 1.', 'fest', 'Shop wählen'),
  A('markt_aktiv', 'Märkte » Aktiv', 'Immer 1.', 'fest', 'Auftragsherkunft: Amazon FBA Germany'),
  A('listing_id', 'Artikel » Feld 1', 'Amazon listing-id, zur Rückverfolgung.'),
  A('open_date', 'Artikel » Feld 2', 'Anlagedatum des Listings, umgebaut auf TT.MM.JJJJ HH:MM:SS.', 'berechnet'),

  // ---------------------------------------------------------------- Block B (28)
  { spalte: 'bild_multi_url', zielfeld: 'Artikelbilder » Multi-Url (Kommasepariert)', herkunft: 'berechnet', block: 'B',
    beschreibung: 'Zeigt auf cdn02.plentyone.com/…/cover/<ISBN13>.jpg. Setzt voraus, dass die Cover-ZIPs in den Dateimanager-Ordner „cover" entpackt wurden.' },

  // -------------------------------------------------------- Amazon-Rückfall (29–31)
  { spalte: 'amazon_autor', zielfeld: null, herkunft: 'berechnet', block: 'D',
    beschreibung: 'Autor, aus dem Amazon-Titel gelesen. Rückfallebene, falls die VLB keinen liefert — steht bereits in Spalte 32.' },
  { spalte: 'amazon_bindung', zielfeld: null, herkunft: 'berechnet', block: 'D',
    beschreibung: 'Einbandart aus dem Amazon-Titel. Rückfallebene für Spalte 37.' },
  { spalte: 'amazon_erscheinungsdatum', zielfeld: null, herkunft: 'berechnet', block: 'D',
    beschreibung: 'Erscheinungsdatum aus dem Amazon-Titel. Rückfallebene für Spalte 34.' },

  // ---------------------------------------------------------------- Block C (32–50)
  { spalte: 'vlb_autor', zielfeld: null, herkunft: 'vlb', block: 'C', zusatz: '→ Eigenschaften-Import, ID 10',
    beschreibung: 'Autoren als „Nachname, Vorname", mehrere mit Semikolon getrennt.' },
  { spalte: 'vlb_verlag', zielfeld: 'Artikel » Hersteller-ID', herkunft: 'vlb', block: 'C', zusatz: 'erst nach dem Hersteller-Import',
    beschreibung: 'Verlagsname. Kaufland verlangt ihn als „manufacturer", eBay als „Marke". Solange keine Hersteller angelegt sind: Zeile ausschalten.' },
  { spalte: 'vlb_erscheinungsdatum', zielfeld: null, herkunft: 'vlb', block: 'C', zusatz: '→ Eigenschaften-Import, ID 11',
    beschreibung: 'Erscheinungsdatum als JJJJ-MM-TT. Bei unvollständigen VLB-Angaben auf Monats- bzw. Jahresanfang gesetzt.' },
  { spalte: 'vlb_sprache', zielfeld: null, herkunft: 'vlb', block: 'C', zusatz: 'Klartext, nur zum Lesen',
    beschreibung: 'Textsprache im Klartext. Importiert wird stattdessen die Auswahl-ID aus Spalte 45.' },
  { spalte: 'vlb_seitenzahl', zielfeld: null, herkunft: 'vlb', block: 'C', zusatz: '→ Eigenschaften-Import, ID 13',
    beschreibung: 'Anzahl nummerierter Seiten.' },
  { spalte: 'vlb_bindung', zielfeld: null, herkunft: 'vlb', block: 'C', zusatz: 'Klartext, nur zum Lesen',
    beschreibung: 'Einbandart im Klartext, aus der ONIX-Produktform abgeleitet. Importiert wird die Auswahl-ID aus Spalte 46.' },
  { spalte: 'vlb_beschreibung', zielfeld: 'Artikelbeschreibung » Beschreibung', herkunft: 'vlb', block: 'C', zusatz: 'Sprache: Deutsch',
    beschreibung: 'Verlagsbeschreibung, nach Textart priorisiert. Enthält HTML-Formatierung. Inhaltsverzeichnis, Leseprobe und Rezensionszitate sind ausgeschlossen. Nicht auf „Meta-Beschreibung" mappen — das ist das SEO-Feld.' },
  { spalte: 'vlb_bpb_preis', zielfeld: 'Variantenpreise » Preis', herkunft: 'vlb', block: 'C', zusatz: 'Verkaufspreis: Buchpreisbindung',
    beschreibung: 'Gebundener Ladenpreis Deutschland. Nur gesetzt, wenn es ein fester Preis ohne ca.-Kennzeichnung ist.' },
  { spalte: 'vlb_gewicht_g', zielfeld: 'Varianten » Bruttogewicht', herkunft: 'vlb', block: 'C',
    beschreibung: 'Gewicht in Gramm. Fehlt die VLB-Angabe, stehen pauschal 1.000 g drin — erkennbar an Spalte 44.' },
  { spalte: 'vlb_breite_mm', zielfeld: 'Varianten » Breite', herkunft: 'vlb', block: 'C', beschreibung: 'Breite in Millimetern.' },
  { spalte: 'vlb_hoehe_mm', zielfeld: 'Varianten » Höhe', herkunft: 'vlb', block: 'C', beschreibung: 'Höhe in Millimetern.' },
  { spalte: 'vlb_dicke_mm', zielfeld: 'Varianten » Länge', herkunft: 'vlb', block: 'C',
    beschreibung: 'Dicke des Buchrückens in Millimetern. Von den Verlagen nur teilweise gepflegt.' },
  { spalte: 'vlb_gewicht_geschaetzt', zielfeld: null, herkunft: 'berechnet', block: 'D',
    beschreibung: '1 = das Gewicht in Spalte 40 ist die 1-kg-Pauschale, nicht der echte Wert. Wichtig für die Versandkalkulation.' },
  { spalte: 'vlb_sprache_id', zielfeld: null, herkunft: 'berechnet', block: 'C', zusatz: '→ Eigenschaften-Import, ID 12',
    beschreibung: 'PlentyONE-Auswahlwert-ID der Sprache: 11 Deutsch · 12 Englisch · 19 Französisch · 20 Italienisch · 21 Spanisch.' },
  { spalte: 'vlb_bindung_id', zielfeld: null, herkunft: 'berechnet', block: 'C', zusatz: '→ Eigenschaften-Import, ID 14',
    beschreibung: 'PlentyONE-Auswahlwert-ID der Bindung: 15 Taschenbuch · 16 Gebunden · 17 Broschiert · 22 Pappbilderbuch · 23 Flexibler Einband · 24 Kalender · 25 Spiralbindung · 26 Audio-CD · 27 Karten · 28 Spielzeug.' },
  { spalte: 'vlb_warengruppe', zielfeld: null, herkunft: 'vlb', block: 'C', zusatz: '→ Eigenschaften-Import, ID 15',
    beschreibung: 'WGS-Code des deutschen Buchhandels, z. B. 2112. Grundlage für die Kategoriezuordnung bei Kaufland und eBay.' },
  { spalte: 'vlb_warengruppe_text', zielfeld: null, herkunft: 'vlb', block: 'D',
    beschreibung: 'Klartext zum WGS-Code, z. B. „Hardcover, Softcover / Sachbücher / Gesellschaft". Nur zum Lesen.' },
  { spalte: 'vlb_thema', zielfeld: null, herkunft: 'vlb', block: 'D',
    beschreibung: 'Alle Thema-Codes des Titels, kommagetrennt. Nur zum Lesen — importiert wird das Hauptthema aus Spalte 50.' },
  { spalte: 'vlb_thema_haupt', zielfeld: null, herkunft: 'vlb', block: 'C', zusatz: '→ Eigenschaften-Import, ID 16',
    beschreibung: 'Das von der VLB als Hauptthema markierte Thema. Ein Code — genau das, was die Kategoriezuordnung braucht.' },

  // ---------------------------------------------------------------- GPSR (51–56)
  { spalte: 'gpsr_firma', zielfeld: null, herkunft: 'vlb', block: 'D', zusatz: '→ Hersteller-Import',
    beschreibung: 'Hersteller bzw. verantwortliche Person nach EU-Produktsicherheitsverordnung. Pflicht bei Kaufland und eBay. Gehört an den Hersteller, nicht an den Artikel.' },
  { spalte: 'gpsr_strasse', zielfeld: null, herkunft: 'vlb', block: 'D', zusatz: '→ Hersteller-Import', beschreibung: 'Straße und Hausnummer des GPSR-Kontakts.' },
  { spalte: 'gpsr_plz', zielfeld: null, herkunft: 'vlb', block: 'D', zusatz: '→ Hersteller-Import', beschreibung: 'Postleitzahl des GPSR-Kontakts.' },
  { spalte: 'gpsr_ort', zielfeld: null, herkunft: 'vlb', block: 'D', zusatz: '→ Hersteller-Import', beschreibung: 'Ort des GPSR-Kontakts.' },
  { spalte: 'gpsr_land', zielfeld: null, herkunft: 'vlb', block: 'D', zusatz: '→ Hersteller-Import', beschreibung: 'Ländercode des GPSR-Kontakts, meist DE.' },
  { spalte: 'gpsr_mail', zielfeld: null, herkunft: 'vlb', block: 'D', zusatz: '→ Hersteller-Import',
    beschreibung: 'Kontaktadresse für Produktsicherheit. Viele Verlage pflegen dafür eine eigene produktsicherheit@-Adresse.' },

  // ------------------------------------------------------------ Kontrolle (57–59)
  { spalte: 'vlb_cover_url', zielfeld: null, herkunft: 'vlb', block: 'D',
    beschreibung: 'Nur gesetzt, wenn die VLB überhaupt ein Cover hat. Leer = für diese ISBN gibt es kein Bild.' },
  { spalte: 'vlb_ust_satz', zielfeld: null, herkunft: 'vlb', block: 'D',
    beschreibung: 'Steuersatz aus dem VLB-Preis. Steht hier 19, ist der pauschale Wert 7 in Spalte 23 falsch.' },
  { spalte: 'vlb_status', zielfeld: null, herkunft: 'vlb', block: 'D',
    beschreibung: 'OK oder KEIN_TREFFER — zeigt, ob die VLB einen Datensatz zur ISBN hat.' },
]

/** Zweiter Import: Eigenschaften. Eine Zeile je Artikel und Eigenschaft. */
export const EIGENSCHAFTEN_IMPORT = {
  datei: 'plentyONE_Eigenschaften.csv',
  hinweis:
    'PlentyONE transportiert je Import-Zeile genau eine Eigenschaft. Mehrere Spalten auf „Eigenschaften » Wert" zu mappen wird mit „Das PlentyONE Feld kann nur einmal zugeordnet werden" abgelehnt. Deshalb eine eigene Datei mit einem eigenen Import — sechs Mappings, einmal gesetzt.',
  mapping: [
    { spalte: 'variantennummer', zielfeld: 'Varianten » Variantennr.', beschreibung: 'Abgleichschlüssel — verbindet die Zeile mit dem Artikel.' },
    { spalte: 'gruppen_id', zielfeld: 'Eigenschaften » Gruppen-ID', beschreibung: 'Immer 7 = Gruppe „VLB Buchdaten".' },
    { spalte: 'eigenschaft_id', zielfeld: 'Eigenschaften » ID', beschreibung: 'Welche Eigenschaft gemeint ist: 10–16.' },
    { spalte: 'wert', zielfeld: 'Eigenschaften » Wert', beschreibung: 'Für Text-, Zahl- und Datums-Eigenschaften. Bei Auswahl-Eigenschaften leer.' },
    { spalte: 'auswahl_id', zielfeld: 'Eigenschaften » Eigenschaften-Auswahl-ID', beschreibung: 'Für Sprache und Bindung. Bei allen anderen leer.' },
    { spalte: 'sprache', zielfeld: 'Eigenschaften » Sprache', beschreibung: 'Immer „de".' },
  ],
  nichtGemappt: 'eigenschaft_name',
  eigenschaften: [
    { id: 10, name: 'Autor', typ: 'Text', quelle: 'vlb_autor', ziel: 'wert' },
    { id: 11, name: 'Erscheinungsdatum', typ: 'Datum', quelle: 'vlb_erscheinungsdatum', ziel: 'wert' },
    { id: 12, name: 'Sprache', typ: 'Auswahl', quelle: 'vlb_sprache_id', ziel: 'auswahl_id' },
    { id: 13, name: 'Seitenzahl', typ: 'Ganze Zahl', quelle: 'vlb_seitenzahl', ziel: 'wert' },
    { id: 14, name: 'Bindung', typ: 'Auswahl', quelle: 'vlb_bindung_id', ziel: 'auswahl_id' },
    { id: 15, name: 'Warengruppe', typ: 'Text', quelle: 'vlb_warengruppe', ziel: 'wert' },
    { id: 16, name: 'Thema', typ: 'Text', quelle: 'vlb_thema_haupt', ziel: 'wert' },
  ],
}

/** Reihenfolge der Schritte in PlentyONE. */
export const IMPORT_SCHRITTE = [
  {
    titel: 'Cover hochladen',
    text: 'ZIP-Pakete entpacken und alle .jpg in Shop » Dateimanager » Ordner „cover" hochladen. Dateinamen nicht ändern — die Bild-URL in Spalte 28 zeigt genau darauf.',
  },
  {
    titel: 'Hersteller anlegen',
    text: 'Aus der Artikel-CSV die Spalten vlb_verlag und gpsr_* ziehen und als Import-Typ „Hersteller" anlegen. Erst danach lässt sich Spalte 33 auf die Hersteller-ID mappen. Ohne Hersteller lehnen Kaufland und eBay die Artikel ab.',
  },
  {
    titel: 'Artikel importieren',
    text: 'Daten » Import, Kopie von „Amazon Import 3.0". Trennzeichen ;, UTF-8, Abgleich über Variantennr. Mapping nach der Tabelle unten — die Spalten stehen in der Reihenfolge der Datei. Zeilenreihenfolge der CSV nicht verändern: die Hauptvariante muss vor ihren Geschwistervarianten stehen.',
  },
  {
    titel: 'Eigenschaften importieren',
    text: 'Zweiter Import mit plentyONE_Eigenschaften.csv, ebenfalls Abgleich über Variantennr. Sechs Mappings, siehe eigener Abschnitt unten.',
  },
  {
    titel: 'Erst mit wenigen Zeilen testen',
    text: 'Import-Intervall zuletzt setzen. Prüfen: entsteht ein Artikel mit mehreren Varianten oder mehrere Artikel? Kommen Sprache und Bindung als Auswahlwert an?',
  },
]
