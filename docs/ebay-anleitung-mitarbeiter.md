# Bücher zu eBay bringen — Anleitung

**Wie oft:** alle 2 Wochen
**Dauer:** etwa 30 Minuten Arbeit, dazwischen Wartezeit

---

## Die wichtigste Regel

**Wenn irgendwo etwas Rotes steht oder eine Zahl bei „Fehler" größer als 0 ist:
aufhören und den Chef fragen.** Nichts anklicken, nichts reparieren.

---

## Was du brauchst

| Zugang | Adresse |
|---|---|
| Amazon | sellercentral.amazon.de |
| Dashboard | dashboard.primehubgbr.com |
| PlentyONE | p74746.my.plentysystems.com |

---

# Block 1 · Amazon-Datei holen

1. **sellercentral.amazon.de** öffnen und anmelden.
2. Den **Bestandsbericht** herunterladen.
3. Die Datei liegt jetzt in deinem Ordner **Downloads**.

> Den genauen Weg zum Bericht zeigt dir der Chef beim ersten Mal. Danach ist es
> jedes Mal derselbe Klickweg.

---

# Block 2 · Datei hochladen

4. **dashboard.primehubgbr.com** öffnen und anmelden.
5. Links auf **PlentyONE-Migration** klicken.
6. Auf **Datei auswählen** klicken und die Amazon-Datei aus *Downloads* wählen.
7. Auf **Hochladen** klicken.
8. **Warten.** Das dauert länger. Du kannst die Seite zumachen und später
   zurückkommen.
9. Wenn es fertig ist, steht der Lauf auf **erfolgreich**.
10. Prüfen: Der Schalter **Freigabe** beim Lauf muss **an** sein.

---

# Block 3 · Bücher nach PlentyONE

11. **p74746.my.plentysystems.com** öffnen und anmelden.
12. Im Menü auf **Daten** → **Import** klicken.
13. Du siehst eine Liste mit Importen.

Jetzt startest du **vier Importe nacheinander**. Immer gleich:
Zeile anklicken → **Start** → warten, bis das Ergebnis erscheint.

**Reihenfolge einhalten. Nicht vertauschen.**

| Nr. | Import | Was danach dasteht |
|---|---|---|
| 1 | **Artikelimport** | Zahl der importierten Zeilen |
| 2 | **Eigenschaftsimport** | Zahl der importierten Zeilen |
| 3 | **eBay-Listing-Erstellung** | Zahl der neuen Angebote |
| 4 | **eBay-Merkmale Bücher** | Zahl der Zeilen, Fehler muss **0** sein |

14. Import 1 starten, warten.
15. Import 2 starten, warten.
16. Import 3 starten, warten.
17. Import 4 starten, warten.

> **Bei Import 3 steht „0 Zeilen"?** Alles in Ordnung. Das heißt nur: es gibt
> keine neuen Bücher. Weitermachen.
>
> **Bei Import 4 steht eine Fehlerzahl über 0?** Stopp. Chef fragen.

---

# Block 4 · Angebote prüfen lassen

> **Wichtig:** Die Schaltfläche *Gruppenfunktion » Market-Listings prüfen*
> schafft nur **acht** Angebote. Bei mehr meldet sie Erfolg und tut nichts.
> Deshalb läuft die Prüfung über das Skript unten.

18. In PlentyONE die **Market-Listings** öffnen.
19. Die **kleinste** und die **größte** Zahl in der Spalte **MLID** notieren
    (ganz oben und ganz unten in der Liste).
20. **F12** drücken, oben auf **Konsole** klicken.
21. Beim ersten Mal: `allow pasting` tippen, **Enter**.
22. Die Datei **`docs/ebay-pruefung-stapel.js`** öffnen, ganz oben die zwei
    Zahlen aus Schritt 19 bei `VON` und `BIS` eintragen.
23. Datei komplett kopieren, in die Konsole einfügen, **Enter**.
24. **Warten**, bis unten `fertig` erscheint. Der Browser-Tab muss offen bleiben.
    Grobe Dauer: 100 Angebote ≈ 15 Minuten, 1.000 ≈ 2,5 Stunden.
25. Die Liste **neu laden**. Bei jeder Zeile steht jetzt ein Zeichen:

| Zeichen | Bedeutung | Was tun |
|---|---|---|
| **✓** und eine **Einstellgebühr** | in Ordnung | weitermachen |
| **!** | nicht in Ordnung | Stopp, Chef fragen |
| ✓ aber **keine** Einstellgebühr | nicht wirklich geprüft | Stopp, Chef fragen |

26. Erst wenn **alle** Zeilen ein ✓ haben, geht es weiter.

---

# Block 5 · Bericht ansehen

27. Zurück ins **Dashboard**, links auf **PlentyONE-Migration**.
28. Nach unten scrollen bis **5 · Weiter zu eBay**.
29. Auf **Aktualisieren** klicken (oben rechts). Der Bericht wird neu
    gerechnet, das dauert etwa eine Minute.

| Farbe | Was tun |
|---|---|
| **Grün** | weiter zu Block 6 |
| **Rot** | Stopp. Den Text kopieren und dem Chef schicken. |

---

# Block 6 · Live stellen

**Das machst du nur, wenn der Chef es ausdrücklich sagt.**

30. In PlentyONE zurück zu den **Market-Listings**.
31. Alle Zeilen markieren.
32. **Gruppenfunktion** → **Listing starten**.
33. Fertig. Die Bücher sind bei eBay.

---

# Wenn etwas nicht stimmt

| Das siehst du | Das machst du |
|---|---|
| Import meldet Fehler über 0 | Chef fragen |
| Ein **!** bleibt nach der Prüfung stehen | Chef fragen |
| Bericht im Dashboard ist rot | Text kopieren, Chef schicken |
| Bericht sagt „FBA-Bestand veraltet“ | Chef fragen — nicht live stellen |
| „Titel enthält zu viele Zeichen" | Chef fragen |
| Import 3 meldet 0 Zeilen | **kein Problem** — weitermachen |
| Der Upload im Dashboard bleibt hängen | Chef fragen |
| Du bist unsicher | Chef fragen |

**Nie selbst reparieren. Nie Werte in PlentyONE von Hand ändern.**

---

# Spickzettel

```
1. Amazon      →  Bestandsbericht herunterladen
2. Dashboard   →  hochladen, warten, Freigabe an
3. PlentyONE   →  Daten » Import
                  ① Artikelimport
                  ② Eigenschaftsimport
                  ③ eBay-Listing-Erstellung
                  ④ eBay-Merkmale Bücher       ← Fehler muss 0 sein
4. PlentyONE   →  Market-Listings, kleinste und größte MLID notieren
                  F12 » Konsole » Skript ebay-pruefung-stapel.js einfügen
                  warten bis "fertig", dann Liste neu laden
                  alle ✓ mit Einstellgebühr ?
5. Dashboard   →  5 · Weiter zu eBay
                  grün ?
6. Nur nach Freigabe vom Chef:
   PlentyONE   →  Gruppenfunktion » Listing starten
```
