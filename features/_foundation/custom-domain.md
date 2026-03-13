# PROJ-6: Custom Domain Setup — dashboard.primehubgbr.com

**Status**: Deployed
**Created**: 2026-03-04
**Deployed**: 2026-03-04
**Dependencies**: PROJ-4 (Login / Auth), PROJ-1 (Workflow Hub — Deployed)

---

## Overview

Move the production deployment from the auto-generated Vercel URL (`https://app-two-gamma-77.vercel.app`) to the branded subdomain `https://dashboard.primehubgbr.com`.

This is a pure infrastructure task — no source code changes are required.

---

## User Stories

1. **Als Admin** möchte ich das Dashboard unter `dashboard.primehubgbr.com` aufrufen, damit ich eine einheitliche und professionelle URL für alle internen Tools habe.
2. **Als Admin** möchte ich, dass HTTPS automatisch funktioniert, damit keine Sicherheitswarnungen im Browser erscheinen.
3. **Als Admin** möchte ich, dass Login und alle Dashboard-Funktionen nach dem Domain-Wechsel weiterhin fehlerfrei funktionieren.

---

## Acceptance Criteria

| # | Kriterium | Testbar |
|---|-----------|---------|
| AC-1 | `https://dashboard.primehubgbr.com` lädt die App ohne Browser-Warnung | Ja — Browser aufrufen |
| AC-2 | HTTP-Requests werden automatisch auf HTTPS umgeleitet | Ja — `http://dashboard.primehubgbr.com` testen |
| AC-3 | Login mit Email + Passwort funktioniert unter der neuen Domain | Ja — einloggen + prüfen |
| AC-4 | Dashboard-Navigation und alle Seiten laden korrekt | Ja — Seiten durchklicken |
| AC-5 | Workflow Hub: Datei-Upload + n8n-Trigger funktionieren | Ja — Workflow ausführen |
| AC-6 | Die alte Vercel-URL leitet auf die neue Domain weiter (optional) | Ja — alte URL aufrufen |

---

## Implementation Steps (keine Code-Änderungen nötig)

### Schritt 1 — Vercel: Domain hinzufügen
1. Vercel Dashboard → Projekt `app` → **Settings → Domains**
2. **Add** → `dashboard.primehubgbr.com` eingeben
3. Den angezeigten CNAME-Wert kopieren (z. B. `cname.vercel-dns.com`)

### Schritt 2 — Cloudflare: DNS-Eintrag erstellen
> `primehubgbr.com` läuft bereits über Cloudflare (n8n.primehubgbr.com ist aktiv).

| Feld | Wert |
|------|------|
| Type | CNAME |
| Name | `dashboard` |
| Target | `cname.vercel-dns.com` |
| Proxy | **DNS only** (grau) ← kein Cloudflare-Proxy! |

> **Wichtig**: Proxy muss AUS sein, damit Vercel sein eigenes SSL-Zertifikat (Let's Encrypt) ausstellen kann.

### Schritt 3 — Vercel: Domain verifizieren
- Vercel prüft DNS automatisch (bis 5 Min.)
- Sobald grün → TLS-Zertifikat wird ausgestellt → Domain ist live

### Schritt 4 — Supabase Auth: URLs aktualisieren (KRITISCH)
> Ohne diesen Schritt schlägt der Login fehl.

1. Supabase Dashboard → **Authentication → URL Configuration**
2. **Site URL**: `https://dashboard.primehubgbr.com`
3. **Redirect URLs**: `https://dashboard.primehubgbr.com/**` hinzufügen
4. Speichern

### Schritt 5 — n8n Webhooks prüfen
- In n8n prüfen, ob Callback-URLs auf `https://app-two-gamma-77.vercel.app/api/jobs/callback` zeigen
- Falls ja → auf `https://dashboard.primehubgbr.com/api/jobs/callback` aktualisieren

---

## Edge Cases

| Szenario | Erwartetes Verhalten |
|----------|---------------------|
| DNS noch nicht propagiert | Vercel zeigt "Domain not configured yet" — warten |
| Cloudflare Proxy ist AN | Vercel kann kein SSL-Zertifikat ausstellen → Fehler → Proxy ausschalten |
| Supabase Auth nicht aktualisiert | Login schlägt fehl mit "redirect_uri mismatch" |
| n8n Callbacks nicht aktualisiert | Job-Status nach Workflow-Ausführung bleibt "running" |
| Alte Vercel-URL | Vercel kann optional eine Weiterleitung zur neuen Domain einrichten |

---

## Keine Code-Änderungen erforderlich

| Datei | Grund |
|-------|-------|
| `middleware.ts` | Verwendet `request.url` (relativ) — kein Hardcoding |
| `src/lib/supabase*.ts` | Liest aus Env-Vars — keine URL hardcoded |
| `.env.local` | Kein `SITE_URL`-Env-Var im Einsatz |
| `next.config.ts` | Security Headers sind pfadbasiert — kein Domain-Bezug |
