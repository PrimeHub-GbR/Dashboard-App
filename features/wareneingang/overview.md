# Wareneingang / Palettenannahme

**Status:** Deployed
**Tab:** `/dashboard/wareneingang`
**Lieferant (Start):** BuchVertrieb Blank GmbH (`vertrieb@buchvertrieb-blank.de`)

## Ziel

Palettenlieferungen entlang des Status-Pfades **Bestellt → Paket unterwegs → Empfangen**
verfolgen, ohne Liefermengen schätzen zu müssen. Auslöser sind die E-Mails des
Lieferanten; der Empfang wird vom Lager-Mitarbeiter im Dashboard bestätigt.

## Dokumenten-Fluss bei Blank

| E-Mail (von `vertrieb@buchvertrieb-blank.de`) | Betreff-Muster | Status |
|---|---|---|
| Auftragsbestätigung (PDF `AB<Nr>.pdf`) | `AUFTRAGSBESTÄTIGUNG Nr. <AB-Nr> vom <Datum>` | **bestellt** |
| Lieferschein (PDF `LS<Nr>.pdf`) | `LIEFERSCHEIN Nr. <LS-Nr> vom <Datum>` | **unterwegs** |
| — (Mitarbeiter im Dashboard) | — | **empfangen** |

- Die AB-Mail enthält im Text **Palettenanzahl + Nettogewicht**
  (z. B. „auf 2 Paletten", „Nettogewicht 720 kg") → wird als `paletten_erwartet` / `nettogewicht_kg` geparst.
- **Keine Sendungsnummer** verfügbar (von Blank bestätigt). Verlässliches „unterwegs"-Signal ist der Lieferschein.
- Spedition avisiert künftig **24 h vorher** (Mail/Telefon) → optionales Feld `avisiert_fuer`, manuell pflegbar.

## Architektur (N8N-First)

```
Gmail (primehubgbr@gmail.com)
  └─ N8N-Workflow "[Dashboard] Blank Wareneingang" (ID PUcABZg5Mx0xUNwm)
       Gmail Trigger (from:vertrieb@buchvertrieb-blank.de has:attachment)
         → Code-Node: Subject/Body parsen (Typ, AB-/LS-Nr, Datum, Paletten, kg, PDF→base64)
         → HTTP POST  /api/wareneingang/ingest   (Header x-ingest-secret)
  └─ Dashboard
       /api/wareneingang/ingest  (Secret-Auth)  → Upsert in Tabelle `wareneingang`, PDF → Storage
       /api/wareneingang         (Auth, Liste)
       /api/wareneingang/[id]     (Auth, PATCH Empfang bestätigen / DELETE)
       /api/wareneingang/[id]/beleg (Auth, Signed URL zum PDF)
       /dashboard/wareneingang    (UI: Status-Tabs, Empfang-Dialog)
```

### Matching Auftragsbestätigung ↔ Lieferschein
Der Lieferschein referenziert die AB-Nr. nicht zuverlässig im Betreff. Heuristik im
Ingest-Endpoint: Lieferschein hängt sich an die **neueste offene Bestellung** (`status=bestellt`,
ohne `ls_nummer`) des Lieferanten. Findet sich keine, wird ein eigenständiger Eintrag (Status
`unterwegs`) angelegt. Status wird nie zurückgestuft.

## Datenmodell

Tabelle `public.wareneingang` (Migration `096_wareneingang.sql`), RLS an, Zugriff nur
über Service-Role-API mit Auth-Check. Bucket `wareneingang-belege` (privat) für PDFs.
Felder u. a.: `supplier`, `ab_nummer/ab_datum`, `ls_nummer/ls_datum`, `paletten_erwartet`,
`nettogewicht_kg`, `status`, `ab_pdf_path/ls_pdf_path`, `empfangen_von/_am`,
`paletten_geprueft`, `schaden`, `notiz`, `avisiert_fuer`.

## Inbetriebnahme (manuell, einmalig)

1. **Vercel-Env:** `WARENEINGANG_INGEST_SECRET` = (siehe `.env.local`) für Production setzen, Redeploy.
2. **N8N:** Workflow „[Dashboard] Blank Wareneingang" aktivieren (steht zunächst auf inaktiv).
3. Optional: Test mit einer vorhandenen Blank-AB-/Lieferschein-Mail.

## Erweiterbarkeit
`supplier`-Feld + parametrisierte Mail-Erkennung erlauben weitere Lieferanten (A43, Avus …)
über zusätzliche N8N-Trigger, die denselben Ingest-Endpoint mit anderem `supplier` nutzen.
