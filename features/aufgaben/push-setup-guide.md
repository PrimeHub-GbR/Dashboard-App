# Push-Benachrichtigungen für Aufgaben — Setup-Anleitung (Phase 3)

> Ziel: Wenn der Chef in der App eine Aufgabe einem Mitarbeiter zuweist,
> bekommt dieser Mitarbeiter sofort eine Push-Nachricht aufs Handy —
> auch wenn die App geschlossen ist.

## Wie das technisch funktioniert (in 3 Sätzen)

1. Jedes Handy meldet beim App-Start einen eindeutigen **Geräte-Token** an unsere Datenbank (Tabelle `device_tokens`).
2. Beim Zuweisen einer Aufgabe ruft die App eine kleine Server-Funktion (`notify-task-assigned`) auf.
3. Diese Funktion schickt über **Firebase Cloud Messaging (FCM)** — Googles kostenlosen Push-Dienst — die Nachricht an die Tokens der zugewiesenen Mitarbeiter.

```
App (Chef weist zu) → Edge Function → Firebase (FCM) → Handy des Mitarbeiters
                                          ↑
                          braucht: APNs-Key (iOS) + FCM-Zugang
```

**Kosten:** Firebase Cloud Messaging ist komplett kostenlos, unbegrenzt.

---

## Aufgabenteilung

- **Du machst:** Teile A–E (Konten/Konsolen-Klicks). Reine Web-Oberflächen, kein Code.
- **Ich mache danach:** Teil F (gesamter Code — DB-Tabelle, App-Integration, Server-Funktion).

Du musst mir am Ende **3 Dateien/Werte** geben (siehe Teil E).

---

## Teil A — Firebase-Projekt anlegen

1. Öffne **https://console.firebase.google.com** und melde dich mit deinem Google-Konto an (am besten `primehubgbr@gmail.com`).
2. Klicke auf **„Projekt hinzufügen"** (Add project).
3. Projektname: `PrimeHub` (oder `primehub-app`) → **Weiter**.
4. Google Analytics: kannst du **deaktivieren** (Schalter aus) — wird für Push nicht gebraucht → **Weiter / Projekt erstellen**.
5. Warte ~30 Sek, bis „Dein Projekt ist bereit" erscheint → **Weiter**.

✅ Du bist jetzt im Firebase-Dashboard deines Projekts.

---

## Teil B — Android-App registrieren

1. Im Firebase-Dashboard auf das **Android-Symbol** klicken (oder Zahnrad ⚙️ → „Projekteinstellungen" → Reiter „Allgemein" → „App hinzufügen" → Android).
2. **Android-Paketname** (ganz wichtig, exakt): `de.primehubgbr.primehub_app`
   - ⚠️ Falls Firebase eine Fehlermeldung zum Format zeigt, gib mir Bescheid — ich prüfe den genauen `applicationId` aus `android/app/build.gradle`.
3. App-Spitzname: `PrimeHub Android` (egal).
4. SHA-1: **leer lassen** (für Push nicht nötig) → **App registrieren**.
5. **Datei `google-services.json` herunterladen** → speichere sie sicher, die brauche ich.
6. Die nächsten Schritte „SDK hinzufügen" im Assistenten kannst du **überspringen** (mache ich im Code) → **Weiter / Zur Konsole**.

📁 **Ergebnis: `google-services.json`** (Datei 1 für mich)

---

## Teil C — iOS-App registrieren

1. Im Firebase-Dashboard ⚙️ → „Projekteinstellungen" → „App hinzufügen" → **iOS-Symbol**.
2. **Apple-Bundle-ID** (exakt): `de.primehubgbr.primehubApp`
   - (Das ist genau die Bundle-ID aus deinem Apple-Account / TestFlight.)
3. App-Spitzname: `PrimeHub iOS` → **App registrieren**.
4. **Datei `GoogleService-Info.plist` herunterladen** → sicher speichern, brauche ich.
5. Restliche Assistenten-Schritte **überspringen** → **Zur Konsole**.

📁 **Ergebnis: `GoogleService-Info.plist`** (Datei 2 für mich)

---

## Teil D — APNs-Key für iOS-Push (Apple → Firebase)

iOS-Push geht **nur** über Apples eigenen Dienst (APNs). Firebase braucht dafür einen Schlüssel von dir.

### D.1 — APNs-Key bei Apple erstellen
1. Öffne **https://developer.apple.com/account** → links **„Certificates, IDs & Profiles"**.
2. Links **„Keys"** → blaues **➕** (neuen Key erstellen).
3. Key Name: `PrimeHub Push` (egal).
4. Häkchen bei **„Apple Push Notifications service (APNs)"** setzen → **Continue** → **Register**.
5. **„Download"** klicken → du bekommst eine Datei `AuthKey_XXXXXXXXXX.p8`.
   - ⚠️ **Nur einmal herunterladbar!** Sicher aufbewahren.
6. Notiere dir zwei Werte von dieser Seite:
   - **Key ID** (die 10 Zeichen `XXXXXXXXXX` im Dateinamen)
   - **Team ID** (steht oben rechts in deinem Apple-Account, 10 Zeichen)

### D.2 — Push für die App-ID aktivieren (falls noch nicht)
1. Bei Apple unter „Identifiers" deine App-ID `de.primehubgbr.primehubApp` öffnen.
2. Prüfen, dass **„Push Notifications"** in der Liste angehakt ist. Falls nicht: anhaken → **Save**.
   - (Hinweis: Das kann eine neue Signierung beim nächsten iOS-Build erfordern — das regle ich/wir beim Codemagic-Build.)

### D.3 — APNs-Key in Firebase hochladen
1. Zurück in Firebase: ⚙️ → „Projekteinstellungen" → Reiter **„Cloud Messaging"**.
2. Abschnitt **„Apple app configuration"** → **„APNs Authentication Key"** → **Upload**.
3. Lade die `.p8`-Datei hoch und trage **Key ID** + **Team ID** (aus D.1) ein → **Upload**.

✅ iOS-Push ist jetzt mit Firebase verbunden.

---

## Teil E — Server-Zugang für den Versand (Service Account)

Damit unsere Server-Funktion Pushes senden darf, braucht sie einen geheimen Schlüssel.

1. In Firebase: ⚙️ → **„Projekteinstellungen"** → Reiter **„Dienstkonten" / „Service accounts"**.
2. Button **„Neuen privaten Schlüssel generieren"** (Generate new private key) → **Schlüssel generieren**.
3. Es lädt eine **JSON-Datei** herunter (z. B. `primehub-firebase-adminsdk-xxxx.json`).
   - ⚠️ **Streng geheim** — niemals ins GitHub-Repo, niemals weitergeben. Kommt nur in die Supabase-Secrets (mache ich).

📁 **Ergebnis: Service-Account-JSON** (Datei 3 für mich)

---

## Teil F — Was ich danach baue (Code, autonom)

Sobald du mir die **3 Dateien** gibst, baue ich ohne weitere Klicks von dir:

1. **DB-Migration:** Tabelle `device_tokens` (employee_id, token, platform) mit RLS.
2. **App-Integration:** `firebase_messaging` + `flutter_local_notifications`
   - Token wird beim App-Start registriert und bei Änderung aktualisiert.
   - Push-Empfang im Vordergrund (lokale Notification) + Tippen öffnet die Aufgabe.
   - `google-services.json` → `android/app/`, `GoogleService-Info.plist` → `ios/Runner/`.
3. **Edge Function `notify-task-assigned`** (Supabase): lädt die Tokens der zugewiesenen Mitarbeiter und sendet über FCM HTTP v1. Service-Account-JSON liegt sicher in Supabase-Secrets.
4. **Auslöser:** Die App ruft die Funktion nach dem Zuweisen auf (beim Anlegen/Bearbeiten einer Aufgabe).
5. **Codemagic/iOS:** Push-Capability (`aps-environment`) ins iOS-Projekt eintragen, neuen TestFlight-Build bauen.

---

## Übergabe an mich

Schreib mir einfach: **„Firebase fertig"** und gib mir
- `google-services.json`
- `GoogleService-Info.plist`
- die Service-Account-JSON (oder trag sie selbst als Supabase-Secret ein — sag ich dir dann wie)

Dann baue ich Phase 3 fertig.

---

## Reihenfolge / Aufwand

| Teil | Wo | Zeit |
|------|-----|------|
| A Firebase-Projekt | Firebase Console | 3 Min |
| B Android-App | Firebase Console | 3 Min |
| C iOS-App | Firebase Console | 3 Min |
| D APNs-Key | Apple + Firebase | 10 Min |
| E Service Account | Firebase Console | 2 Min |
| **F Code** | **ich** | — |

Gesamt für dich: ~20 Minuten reine Web-Klicks.
