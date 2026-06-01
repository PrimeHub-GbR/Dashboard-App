# Supabase-Setup für den App-Einladungs-/Passwort-Flow

Damit Einladung + Passwort-Reset funktionieren, müssen **zwei** Dinge im
Supabase-Dashboard konfiguriert werden (einmalig, manuell — per API nicht möglich).

## 1. Redirect-URL freischalten (KRITISCH — sonst 404/Fehler beim Link-Klick)

Supabase Dashboard → **Authentication → URL Configuration**
- **Site URL:** `https://dashboard.primehubgbr.com`
- **Redirect URLs** → hinzufügen: `https://dashboard.primehubgbr.com/portal/welcome`

Ohne diesen Eintrag lehnt Supabase den Link aus der E-Mail ab.

## 2. E-Mail-Templates branden (optional, aber empfohlen)

Supabase Dashboard → **Authentication → Emails**

| Template | Datei | Betreff-Vorschlag |
|----------|-------|-------------------|
| **Invite user** | `invite.html` | `Willkommen bei PrimeHub – Zugang aktivieren` |
| **Reset Password** | `recovery.html` | `PrimeHub – Passwort zurücksetzen` |

Jeweils den HTML-Inhalt der Datei in **Message body (HTML)** einfügen und speichern.

Die Templates nutzen `{{ .TokenHash }}` und zeigen auf
`/portal/welcome?token_hash=…&type=invite|recovery` — passend zur Passwort-Seite.

> Auch ohne Template-Anpassung funktioniert der Flow (die Welcome-Seite fängt
> den Standard-Link über `detectSessionInUrl` ab) — die Branded-Templates sind
> nur für die Optik. Schritt 1 (Redirect-URL) ist dagegen zwingend.
