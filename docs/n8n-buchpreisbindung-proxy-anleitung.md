# N8N-Anleitung: Buchpreisbindung mit DataImpulse-Proxy aktualisieren

**Was wird geändert?** Der Buchpreisbindung-Workflow scrapt Amazon jetzt über einen DataImpulse-Residential-Proxy (sonst blockt Amazon), liest **alle** Schaufenster-Seiten, filtert **gebrauchte Bücher** raus, meldet das verbrauchte Datenvolumen ans Dashboard und **meldet das VLB-Token zuverlässig wieder ab**.

> Die fertige Workflow-Datei liegt unter `docs/buchpreisbindung-workflow.json`. Du importierst sie einmal neu.

---

## Schritt 1 — DataImpulse-Proxy-URL bereitlegen

1. Logge dich bei [app.dataimpulse.com](https://app.dataimpulse.com) ein.
2. Notiere **Username** und **Passwort** für Residential-Proxys.
3. Die Proxy-URL für Deutschland sieht so aus (rotierende IP, Port 823):
   ```
   http://DEIN_USERNAME__cr.de:DEIN_PASSWORT@gw.dataimpulse.com:823
   ```
   - `__cr.de` = nur deutsche IPs (kostenlos, wichtig für amazon.de).
   - Port `823` = bei jeder Anfrage eine neue IP (gut gegen Blocks).

---

## Schritt 2 — Proxy-URL als Umgebungsvariable in N8N hinterlegen

**Empfohlen** (Passwort liegt dann nicht im Workflow):

1. Öffne die Server-Konfiguration deiner N8N-Instanz (z.B. `docker-compose.yml` oder die `.env` neben N8N).
2. Trage ein:
   ```
   DATAIMPULSE_PROXY_URL=http://DEIN_USERNAME__cr.de:DEIN_PASSWORT@gw.dataimpulse.com:823
   ```
3. Starte N8N neu, damit die Variable geladen wird.

> **Kein Server-Zugriff?** Dann kannst du die Proxy-URL in Schritt 4 auch direkt in den Node eintragen (statt `{{ $env.DATAIMPULSE_PROXY_URL }}`).

Dieselbe Variable muss auch im Dashboard (Vercel) und in `.env.local` gesetzt sein — sie wird beim „Prüfen"-Button gebraucht.

---

## Schritt 3 — Alten Workflow deaktivieren & neuen importieren

1. Öffne [n8n.primehubgbr.com](https://n8n.primehubgbr.com) → **Workflows**.
2. Öffne den alten **„Buchpreisbindung-Check"** → oben rechts den Schalter auf **Inactive** stellen (damit der Webhook-Pfad nicht doppelt belegt ist). Optional: alten Workflow löschen.
3. Oben rechts **„…" → Import from File** → Datei `docs/buchpreisbindung-workflow.json` auswählen.
4. Der Webhook-Pfad bleibt `buchpreisbindung-check` → die Dashboard-URL ändert sich **nicht**.

---

## Schritt 4 — Proxy am Node „Amazon Pages" prüfen

1. Klicke im Workflow auf den Node **„Amazon Pages"** (der HTTP-Request-Node nach „Build Page List").
2. Scrolle rechts zu **Options**. Dort sollte **Proxy** = `{{ $env.DATAIMPULSE_PROXY_URL }}` stehen.
   - Falls die Option fehlt: **Add Option → Proxy** → den Wert eintragen.
   - Ohne Server-Env: hier direkt die volle Proxy-URL aus Schritt 1 eintragen.
3. **Save** (oben rechts).

---

## Schritt 5 — Supabase-Service-Key im Node „Upload Result" eintragen

Im Node **„Upload Result"** steht im Header `Authorization` noch der Platzhalter `Bearer YOUR_SUPABASE_SERVICE_ROLE_KEY`.

1. Klicke auf **„Upload Result"**.
2. Ersetze `YOUR_SUPABASE_SERVICE_ROLE_KEY` durch den echten **Service Role Key** (Supabase → Project Settings → API).
3. **Save**.

---

## Schritt 6 — Testen

1. Im Dashboard unter **Buchpreisbindung** einen Händler anlegen und **„Jetzt prüfen"** klicken.
2. In N8N → Workflow → **Executions** den letzten Lauf öffnen.
3. Prüfen:
   - **Amazon Pages**: liefert echtes HTML (keine CAPTCHA-Seite). Wenn doch CAPTCHA → siehe Schritt 7.
   - **VLB-Logout**: ist **grün** (Token wurde abgemeldet). Das ist wichtig — du hast nur 2 Tokens.
   - Im Dashboard erscheint das Ergebnis, im Excel/der Tabelle nur **neue** Bücher.

---

## Schritt 7 — Fallback, falls Amazon trotz Proxy blockt (Tunneling-Fehler)

N8N's eingebauter Proxy hat bei HTTPS-Zielen manchmal Probleme („tunneling socket could not be established"). Dann:

1. In N8N: **Settings → Community Nodes → Install**.
2. Paketname eingeben: `n8n-nodes-httpsoverproxy` → installieren.
3. Im Workflow den Node **„Amazon Pages"** durch den neuen Node **„HTTPS Over Proxy"** ersetzen:
   - Gleiche URL, gleiche Header, gleiche Proxy-URL.
   - Response Format: **Text**.
4. **Save** und Schritt 6 wiederholen.

---

## Wichtige Hinweise

- **Kosten:** Pro Lauf werden bis zu 50 Seiten geladen (Safety-Cap). Du kannst pro Händler eine niedrigere „Max. Seiten"-Zahl setzen. Das tatsächlich verbrauchte Volumen siehst du im Dashboard unter „DataImpulse-Kosten".
- **2-Token-Limit:** Das Dashboard startet nie mehr als 2 Prüfungen gleichzeitig. Trotzdem ist es wichtig, dass „VLB-Logout" in jedem Lauf grün ist.
- **Gebraucht-Filter:** Erkennt gebrauchte Angebote anhand der Zustands-Labels. In seltenen Fällen kann ein Angebot falsch eingeordnet werden — bei Auffälligkeiten kurz im Schaufenster gegenchecken.
