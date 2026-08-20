/**
 * Mapping-Tabelle für den PlentyONE-Import "Amazon Import 4.0 VLB+Bilder".
 *
 * Bewusst als Code und nicht in der Datenbank: die Tabelle gehört zur CSV-Struktur,
 * die der N8N-Workflow erzeugt. Beide ändern sich zusammen — so kann das Mapping
 * nicht von der tatsächlichen Datei abweichen.
 *
 * Abgleichschlüssel des Imports ist die Variantennr.
 */

export type Herkunft = 'amazon' | 'vlb' | 'berechnet' | 'fest'

export interface MappingZeile {
  /** Laufende Nummer im PlentyONE-Import. Null = wird nicht importiert. */
  nr: number | null
  spalte: string
  zielfeld: string | null
  zusatz?: string
  herkunft: Herkunft
  /** Klartext: was steht in dieser Spalte? */
  beschreibung: string
}

export interface MappingBlock {
  key: string
  titel: string
  hinweis?: string
  zeilen: MappingZeile[]
}

export const HERKUNFT_LABEL: Record<Herkunft, string> = {
  amazon: 'Amazon-Report',
  vlb: 'VLB',
  berechnet: 'berechnet',
  fest: 'Festwert',
}

export const MAPPING_BLOECKE: MappingBlock[] = [
  {
    key: 'a',
    titel: 'Block A — Amazon-Grunddaten',
    hinweis:
      'Unverändert aus dem bereits funktionierenden Import „Amazon Import 3.0". Alle Zeilen auf Import = AN.',
    zeilen: [
      { nr: 1, spalte: 'variantennummer', zielfeld: 'Varianten » Variantennr.', herkunft: 'amazon', beschreibung: 'Amazon seller-sku. Abgleichschlüssel des Imports — muss eindeutig sein.' },
      { nr: 2, spalte: 'hauptvariante_nr', zielfeld: 'Varianten » Nummer der Hauptvariante', herkunft: 'berechnet', beschreibung: 'Bündelt mehrere Amazon-SKUs desselben Buchs zu einem Artikel. Leer = diese Zeile ist selbst die Hauptvariante.' },
      { nr: 3, spalte: 'artikelname', zielfeld: 'Artikelbeschreibung » Name', zusatz: 'Sprache: Deutsch', herkunft: 'berechnet', beschreibung: 'Amazon-Titel, bereinigt: Format- und Datumsklammern sowie der angehängte Autor sind entfernt.' },
      { nr: 4, spalte: 'aktiv', zielfeld: 'Varianten » Aktiv', herkunft: 'amazon', beschreibung: '1 = Amazon-Status „Active", 0 = „Inactive".' },
      { nr: 5, spalte: 'verfuegbarkeit', zielfeld: 'Varianten » Verfügbarkeit', herkunft: 'fest', beschreibung: 'Immer 1.' },
      { nr: 6, spalte: 'sku', zielfeld: 'SKU » SKU', herkunft: 'amazon', beschreibung: 'Gleich der Variantennummer.' },
      { nr: 7, spalte: 'marktplatz_id', zielfeld: 'SKU » Marktplatz-ID', herkunft: 'fest', beschreibung: '4.01 = Amazon Deutschland.' },
      { nr: 8, spalte: 'account_id', zielfeld: 'SKU » Account-ID', herkunft: 'fest', beschreibung: 'Immer 0.' },
      { nr: 9, spalte: 'asin_land', zielfeld: 'ASIN/ePID » Land', herkunft: 'fest', beschreibung: 'Immer 1 (Deutschland).' },
      { nr: 10, spalte: 'asin_typ', zielfeld: 'ASIN/ePID » Typ', herkunft: 'fest', beschreibung: 'Immer ASIN.' },
      { nr: 11, spalte: 'asin_wert', zielfeld: 'ASIN/ePID » Wert', herkunft: 'amazon', beschreibung: 'Die ASIN des Listings.' },
      { nr: 12, spalte: 'barcode_isbn10', zielfeld: 'Barcodes » Code', zusatz: 'Barcode: ISBN', herkunft: 'amazon', beschreibung: 'ISBN-10 aus dem Amazon-Feld product-id.' },
      { nr: 13, spalte: 'barcode_ean', zielfeld: 'Barcodes » Code', zusatz: 'Barcode: GTIN 13', herkunft: 'berechnet', beschreibung: 'EAN-13, aus der ISBN-10 berechnet (978-Präfix + neue Prüfziffer).' },
      { nr: 14, spalte: 'preis', zielfeld: 'Variantenpreise » Preis', zusatz: 'Verkaufspreis: Preis', herkunft: 'amazon', beschreibung: 'Aktueller Amazon-Verkaufspreis. Kann unter dem gebundenen Ladenpreis liegen — vergleichen!' },
      { nr: 15, spalte: 'standardkategorie_id', zielfeld: 'Kategorien » ID der Kategorie', herkunft: 'fest', beschreibung: '77 = Kategorie „Books".' },
      { nr: 16, spalte: 'zustand', zielfeld: 'Artikel » Zustand', herkunft: 'fest', beschreibung: '0 = neu.' },
      { nr: 17, spalte: 'zustand_api', zielfeld: 'Artikel » Zustand API', herkunft: 'fest', beschreibung: '0 = neu.' },
      { nr: 18, spalte: 'fba_versand_durch_amazon', zielfeld: 'Artikel » Versand durch Amazon (FBA)', herkunft: 'fest', beschreibung: 'Immer 1 — es wird ausschließlich über FBA verkauft.' },
      { nr: 19, spalte: 'fba_abwicklung', zielfeld: 'Artikel » Amazon-Abwicklung (FBA)', herkunft: 'fest', beschreibung: 'Immer 1.' },
      { nr: 20, spalte: 'wb_beschraenkung', zielfeld: 'Varianten » WB-Beschränkung', herkunft: 'fest', beschreibung: 'Immer 1.' },
      { nr: 21, spalte: 'hauptlager_id', zielfeld: 'Varianten » Hauptlager', herkunft: 'fest', beschreibung: '2 = Amazon FBA-Lager BuchDepot24.' },
      { nr: 22, spalte: 'amazon_produkttyp', zielfeld: 'Artikel » Amazon-Produkttyp', herkunft: 'fest', beschreibung: 'Immer PRODUCT.' },
      { nr: 23, spalte: 'umsatzsteuer', zielfeld: 'Varianten » Umsatzsteuer', herkunft: 'fest', beschreibung: 'Pauschal 7 %. Bei Nonbook-Artikeln prüfen — siehe vlb_ust_satz.' },
      { nr: 24, spalte: 'mandant_aktiv', zielfeld: 'Mandant (Shop) » Aktiv', zusatz: 'Shop wählen', herkunft: 'fest', beschreibung: 'Immer 1.' },
      { nr: 25, spalte: 'markt_aktiv', zielfeld: 'Märkte » Aktiv', zusatz: 'Auftragsherkunft: Amazon FBA Germany', herkunft: 'fest', beschreibung: 'Immer 1.' },
      { nr: 26, spalte: 'listing_id', zielfeld: 'Artikel » Feld 1', herkunft: 'amazon', beschreibung: 'Amazon listing-id, zur Rückverfolgung.' },
      { nr: 27, spalte: 'open_date', zielfeld: 'Artikel » Feld 2', herkunft: 'berechnet', beschreibung: 'Anlagedatum des Listings, umgebaut auf TT.MM.JJJJ HH:MM:SS.' },
    ],
  },
  {
    key: 'b',
    titel: 'Block B — Bild',
    zeilen: [
      { nr: 28, spalte: 'bild_multi_url', zielfeld: 'Artikelbilder » Multi-Url (Kommasepariert)', herkunft: 'berechnet', beschreibung: 'Zeigt auf cdn02.plentyone.com/…/cover/<ISBN13>.jpg. Setzt voraus, dass die Cover-ZIPs in den Dateimanager-Ordner „cover" entpackt wurden.' },
    ],
  },
  {
    key: 'c',
    titel: 'Block C — VLB-Daten',
    hinweis: 'Kommt aus der VLB-Datenbank des Buchhandels. Zeile 31 erst nach dem Hersteller-Import mappen.',
    zeilen: [
      { nr: 29, spalte: 'vlb_beschreibung', zielfeld: 'Artikelbeschreibung » Beschreibung', zusatz: 'Sprache: Deutsch', herkunft: 'vlb', beschreibung: 'Verlagsbeschreibung, nach Textart priorisiert (Beschreibung vor Klappentext). Enthält HTML-Formatierung. Inhaltsverzeichnis, Leseprobe und Rezensionszitate werden bewusst ausgeschlossen.' },
      { nr: 30, spalte: 'vlb_bpb_preis', zielfeld: 'Variantenpreise » Preis', zusatz: 'Verkaufspreis: Buchpreisbindung', herkunft: 'vlb', beschreibung: 'Gebundener Ladenpreis Deutschland. Nur gesetzt, wenn es ein fester Preis ohne ca.-Kennzeichnung ist.' },
      { nr: 31, spalte: 'vlb_verlag', zielfeld: 'Artikel » Hersteller-ID', zusatz: 'erst nach Hersteller-Import', herkunft: 'vlb', beschreibung: 'Verlagsname. Kaufland verlangt ihn als „manufacturer", eBay als „Marke".' },
      { nr: 32, spalte: 'vlb_autor', zielfeld: 'Eigenschaften » Wert', zusatz: 'Eigenschaft: Autor', herkunft: 'vlb', beschreibung: 'Autoren als „Nachname, Vorname", mehrere mit Semikolon. Fällt auf den aus dem Amazon-Titel gelesenen Autor zurück.' },
      { nr: 33, spalte: 'vlb_erscheinungsdatum', zielfeld: 'Eigenschaften » Wert', zusatz: 'Eigenschaft: Erscheinungsdatum', herkunft: 'vlb', beschreibung: 'Erscheinungsdatum als JJJJ-MM-TT. Bei unvollständigen Angaben der VLB auf den Monats- bzw. Jahresanfang gesetzt.' },
      { nr: 34, spalte: 'vlb_sprache', zielfeld: 'Eigenschaften » Wert', zusatz: 'Eigenschaft: Sprache', herkunft: 'vlb', beschreibung: 'Textsprache. Nur die in PlentyONE angelegten Auswahlwerte; unbekannte Codes bleiben leer statt geraten zu werden.' },
      { nr: 35, spalte: 'vlb_seitenzahl', zielfeld: 'Eigenschaften » Wert', zusatz: 'Eigenschaft: Seitenzahl', herkunft: 'vlb', beschreibung: 'Anzahl nummerierter Seiten.' },
      { nr: 36, spalte: 'vlb_bindung', zielfeld: 'Eigenschaften » Wert', zusatz: 'Eigenschaft: Bindung', herkunft: 'vlb', beschreibung: 'Einbandart aus der ONIX-Produktform, verfeinert um das Produktformdetail (unterscheidet Taschenbuch von Broschiert).' },
      { nr: 37, spalte: 'vlb_gewicht_g', zielfeld: 'Varianten » Bruttogewicht', herkunft: 'vlb', beschreibung: 'Gewicht in Gramm. Fehlt die Angabe, wird pauschal 1.000 g gesetzt — siehe vlb_gewicht_geschaetzt.' },
      { nr: 38, spalte: 'vlb_breite_mm', zielfeld: 'Varianten » Breite', herkunft: 'vlb', beschreibung: 'Breite in Millimetern.' },
      { nr: 39, spalte: 'vlb_hoehe_mm', zielfeld: 'Varianten » Höhe', herkunft: 'vlb', beschreibung: 'Höhe in Millimetern.' },
      { nr: 40, spalte: 'vlb_dicke_mm', zielfeld: 'Varianten » Länge', herkunft: 'vlb', beschreibung: 'Dicke des Buchrückens in Millimetern. Von den Verlagen nur teilweise gepflegt.' },
    ],
  },
  {
    key: 'c2',
    titel: 'Block C2 — Marktplatz-Pflichtfelder',
    hinweis:
      'Für Kaufland und eBay erforderlich. Warengruppe und Thema steuern die Kategoriezuordnung im Katalog.',
    zeilen: [
      { nr: 41, spalte: 'vlb_warengruppe', zielfeld: 'Eigenschaften » Wert', zusatz: 'Eigenschaft: Warengruppe (anlegen)', herkunft: 'vlb', beschreibung: 'WGS-Code des deutschen Buchhandels, z. B. 2112. Basis für die Kategoriezuordnung.' },
      { nr: 42, spalte: 'vlb_thema', zielfeld: 'Eigenschaften » Wert', zusatz: 'Eigenschaft: Thema (anlegen)', herkunft: 'vlb', beschreibung: 'Thema-Klassifikation (Nachfolger von BIC/BISAC), kommagetrennt. Wird von Kaufland und eBay für Kategorien genutzt.' },
    ],
  },
  {
    key: 'd',
    titel: 'Block D — Hilfsspalten, Import = AUS',
    hinweis:
      'Diese Spalten werden im Artikelimport nicht gemappt. Die gpsr-Felder gehören an den Hersteller, der Rest dient der Kontrolle.',
    zeilen: [
      { nr: null, spalte: 'gpsr_firma', zielfeld: null, herkunft: 'vlb', beschreibung: 'Hersteller bzw. verantwortliche Person nach EU-Produktsicherheitsverordnung (GPSR). Pflicht bei Kaufland und eBay. Gehört an den Hersteller-Datensatz.' },
      { nr: null, spalte: 'gpsr_strasse', zielfeld: null, herkunft: 'vlb', beschreibung: 'Straße und Hausnummer des GPSR-Kontakts.' },
      { nr: null, spalte: 'gpsr_plz', zielfeld: null, herkunft: 'vlb', beschreibung: 'Postleitzahl des GPSR-Kontakts.' },
      { nr: null, spalte: 'gpsr_ort', zielfeld: null, herkunft: 'vlb', beschreibung: 'Ort des GPSR-Kontakts.' },
      { nr: null, spalte: 'gpsr_land', zielfeld: null, herkunft: 'vlb', beschreibung: 'Ländercode des GPSR-Kontakts, meist DE.' },
      { nr: null, spalte: 'gpsr_mail', zielfeld: null, herkunft: 'vlb', beschreibung: 'Kontaktadresse für Produktsicherheit. Viele Verlage pflegen hier eine eigene produktsicherheit@-Adresse.' },
      { nr: null, spalte: 'amazon_autor', zielfeld: null, herkunft: 'berechnet', beschreibung: 'Autor, aus dem Amazon-Titel gelesen. Rückfallebene, falls die VLB keinen liefert.' },
      { nr: null, spalte: 'amazon_bindung', zielfeld: null, herkunft: 'berechnet', beschreibung: 'Einbandart aus dem Amazon-Titel. Rückfallebene.' },
      { nr: null, spalte: 'amazon_erscheinungsdatum', zielfeld: null, herkunft: 'berechnet', beschreibung: 'Erscheinungsdatum aus dem Amazon-Titel. Rückfallebene.' },
      { nr: null, spalte: 'vlb_cover_url', zielfeld: null, herkunft: 'vlb', beschreibung: 'Nur gesetzt, wenn die VLB überhaupt ein Cover hat. Leer = für diese ISBN gibt es kein Bild.' },
      { nr: null, spalte: 'vlb_gewicht_geschaetzt', zielfeld: null, herkunft: 'berechnet', beschreibung: '1 = das Gewicht ist die 1-kg-Pauschale, nicht der echte Wert. Wichtig für die Versandkalkulation.' },
      { nr: null, spalte: 'vlb_ust_satz', zielfeld: null, herkunft: 'vlb', beschreibung: 'Steuersatz aus dem VLB-Preis. Steht hier 19, ist der pauschale Wert 7 in Spalte 23 falsch.' },
      { nr: null, spalte: 'vlb_status', zielfeld: null, herkunft: 'vlb', beschreibung: 'OK oder KEIN_TREFFER — zeigt, ob die VLB einen Datensatz zur ISBN hat.' },
    ],
  },
]

/** Reihenfolge der Schritte, die der Nutzer nach dem Lauf in PlentyONE ausführt. */
export const IMPORT_SCHRITTE = [
  {
    titel: 'Cover hochladen',
    text: 'Die ZIP-Pakete entpacken und alle .jpg in Shop » Dateimanager » Ordner „cover" hochladen. Dateinamen nicht ändern — die Bild-URL in der CSV zeigt genau darauf.',
  },
  {
    titel: 'Hersteller anlegen',
    text: 'Aus der CSV die Spalten vlb_verlag und gpsr_* ziehen und als Import-Typ „Hersteller" anlegen. Erst danach lässt sich Zeile 31 auf die Hersteller-ID mappen. Ohne Hersteller lehnen Kaufland und eBay die Artikel ab.',
  },
  {
    titel: 'Eigenschaften prüfen',
    text: 'Die Eigenschaftsgruppe „VLB Buchdaten" muss existieren: Autor, Erscheinungsdatum, Sprache, Seitenzahl, Bindung — dazu neu Warengruppe und Thema.',
  },
  {
    titel: 'Import anlegen',
    text: 'Daten » Import, Kopie von „Amazon Import 3.0" als „Amazon Import 4.0 VLB+Bilder". Trennzeichen ;, UTF-8, Abgleich über Variantennr. Mapping nach der Tabelle unten setzen.',
  },
  {
    titel: 'Erst mit wenigen Zeilen testen',
    text: 'Import-Intervall zuletzt setzen. Die Zeilenreihenfolge der CSV nicht verändern — die Hauptvariante muss vor ihren Geschwistervarianten stehen.',
  },
]
