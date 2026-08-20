# WhatsApp Business — Einrichtungs-Anleitung (Cloud API)

> Ziel: Das Dashboard `/dashboard/kommunikation` mit deinem WhatsApp Business Konto verbinden.
> Diese Anleitung führt dich komplett durch: Meta-Setup → N8N-Workflow → Verbindung → Test.
>
> **Stand:** 2026-06-02 · Dashboard-Code ist fertig & deployed, es fehlt nur die WhatsApp-Anbindung.

---

## Wie alles zusammenhängt (Überblick)

```
Dashboard (du klickst "Senden")
    │  POST  { log_id, phone, message }
    ▼
N8N-Webhook  (whatsapp-send)
    │
    ▼
WhatsApp Business Cloud Node  ──►  Meta WhatsApp Cloud API  ──►  📱 Mitarbeiter
    │
    ▼
PATCH zurück ans Dashboard  { status: "sent" | "failed" }   (aktualisiert die Versandhistorie)
```

Du brauchst von Meta nur **zwei Werte**: eine **Phone Number ID** und einen **Access Token**. Die trägst du in N8N ein. Alles andere ist schon gebaut.

---

## ⚠️ Wichtig vorab — drei Dinge, die du wissen musst

### 1. Deine Business-Nummer migrieren = sie verlässt die Handy-App
Du willst deine bestehende WhatsApp-Business-Nummer nutzen. Das geht (Migration zur Cloud API), **aber**:
- Nach der Migration läuft die Nummer **nicht mehr** in der WhatsApp-Business-App auf dem Handy.
- Der **Chat-Verlauf** der App wird **nicht** mitübernommen → vorher in der App exportieren, falls du ihn brauchst (App → Einstellungen → Chats → Chat-Verlauf exportieren).
- Ab dann läuft die Nummer nur noch über die API (also über dein Dashboard / N8N).

→ Wenn du die Nummer weiter am Handy brauchst, nimm lieber eine separate Nummer. Wenn die Nummer nur fürs Dashboard da sein soll, ist Migration perfekt.

### 2. Das 24-Stunden-Fenster (betrifft, WIE du senden kannst)
WhatsApp unterscheidet streng:
- **Freier Text** ist nur erlaubt, wenn der Mitarbeiter dir **in den letzten 24 Stunden geschrieben** hat ("Service-Fenster").
- **Außerhalb** der 24h darfst du nur **vorab genehmigte Vorlagen** ("Templates") senden.

Was das praktisch für dich bedeutet:
| Szenario | Funktioniert mit |
|---|---|
| Mitarbeiter hat gerade geschrieben, du antwortest | Freier Text ✅ |
| Du schreibst proaktiv (Aufgaben-Erinnerung, Stunden-Report), MA hat NICHT geschrieben | Nur Template ⚠️ |

**Empfohlener Start (in dieser Anleitung):** Wir bauen den Workflow zuerst mit **freiem Text**. Damit kannst du sofort alles testen — jeder Mitarbeiter sendet einmalig "Start" an die Nummer, dann ist 24h lang freier Text möglich. Für echten proaktiven Dauerbetrieb richten wir danach Templates ein (Teil E, optional).

### 3. Kosten
Meta rechnet pro Konversation ab (nicht pro Nachricht). Ein gewisses Kontingent/Monat ist frei, danach Cent-Beträge. Für interne Mitarbeiter-Kommunikation vernachlässigbar.

---

# TEIL A — Meta for Developers einrichten

### Schritt A1 — Meta Business Suite / Konto
1. Gehe zu **https://business.facebook.com** und melde dich mit deinem Facebook-Konto an.
2. Falls noch kein Unternehmenskonto existiert: oben links → **Einstellungen** → **Unternehmen erstellen**. Name, dein Name, E-Mail eintragen.

### Schritt A2 — App auf Meta for Developers erstellen
1. Gehe zu **https://developers.facebook.com**.
2. Oben rechts auf **Meine Apps** → **App erstellen**.
3. Bei "Anwendungsfall": **Andere** wählen → **Weiter**.
4. App-Typ: **Business** → **Weiter**.
5. App-Name (z.B. `PrimeHub Dashboard`), E-Mail, dein Unternehmenskonto auswählen → **App erstellen**.

### Schritt A3 — WhatsApp-Produkt hinzufügen
1. Im App-Dashboard scrollst du zu **Produkt hinzufügen**.
2. Bei **WhatsApp** auf **Einrichten** klicken.
3. Wähle dein Meta-Unternehmenskonto aus → **Weiter**.
   - Dabei wird automatisch ein **WhatsApp Business Account (WABA)** erstellt.

### Schritt A4 — Deine Nummer migrieren / hinzufügen
> Hier bindest du deine echte Business-Nummer ein.

1. Im linken Menü: **WhatsApp** → **API-Einrichtung** (oder "Erste Schritte").
2. Du siehst zunächst eine **Meta-Test-Nummer**. Daneben/darunter: **"Telefonnummer hinzufügen"** oder **"Eigene Nummer hinzufügen"**.
3. Klicke darauf und gib deine bestehende Business-Nummer ein.
4. **Wenn die Nummer noch in der WhatsApp-Business-App aktiv ist**, wirst du aufgefordert, sie zu migrieren:
   - Meta sendet dir einen Code, ODER fordert dich auf, die Nummer zuerst aus der App zu **deregistrieren**.
   - In der WhatsApp-Business-App: **Einstellungen → Konto → Konto löschen** (das entfernt die Nummer von der App, NICHT dein Meta-Konto).
   - ⚠️ Erst Chat-Verlauf exportieren, falls gewünscht (siehe oben).
5. Verifiziere die Nummer per **SMS** oder **Anruf** (6-stelliger Code).
6. Lege eine **Anzeige-/Display-Name** fest (z.B. "PrimeHub") — den prüft Meta (dauert i.d.R. wenige Minuten bis Stunden).

### Schritt A5 — Die zwei wichtigen Werte holen
Im Bereich **WhatsApp → API-Einrichtung** findest du:

| Wert | Wo | Beispiel |
|------|-----|----------|
| **Phone Number ID** | unter deiner Nummer ("Telefonnummer-ID") | `123456789012345` |
| **Temporärer Access Token** | oben, "Vorübergehender Zugriffsschlüssel" | `EAAG...` (gültig 24h) |

> Der temporäre Token ist nur 24h gültig — gut zum Testen. Für den Dauerbetrieb brauchst du einen **permanenten Token** (Schritt A6).

📋 **Notiere dir die Phone Number ID** — die brauchst du gleich in N8N.

### Schritt A6 — Permanenten Access Token erstellen (für Dauerbetrieb)
> Ohne diesen Schritt hört der Versand nach 24h auf zu funktionieren.

1. Gehe zu **https://business.facebook.com/settings**.
2. Links → **Benutzer** → **Systembenutzer**.
3. **Hinzufügen** → Name (z.B. `dashboard-bot`), Rolle **Admin** → erstellen.
4. Beim Systembenutzer auf **Assets zuweisen** → wähle deine **App** und deinen **WhatsApp-Account (WABA)** → volle Kontrolle/Verwalten aktivieren.
5. Auf **Token generieren** klicken:
   - App auswählen
   - **Ablauf: Nie** (permanent)
   - Berechtigungen anhaken: **`whatsapp_business_messaging`** und **`whatsapp_business_management`**
   - **Token generieren**
6. ⚠️ **Kopiere den Token SOFORT und sicher** (z.B. in deinen Passwort-Manager). Er wird nur **einmal** angezeigt. Beginnt mit `EAA...`.

📋 **Diesen permanenten Token brauchst du in N8N.**

---

# TEIL B — N8N-Workflow bauen

> Hinweis: Ich (Claude) darf N8N-Workflows nur lesen, nicht selbst erstellen. Deshalb baust du den Workflow
> hier manuell — ist mit dieser Anleitung in ~10 Minuten erledigt.

### Schritt B1 — Credential für WhatsApp anlegen
1. Öffne **https://n8n.primehubgbr.com**, melde dich an.
2. Links unten → **Credentials** → **Add Credential** (oder oben rechts "+").
3. Suche nach **WhatsApp** → wähle **"WhatsApp API"** (das ist die Credential für die "WhatsApp Business Cloud"-Node).
4. Felder ausfüllen:
   - **Access Token:** dein **permanenter Token** aus Schritt A6 (`EAA...`)
   - **Business Account ID:** deine WABA-ID (findest du in Meta unter WhatsApp → API-Einrichtung, "WhatsApp Business Account ID")
5. **Save**.

### Schritt B2 — Neuen Workflow anlegen
1. Oben links **Workflows** → **Add Workflow** (oder "+ New").
2. Benenne ihn oben: **`[Dashboard] WhatsApp Send`**.

### Schritt B3 — Node 1: Webhook (Empfang vom Dashboard)
1. Klicke auf das große **"+"** in der Mitte → suche **Webhook** → auswählen.
2. Einstellungen rechts:
   - **HTTP Method:** `POST`
   - **Path:** `whatsapp-send`
   - **Respond:** `Using 'Respond to Webhook' Node`
3. Schließe das Panel (Werte werden automatisch gehalten).

> Die fertige Webhook-URL wird später: `https://n8n.primehubgbr.com/webhook/whatsapp-send`

### Schritt B4 — Node 2: Respond to Webhook (sofort antworten)
1. Hinter dem Webhook auf **"+"** → suche **Respond to Webhook** → auswählen.
2. Einstellungen:
   - **Respond With:** `Text` (oder `JSON`)
   - Bei Text einfach `OK` eintragen.
3. So antwortet N8N dem Dashboard sofort — das Dashboard wartet nicht auf den eigentlichen Versand.

### Schritt B5 — Node 3: WhatsApp Business Cloud (Nachricht senden)
1. Hinter "Respond to Webhook" auf **"+"** → suche **WhatsApp Business Cloud** → auswählen.
2. Oben **Credential** → wähle die in B1 erstellte WhatsApp-Credential.
3. Einstellungen:
   - **Resource:** `Message`
   - **Operation:** `Send`
   - **Sender Phone Number (or ID):** wähle deine Nummer aus der Liste (das ist die **Phone Number ID**)
   - **Recipient's Phone Number:** klicke auf das Ausdruck-Feld (fx) und trage ein:
     ```
     {{ $('Webhook').first().json.body.phone.replace('+','') }}
     ```
     *(Das `.replace('+','')` entfernt das Plus — die Meta-API will nur Ziffern.)*
   - **Message Type:** `Text`
   - **Text Body:** Ausdruck (fx):
     ```
     {{ $('Webhook').first().json.body.message }}
     ```

### Schritt B6 — Node 4: HTTP Request (Erfolgs-Callback ans Dashboard)
1. Hinter der WhatsApp-Node auf **"+"** → suche **HTTP Request** → auswählen.
2. Einstellungen:
   - **Method:** `PATCH`
   - **URL:** Ausdruck (fx):
     ```
     https://dashboard.primehubgbr.com/api/kommunikation/{{ $('Webhook').first().json.body.log_id }}
     ```
   - **Send Body:** aktivieren (Toggle an)
   - **Body Content Type:** `JSON`
   - **Specify Body:** `Using JSON` → Feld:
     ```json
     { "status": "sent" }
     ```

### Schritt B7 — Fehler-Callback (damit Fehlschläge in der Historie erscheinen)
> Optional, aber empfohlen — sonst bleiben fehlgeschlagene Nachrichten im Dashboard auf "pending".

1. Klicke auf die **WhatsApp Business Cloud**-Node → Reiter **Settings** (Zahnrad im Node-Panel).
2. Setze **On Error** auf `Continue (using error output)`.
   - Die Node bekommt dadurch einen zweiten (roten) Ausgang.
3. Füge an den roten Ausgang eine **zweite HTTP Request**-Node an:
   - **Method:** `PATCH`
   - **URL:**
     ```
     https://dashboard.primehubgbr.com/api/kommunikation/{{ $('Webhook').first().json.body.log_id }}
     ```
   - **Send Body:** an, **JSON**:
     ```json
     { "status": "failed", "error_message": "WhatsApp-Versand fehlgeschlagen" }
     ```

### Schritt B8 — Speichern & Aktivieren
1. Oben rechts **Save**.
2. Schalter oben rechts auf **Active** stellen (grün).
3. Klicke auf die **Webhook**-Node → kopiere die **Production URL** (sollte
   `https://n8n.primehubgbr.com/webhook/whatsapp-send` sein).

📋 **Diese Webhook-URL brauchst du im nächsten Teil.**

---

# TEIL C — Dashboard mit N8N verbinden

Das Dashboard liest die Webhook-URL aus der Umgebungsvariable `N8N_WHATSAPP_WEBHOOK_URL`.

### Schritt C1 — In Vercel eintragen (Produktion)
1. Gehe zu **https://vercel.com** → dein Projekt **Dashboard v2**.
2. **Settings** → **Environment Variables**.
3. **Add New:**
   - **Key:** `N8N_WHATSAPP_WEBHOOK_URL`
   - **Value:** `https://n8n.primehubgbr.com/webhook/whatsapp-send`
   - **Environments:** Production (und Preview, falls du dort testen willst)
4. **Save**.
5. ⚠️ Vercel übernimmt neue Env-Variablen erst nach einem **Redeploy**: **Deployments** → neuestes Deployment → **⋯** → **Redeploy**.

### Schritt C2 — Lokal eintragen (optional, fürs Entwickeln)
In `c:\Users\cetin\Dashboard v2\.env.local` ergänzen:
```
N8N_WHATSAPP_WEBHOOK_URL=https://n8n.primehubgbr.com/webhook/whatsapp-send
```
Danach `npm run dev` neu starten.

---

# TEIL D — Testen

### Schritt D1 — 24h-Fenster öffnen
> Da wir mit freiem Text starten, muss der Empfänger zuerst schreiben.
1. Schicke von deinem privaten Handy eine WhatsApp ("Hallo" o.ä.) an deine **neue Business-Nummer**.
2. Damit ist für diese Nummer 24h lang freier Text erlaubt.

### Schritt D2 — Im Dashboard senden
1. Stelle sicher, dass dein Test-Mitarbeiter im Dashboard eine **Telefonnummer im Format `+49...`** hinterlegt hat (Tab **Organisation**).
2. Öffne **https://dashboard.primehubgbr.com/dashboard/kommunikation**.
3. Empfänger wählen → Text schreiben → **Senden**.
4. Erwartung:
   - Toast "Nachricht gesendet"
   - WhatsApp kommt auf dem Handy an 📱
   - In der **Versandhistorie** steht der Eintrag auf **Gesendet ✅**

### Schritt D3 — Fehlersuche, falls etwas klemmt
| Symptom | Ursache & Lösung |
|---------|------------------|
| Dashboard zeigt "WhatsApp nicht konfiguriert" (gelber Banner) | `N8N_WHATSAPP_WEBHOOK_URL` fehlt in Vercel oder kein Redeploy gemacht → Teil C |
| Historie bleibt auf "pending" | Callback-Node (B6) prüfen: URL korrekt? `log_id` richtig referenziert? |
| Historie zeigt "failed" | In N8N: Workflow öffnen → **Executions** → letzten Lauf öffnen → WhatsApp-Node-Fehler ansehen. Häufig: Nummer nicht im 24h-Fenster (→ Template nötig, Teil E) oder Token abgelaufen (→ permanenter Token, A6) |
| WhatsApp-Node Fehler "Recipient phone number not in allowed list" | Nur bei Meta-**Test**-Nummer: Empfänger muss in Meta unter "An Telefonnummer senden" freigeschaltet sein. Mit deiner echten Nummer entfällt das. |
| Fehler "131030 / re-engagement message" | 24h-Fenster zu → Empfänger muss erst schreiben, oder Template nutzen (Teil E) |

---

# TEIL E — Templates für proaktiven Versand (optional, später)

> Nötig, wenn du Mitarbeitern schreiben willst, OHNE dass sie vorher geschrieben haben
> (z.B. automatische Aufgaben-Erinnerungen). Bis dahin reicht Teil A–D.

### E1 — Template in Meta erstellen
1. **https://business.facebook.com** → **WhatsApp-Manager** → **Nachrichtenvorlagen** → **Vorlage erstellen**.
2. Kategorie: **Utility** (für Benachrichtigungen/Erinnerungen).
3. Name z.B. `mitarbeiter_info`, Sprache **Deutsch**.
4. Body mit Platzhalter, z.B.:
   ```
   Hallo {{1}}, neue Info aus dem Dashboard:

   {{2}}
   ```
5. Beispielwerte angeben, **Absenden zur Prüfung**. Genehmigung dauert meist Minuten bis Stunden.

### E2 — Workflow erweitern
> Wenn du so weit bist, sag mir Bescheid — dann gebe ich dir die genaue Schritt-für-Schritt-Anleitung,
> wie du in N8N von "Send" auf "Send Template" umstellst und die Platzhalter `{{1}}`/`{{2}}`
> mit Name + Nachricht aus dem Dashboard füllst. Eventuell passen wir dann auch die
> Dashboard-Sendelogik leicht an (Name mitschicken).

---

## Checkliste (zum Abhaken)

- [ ] A2 Meta-App erstellt
- [ ] A3 WhatsApp-Produkt hinzugefügt
- [ ] A4 Nummer migriert/verifiziert + Display-Name genehmigt
- [ ] A5 Phone Number ID notiert
- [ ] A6 Permanenten Token erstellt & sicher gespeichert
- [ ] B1 WhatsApp-Credential in N8N angelegt
- [ ] B2–B8 Workflow gebaut, gespeichert, aktiv
- [ ] B8 Webhook-URL kopiert
- [ ] C1 `N8N_WHATSAPP_WEBHOOK_URL` in Vercel + Redeploy
- [ ] D Erfolgreicher Testversand
- [ ] (später) E Templates für proaktiven Versand
