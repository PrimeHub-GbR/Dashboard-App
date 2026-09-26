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

> **Gut zu wissen:** Neue Angebote prüft das System jede Nacht von selbst.
> Den Knopf brauchst du, wenn du **nicht bis morgen warten** willst — und immer,
> wenn der Chef sagt, dass sich bei eBay etwas geändert hat (zum Beispiel die Gebühren).
> Das alte Skript mit **F12** und der Konsole brauchst du **nicht mehr**.

18. Im **Dashboard** links auf **PlentyONE-Migration** klicken.
19. Nach unten scrollen bis zum Kasten **Alle Listings neu prüfen**.
20. Auf **Alle neu prüfen** klicken, dann auf **Prüfung starten**.
    Kommt „Keine Berechtigung": Chef fragen.
21. **Warten**, etwa **30 Minuten**. Du kannst die Seite zumachen.
22. Wenn **Prüfung abgeschlossen** steht, geht es weiter.
23. In PlentyONE die **Market-Listings** öffnen.
24. Die Liste **neu laden**. Bei jeder Zeile steht jetzt ein Zeichen:

| Zeichen | Bedeutung | Was tun |
|---|---|---|
| **✓** und eine **Einstellgebühr** | in Ordnung | weitermachen |
| **!** | nicht in Ordnung | Stopp, Chef fragen |
| ✓ aber **keine** Einstellgebühr | nicht wirklich geprüft | Stopp, Chef fragen |

25. Bei ein paar Zeilen die **Einstellgebühr** ansehen: Dort steht **0,06 €**.
    Steht dort 0,42 €: Chef fragen.
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
| Knopf „Alle neu prüfen" meldet einen Fehler | Chef fragen |
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
4. Dashboard   →  PlentyONE-Migration » Alle neu prüfen  (~30 Min)
   PlentyONE   →  Market-Listings neu laden
                  alle ✓ mit Einstellgebühr 0,06 € ?
5. Dashboard   →  5 · Weiter zu eBay
                  grün ?
6. Nur nach Freigabe vom Chef:
   PlentyONE   →  Gruppenfunktion » Listing starten
```
