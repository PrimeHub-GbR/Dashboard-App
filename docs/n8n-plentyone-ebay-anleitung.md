# Anleitung: eBay-Automatisierung einrichten

Diese Anleitung führt einmalig durch die Einrichtung. Danach läuft der Zyklus allein:
Amazon-Export hochladen → alles Weitere passiert nachts von selbst.

Reihenfolge einhalten — Schritt 3 braucht die Werte aus Schritt 1.

---

## Schritt 1 — Zwei Passwörter erzeugen

Du brauchst zwei zufällige Zeichenketten. Erzeuge sie z. B. hier:
<https://www.random.org/strings/?num=2&len=32&digits=on&loweralpha=on&format=plain>

Schreib sie dir auf. Ich nenne sie im Folgenden:

- **TOKEN-A** → verbindet PlentyONE und n8n mit dem Dashboard
- **TOKEN-B** → schützt die beiden n8n-Webhooks

---

## Schritt 2 — Die Werte in Vercel eintragen

1. Öffne <https://vercel.com> und melde dich an.
2. Klicke auf das Projekt **dashboard** (bzw. `primehub-dashboard`).
3. Oben auf **Settings**, links auf **Environment Variables**.
4. Trage nacheinander diese vier Einträge ein. Bei jedem: Name links, Wert rechts,
   Häkchen bei **Production**, dann **Save**.

| Name | Wert |
|---|---|
| `PLENTYONE_EXPORT_TOKEN` | TOKEN-A |
| `N8N_EBAY_TOKEN` | TOKEN-B |
| `N8N_EBAY_LISTINGS_URL` | `https://n8n.primehubgbr.com/webhook/ebay-listings` |
| `N8N_EBAY_MERKMALE_URL` | `https://n8n.primehubgbr.com/webhook/ebay-merkmale` |

5. Gehe oben auf **Deployments**, beim obersten Eintrag rechts auf die drei Punkte **…**
   → **Redeploy** → **Redeploy**. Ohne diesen Schritt kennt das Dashboard die neuen Werte nicht.

---

## Schritt 3 — Den Workflow in n8n importieren

1. Öffne <https://n8n.primehubgbr.com> und melde dich an.
2. Klicke oben rechts auf **Create Workflow** und dann auf die drei Punkte **…**
   (ganz oben rechts) → **Import from File…**.
3. Wähle die Datei `docs/plentyone-ebay-workflow.json` aus diesem Projekt aus.
4. Der Workflow **„eBay-Dateien und Kontrolle (PrimeHub)"** erscheint mit 15 Knoten.
5. Klicke oben rechts auf **Save**.

### Schritt 3b — Zugangsdaten eintragen

1. Doppelklick auf den Knoten **Konfiguration** (der graue Kasten in der Mitte).
2. Rechts öffnet sich eine Liste von Feldern. Ändere genau vier davon:

| Feld | Wert |
|---|---|
| `passwort` | das Passwort des PlentyONE-REST-Benutzers **Tempnutzer** |
| `webhookToken` | TOKEN-B |
| `dashboardToken` | TOKEN-A |
| `dashboardBericht` | `https://dashboard.primehubgbr.com/api/plentyone/ebay/bericht` (steht meist schon drin) |

3. Schließe das Fenster mit dem **X** oben links und klicke oben rechts auf **Save**.
4. Schiebe oben rechts den Schalter **Inactive** auf **Active**.

### Schritt 3c — Testen

1. Klicke unten in der Mitte auf **Test workflow**.
2. Der Zeitplan-Zweig läuft los. Alle Knoten sollten grün werden.
3. Klicke auf **Daten holen** und sieh dir rechts unter **OUTPUT** das Feld `inhalt` an —
   dort steht die Zusammenfassung.
4. Prüfe im Dashboard unter `/dashboard/plentyone`, Abschnitt **5 · Weiter zu eBay**,
   ob der Bericht angekommen ist.

> Wird ein Knoten rot: Klicke ihn an, die Fehlermeldung steht rechts oben.
> „Kein Login-Token" = das Tempnutzer-Passwort stimmt nicht.

---

## Schritt 4 — Die vier PlentyONE-Importe auf Selbstabholung umstellen

Für **jeden** der vier Importe die gleichen Handgriffe. Die Adressen stehen im Dashboard
unter `/dashboard/plentyone` → **5 · Weiter zu eBay** und lassen sich dort kopieren.
`DEIN_TOKEN` durch TOKEN-A ersetzen.

| Import in PlentyONE | Adresse | Uhrzeit |
|---|---|---|
| Artikelimport (Kopie von „Amazon Import 3.0") | `…/api/plentyone/export/artikel.csv?t=TOKEN-A` | 02:00 |
| Eigenschaftsimport | `…/api/plentyone/export/eigenschaften.csv?t=TOKEN-A` | 02:30 |
| **Import 23** eBay-Listings anlegen | `…/api/plentyone/export/ebay-listings.csv?t=TOKEN-A` | 03:00 |
| **Import 22** eBay-Merkmale | `…/api/plentyone/export/ebay-merkmale.csv?t=TOKEN-A` | 04:00 |

So geht es je Import:

1. Öffne PlentyONE → **Daten » Import**.
2. Klicke den Import in der Liste an.
3. Wechsle auf den Reiter **Einstellungen** (bzw. „Datenquelle").
4. Stelle **Datenquelle** von „Datei-Upload" auf **HTTPS / URL** um.
5. Trage in das Adressfeld die Adresse aus der Tabelle ein.
6. Weiter unten bei **Zeitplan**: auf **täglich** stellen und die Uhrzeit aus der Tabelle setzen.
7. Oben rechts auf **Speichern**.

> ⚠️ Die Uhrzeiten sind kein Zufall. Import 23 legt die Listings an, danach muss die
> Vorlage laufen, erst dann darf Import 22 die Merkmale setzen. Wer die Reihenfolge
> ändert, bekommt unvollständige Listings.

---

## Schritt 5 — Der eine verbleibende Handgriff: die Vorlage

Zwischen **03:00 und 04:00** muss die Stapelverarbeitungs-Vorlage auf die neuen Listings
angewendet werden. Das ist der einzige Klick, der bis auf Weiteres bleibt — der
zugehörige interne Endpunkt von PlentyONE ist noch nicht bekannt.

1. PlentyONE → **eBay » Listings » Stapelverarbeitung**.
2. Vorlage **„Bücher (1)"** laden.
3. Filter setzen (neue Listings) und **Ausführen**.
4. Danach **„Market-Listings prüfen"** ausführen.

**Tipp für den Netzwerk-Mitschnitt** (damit dieser Schritt später wegfällt):
Drücke vor dem Klick auf „Ausführen" die Taste **F12**, wechsle auf den Reiter
**Netzwerkanalyse / Network**, klicke dann „Ausführen", und schicke mir hinterher einen
Screenshot der obersten Zeile in der Liste (Adresse und Methode). Damit lässt sich
Schritt 5 in n8n nachbauen.

---

## Schritt 6 — Der laufende Betrieb

Alle zwei Wochen:

1. Amazon Seller Central → **Lagerbestandsberichte** → **Bericht zu allen Angeboten**
   herunterladen.
2. Im Dashboard unter `/dashboard/plentyone` hochladen, **Migration starten**.
3. Warten, bis beide Stränge grün sind (CSV ca. 2 Minuten, Cover ca. 20).
4. Nichts weiter tun. In der Nacht holt PlentyONE die Daten ab.
5. Am nächsten Tag im Dashboard den **Statusbericht** lesen.
6. Wenn alles grün ist: in PlentyONE **„Listings starten"** mit der Option
   **„verteilt auf X Minuten"** (mehrere Stunden wählen).

Der Schalter **„Export für PlentyONE freigegeben"** im Dashboard steuert, ob PlentyONE
die Artikel- und Eigenschaftsdaten noch abholen darf. Nach 7 Tagen schließt er sich
von selbst — damit ein Zeitplan nicht Wochen später gepflegte Daten überschreibt.

---

## Wenn etwas nicht stimmt

| Symptom | Ursache | Lösung |
|---|---|---|
| Import in PlentyONE meldet „keine Daten" | Export-Fenster ist zu | Schalter im Dashboard wieder anschalten oder neuen Lauf starten |
| Import bricht mit Fehler 401 ab | Token in der Adresse falsch | Adresse im Dashboard neu kopieren, TOKEN-A einsetzen |
| Import bricht mit Fehler 502/503 ab | n8n-Workflow inaktiv oder Webhook-Adresse falsch | in n8n prüfen: Schalter auf **Active**, Pfade `ebay-listings` / `ebay-merkmale` |
| Bericht sagt „Preis-Guard konnte nicht prüfen" | Verkaufspreise per REST nicht lesbar | vor dem Start stichprobenartig von Hand prüfen, ob Preis-ID 7 gefüllt ist |
| Listings fehlen für einen Teil des Sortiments | Variantennummern passen nicht ins Muster | im Knoten **Konfiguration** das Feld `variantenMuster` prüfen |
