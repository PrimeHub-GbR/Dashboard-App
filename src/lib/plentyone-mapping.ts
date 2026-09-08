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
  A('aktiv', null, 'Amazon-Status: 1 = „Active“, 0 = „Inactive“. NICHT zugeordnet — „Varianten » Aktiv“ wird aus verfuegbarkeit gespeist. Deshalb blieb der Fehler vom 04.09.2026 (Spalte kam durchgehend als 0 an) am Ende folgenlos. Ursache ist seit dem 07.09.2026 bekannt: Der Bericht „zu aktiven Angeboten“ hat gar keine status-Spalte — anders als „zu allen Angeboten“. Der Generator wertet eine fehlende Spalte jetzt als aktiv, weil dieser Bericht per Definition nur aktive Angebote enthält.'),
  A('verfuegbarkeit', 'Varianten » Aktiv', 'Immer 1. ZWEIMAL zuordnen — einmal auf „Varianten » Aktiv“, einmal auf „Varianten » Verfügbarkeit“. Die erste Zuordnung ist die, die zählt: Ohne sie legt der Import die Varianten inaktiv an, und die Market-Listing-Prüfung schlägt fehl.', 'fest', 'Varianten: Aktiv + Verfügbarkeit'),
  A('sku', 'SKU » SKU', 'Gleich der Variantennummer (= Amazon seller-sku). Ohne diesen Datensatz kann Amazon seinen FBA-Bestandsbericht keiner Variante zuordnen — die eBay-Menge bliebe für immer 0.'),
  A('marktplatz_id', 'SKU » Marktplatz-ID', '4 = Amazon (der generische Kanal, wie 2.00 „Ebay“). NICHT 4.01 — damit legt der Import stillschweigend gar keine SKU an, und ohne SKU findet der Amazon-FBA-Bestandsabgleich die Variante nicht: kein Bestand, kein Log-Eintrag, keine Fehlermeldung. Belegt am 07.09.2026.', 'fest'),
  A('account_id', 'SKU » Account-ID', 'Immer 0 — bestätigt an der funktionierenden SKU: Konto „0 – primehubgbr@gmail.com“.', 'fest'),
  A('asin_land', 'ASIN/ePID » Land', 'Immer 1 (Deutschland).', 'fest'),
  A('asin_typ', 'ASIN/ePID » Typ', 'Immer ASIN.', 'fest'),
  A('asin_wert', 'ASIN/ePID » Wert', 'Die ASIN des Listings.'),
  A('barcode_isbn10', 'Barcodes » Code', 'ISBN-10 aus dem Amazon-Feld product-id.', 'amazon', 'Barcode: ISBN'),
  A('barcode_ean', 'Barcodes » Code', 'EAN-13, aus der ISBN-10 berechnet (978-Präfix + neue Prüfziffer).', 'berechnet', 'Barcode: GTIN 13'),
  A('preis', 'Variantenpreise » Preis', 'Aktueller Amazon-Verkaufspreis. Kann unter dem gebundenen Ladenpreis liegen — mit Spalte 39 vergleichen. Zweimal zuordnen: einmal auf Verkaufspreis „Preis“ (ID 1), einmal auf „eBay-Preis“ (ID 8). ID 8 ist das Auffangnetz für Bücher ohne gebundenen Ladenpreis — bei gebundenen Büchern bleibt er wirkungslos, weil Verkaufspreis 7 die niedrigere Position hat.', 'amazon', 'Verkaufspreis: Preis + eBay-Preis'),
  A('standardkategorie_id', 'Kategorien » ID der Kategorie', '77 = Kategorie „Books".', 'fest'),
  A('zustand', 'Artikel » Zustand', '0 = neu.', 'fest'),
  A('zustand_api', 'Artikel » Zustand API', '0 = neu.', 'fest'),
  A('fba_versand_durch_amazon', 'Artikel » Versand durch Amazon (FBA)', 'Immer 1 — Verkauf läuft ausschließlich über FBA. Setzt REST `isShippableByAmazon`; der Multichannel-Flow filtert darauf, bevor er einen eBay-Auftrag zur Lieferung an Amazon gibt.', 'fest'),
  A('fba_abwicklung', 'Artikel » Amazon-Abwicklung (FBA)', 'Immer 1. Setzt REST `amazonFbaPlatform` — Voraussetzung dafür, dass PlentyONE den FBA-Bestand des Artikels importiert.', 'fest'),
  A('wb_beschraenkung', 'Varianten » WB-Beschränkung', 'Immer 1 — die Variante wird nur verkauft, solange Bestand da ist (REST `stockLimitation`). Ohne das griffe die eBay-Bestandsautomatik nicht.', 'fest'),
  A('hauptlager_id', 'Varianten » Hauptlager', '2 = Amazon FBA-Lager BuchDepot24 (Logistiktyp Amazon). Dorthin importiert PlentyONE stündlich den FBA-Bestand, daraus speist sich die eBay-Menge, und darauf filtert der Multichannel-Flow über die Lager-ID des Auftrags.', 'fest'),
  A('amazon_produkttyp', 'Artikel » Amazon-Produkttyp', 'Immer PRODUCT.', 'fest'),
  A('umsatzsteuer', 'Varianten » Umsatzsteuer', 'Pauschal 7 %. Bei Nonbook-Artikeln prüfen — siehe Spalte 58.', 'fest'),
  A('mandant_aktiv', 'Mandant (Shop) » Aktiv', 'Immer 1. Zugeordnet mit Auswahl „Shops“. Für die Marktplätze ist das nicht nötig — belegt an Variante 1175: Mandant (Shop) stand auf AUS und das eBay-Listing funktionierte trotzdem. Schadet aber nicht und hält die Artikel im Mandanten sichtbar.', 'fest', 'Auswahl: Shops'),
  A('markt_aktiv', 'Märkte » Aktiv', 'Immer 1. ZWEIMAL zuordnen — einmal Markt „Ebay", einmal „eBay Germany". Damit entfällt die Gruppenfunktion nach jedem Artikelimport. Keinesfalls „Amazon FBA Germany" wählen: Amazon ist ausdrücklich nur lesend, eine Freigabe würde PlentyONE dorthin exportieren lassen.', 'fest', 'Märkte: Ebay + eBay Germany'),
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
  { spalte: 'vlb_verlag', zielfeld: null, herkunft: 'vlb', block: 'C', zusatz: '→ Hersteller-Import',
    beschreibung: 'Verlagsname (Imprint) — speist die Hersteller-Datei. NICHT auf „Artikel » Hersteller-ID“ mappen: das Feld ist numerisch und lehnt den Namen ab. Dafür gibt es die Spalte hersteller_id.' },
  { spalte: 'vlb_erscheinungsdatum', zielfeld: null, herkunft: 'vlb', block: 'C', zusatz: '→ Eigenschaften-Import, ID 11',
    beschreibung: 'Erscheinungsdatum als JJJJ-MM-TT. Bei unvollständigen VLB-Angaben auf Monats- bzw. Jahresanfang gesetzt.' },
  { spalte: 'vlb_sprache', zielfeld: null, herkunft: 'vlb', block: 'C', zusatz: 'Klartext, nur zum Lesen',
    beschreibung: 'Textsprache im Klartext. Importiert wird stattdessen die Auswahl-ID aus Spalte 45.' },
  { spalte: 'vlb_seitenzahl', zielfeld: null, herkunft: 'vlb', block: 'C', zusatz: '→ Eigenschaften-Import, ID 13',
    beschreibung: 'Anzahl nummerierter Seiten.' },
  { spalte: 'vlb_bindung', zielfeld: null, herkunft: 'vlb', block: 'C', zusatz: 'Klartext, nur zum Lesen',
    beschreibung: 'Einbandart im Klartext, aus der ONIX-Produktform abgeleitet. Importiert wird die Auswahl-ID aus Spalte 46.' },
  { spalte: 'vlb_beschreibung', zielfeld: 'Artikelbeschreibung » Artikeltext', herkunft: 'vlb', block: 'C', zusatz: 'Sprache: Deutsch',
    beschreibung: 'Verlagsbeschreibung, nach Textart priorisiert. Enthält HTML-Formatierung. Inhaltsverzeichnis, Leseprobe und Rezensionszitate sind ausgeschlossen. Nicht auf „Meta-Beschreibung" mappen — das ist das SEO-Feld.' },
  { spalte: 'vlb_bpb_preis', zielfeld: 'Variantenpreise » Preis', herkunft: 'vlb', block: 'C', zusatz: 'Verkaufspreis: Buchpreisbindung',
    beschreibung: 'Gebundener Ladenpreis Deutschland. Nur gesetzt, wenn es ein fester Preis ohne ca.-Kennzeichnung ist. Position 2 — schlägt damit auf eBay den Auffang-Preis aus Spalte 15.' },
  { spalte: 'vlb_gewicht_g', zielfeld: 'Varianten » Gewicht brutto g', herkunft: 'vlb', block: 'C',
    beschreibung: 'Gewicht in Gramm. Fehlt die VLB-Angabe, stehen pauschal 1.000 g drin — erkennbar an Spalte 44.' },
  { spalte: 'vlb_breite_mm', zielfeld: 'Varianten » Breite mm', herkunft: 'vlb', block: 'C', beschreibung: 'Breite in Millimetern.' },
  { spalte: 'vlb_hoehe_mm', zielfeld: 'Varianten » Höhe mm', herkunft: 'vlb', block: 'C', beschreibung: 'Höhe in Millimetern.' },
  { spalte: 'vlb_dicke_mm', zielfeld: 'Varianten » Länge mm', herkunft: 'vlb', block: 'C',
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
  { spalte: 'hersteller_id', zielfeld: 'Artikel » Hersteller-ID', herkunft: 'fest', block: 'C',
    beschreibung: 'Die numerische ID des Verlags aus PlentyONE. Nachgeschlagen aus der Liste, die der eBay-Bericht pflegt — vergeben werden die IDs von PlentyONE selbst. Leer, solange der Verlag dort noch nicht angelegt ist; dann erst Hersteller importieren und einmal den Bericht laufen lassen.' },
]

export const HERSTELLER_IMPORT = {
  datei: 'plentyONE_Hersteller.csv',
  hinweis:
    'PlentyONE fu\u0308hrt Hersteller als eigene Stammdaten mit eigenem Import-Typ. Der Artikelimport kann sie nur referenzieren, nicht anlegen \u2014 deshalb muss dieser Import VOR dem Artikelimport laufen. Ein Feld fu\u0308r die Hersteller-ID gibt es nicht; PlentyONE vergibt sie selbst. Abgleich u\u0308ber \u201eName \u2192 Herstellername\u201c, dann werden bestehende Verlage aktualisiert statt verdoppelt.',
  mapping: [
    { spalte: 'name', zielfeld: 'Hersteller \u00bb Name', beschreibung: 'Das Imprint \u2014 die Marke, die eBay anzeigt. \u201eFISCHER Scherz\u201c, nicht der Konzern.' },
    { spalte: 'firmenname', zielfeld: 'Hersteller \u00bb Firmenname', beschreibung: 'Der rechtliche Tr\u00e4ger, den Art. 19 GPSR verlangt \u2014 \u201eS. Fischer Verlag GmbH\u201c. Weicht bei jedem Verlag vom Namen ab.' },
    { spalte: 'strasse', zielfeld: 'Hersteller \u00bb Stra\u00dfe', beschreibung: 'Ohne Hausnummer \u2014 PlentyONE f\u00fchrt beide getrennt.' },
    { spalte: 'hausnummer', zielfeld: 'Hersteller \u00bb Haus-Nr.', beschreibung: 'Abgetrennt, auch \u201e14-20\u201c. Fehlt die Zuordnung, bleibt die Anschrift unvollst\u00e4ndig.' },
    { spalte: 'plz', zielfeld: 'Hersteller \u00bb PLZ', beschreibung: 'Postleitzahl der Herstelleranschrift.' },
    { spalte: 'ort', zielfeld: 'Hersteller \u00bb Ort', beschreibung: 'Ort der Herstelleranschrift.' },
    { spalte: 'land_id', zielfeld: 'Hersteller \u00bb Land', beschreibung: 'Die Zahl, nicht der ISO-Code: 1 = Deutschland, 2 = \u00d6sterreich, 4 = Schweiz. Mit \u201eDE\u201c bricht der Import ab.' },
    { spalte: 'email', zielfeld: 'Hersteller \u00bb E-Mail', beschreibung: 'Produktsicherheitskontakt aus dem VLB.' },
    { spalte: 'eu_name', zielfeld: 'Hersteller \u00bb EU-Verantwortlicher Name', beschreibung: 'Sitzt der Verlag in der EU, steht hier er selbst \u2014 er ist dann die verantwortliche Person nach Art. 16.' },
    { spalte: 'eu_strasse', zielfeld: 'Hersteller \u00bb EU-Verantwortlicher Stra\u00dfe', beschreibung: 'Ohne Hausnummer.' },
    { spalte: 'eu_hausnummer', zielfeld: 'Hersteller \u00bb EU-Verantwortlicher Haus-Nr.', beschreibung: 'Abgetrennt wie oben.' },
    { spalte: 'eu_plz', zielfeld: 'Hersteller \u00bb EU-Verantwortlicher PLZ', beschreibung: 'Postleitzahl der verantwortlichen Person.' },
    { spalte: 'eu_ort', zielfeld: 'Hersteller \u00bb EU-Verantwortlicher Ort', beschreibung: 'Ort der verantwortlichen Person.' },
    { spalte: 'eu_email', zielfeld: 'Hersteller \u00bb EU-Verantwortlicher Email', beschreibung: 'E-Mail der verantwortlichen Person.' },
    { spalte: 'eu_land_iso', zielfeld: 'Hersteller \u00bb EU-Verantwortlicher Land (ISO-Code)', beschreibung: 'Hier der Code \u2014 \u201eDE\u201c. Anders als beim Hersteller oben.' },
    { spalte: 'eu_land_id', zielfeld: 'Hersteller \u00bb EU-Verantwortlicher Land', beschreibung: 'Und daneben die Zahl. PlentyONE f\u00fchrt beide Felder; land_id geh\u00f6rt NICHT hierher.' },
  ],
  eu: 'Der EU-Block ist immer gef\u00fcllt. Sitzt der Verlag in der EU, mit seinen eigenen Daten \u2014 er ist dann selbst die verantwortliche Person, und ein leeres Feld hie\u00dfe f\u00fcr den Marktplatz \u201ekeine benannt\u201c. Nur wo der Verlag au\u00dferhalb sitzt, steht dort ein echter Bevollm\u00e4chtigter: Diogenes (Z\u00fcrich) wird von der truepages UG in M\u00fcnchen vertreten.',
}

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

/**
 * Einmalige Einrichtung in PlentyONE. Danach holt PlentyONE alles selbst per
 * Zeitplan ab — je Lauf bleibt nur noch der Upload oben auf dieser Seite.
 */
export const IMPORT_SCHRITTE = [
  {
    titel: 'Cover hochladen',
    text: 'ZIP-Pakete entpacken und alle .jpg in Shop » Dateimanager » Ordner „cover" hochladen. Dateinamen nicht ändern — die Bild-URL in Spalte 28 zeigt genau darauf. Fällt weg, sobald die VLB die Cover-Nutzung für Marktplätze freigegeben hat und die Bilder direkt per URL kommen.',
  },
  {
    titel: 'Hersteller anlegen',
    text: 'plentyONE_Hersteller.csv oben herunterladen und als Import-Typ „Hersteller“ importieren — die 16 Zuordnungen stehen in der Tabelle unten. Muss VOR dem Artikelimport laufen: erst danach lässt sich Spalte 33 auf die Hersteller-ID mappen. Ohne Hersteller bleibt das Feld leer — und ohne Herstellerangabe darf nach Art. 19 GPSR kein Angebot online.',
  },
  {
    titel: 'Artikelimport anlegen und auf URL umstellen',
    text: 'Daten » Import, Kopie von „Amazon Import 3.0". Trennzeichen ;, UTF-8, Abgleich über Variantennr. Mapping nach der Tabelle unten — die Spalten stehen in der Reihenfolge der Datei. Zeilenreihenfolge der CSV nicht verändern: die Hauptvariante muss vor ihren Geschwistervarianten stehen. Datenquelle danach auf „HTTPS / URL" umstellen (Adresse siehe Abschnitt 5).',
  },
  {
    titel: 'Eigenschaftsimport anlegen und auf URL umstellen',
    text: 'Zweiter Import mit plentyONE_Eigenschaften.csv, ebenfalls Abgleich über Variantennr. Sieben Mappings, siehe eigener Abschnitt unten. Auch hier Datenquelle „HTTPS / URL".',
  },
  {
    titel: 'Erst mit wenigen Zeilen testen',
    text: 'Zeitplan zuletzt setzen. Prüfen: entsteht ein Artikel mit mehreren Varianten oder mehrere Artikel? Kommen Sprache und Bindung als Auswahlwert an?',
  },
]
