# PROJ-4: Login / Authentifizierung

## Status: Planned
**Created:** 2026-03-03
**Last Updated:** 2026-03-03

## Dependencies
- Keine (Grundbaustein — wird von allen anderen Features vorausgesetzt)

## Übersicht

Login-Seite auf `/` mit Email + Passwort via Supabase Auth. Single-Tenant — kein Self-Registration, keine Passwort-Vergessen-Funktion im Frontend. Accounts werden manuell im Supabase Dashboard angelegt.

## User Stories

- Als Admin möchte ich mich mit Email + Passwort einloggen, damit ich auf das Dashboard zugreifen kann
- Als eingeloggter User möchte ich automatisch zu `/dashboard/workflow-hub` weitergeleitet werden, wenn ich `/` aufrufe
- Als eingeloggter User möchte ich mich ausloggen können (Logout-Button in der Dashboard-Navigation)
- Als nicht eingeloggter User, der direkt eine Dashboard-URL aufruft, möchte ich zur Login-Seite weitergeleitet werden

## Acceptance Criteria

- [ ] Gegeben ein nicht eingeloggter User auf `/`, dann sieht er ein Formular mit Email-Feld, Passwort-Feld und "Anmelden"-Button
- [ ] Gegeben ungültige Credentials, dann erscheint eine verständliche Fehlermeldung (kein Stack-Trace, keine technischen Details)
- [ ] Gegeben gültige Credentials, wenn der User auf "Anmelden" klickt, dann wird er zu `/dashboard/workflow-hub` weitergeleitet
- [ ] Gegeben ein bereits eingeloggter User, wenn er `/` aufruft, dann wird er sofort zu `/dashboard/workflow-hub` weitergeleitet (kein Login-Formular sichtbar)
- [ ] Gegeben ein eingeloggter User, wenn er auf "Abmelden" klickt, dann wird seine Session gelöscht und er zu `/` weitergeleitet
- [ ] Während des Login-Requests ist der "Anmelden"-Button deaktiviert und zeigt einen Loading-Zustand
- [ ] Es gibt keinen "Registrieren"-Link oder "Passwort vergessen"-Link

## Edge Cases

- **Bereits eingeloggt**: User besucht `/` → sofortiger Redirect zu `/dashboard/workflow-hub`, Login-Formular nicht kurz aufblitzen
- **Session abgelaufen**: Beim nächsten Request → Middleware redirectet zu `/`
- **Netzwerkfehler**: Generische Fehlermeldung "Anmeldung fehlgeschlagen. Bitte versuche es erneut."
- **Enter-Taste**: Formular absenden mit Enter-Taste möglich
- **Passwort vergessen**: Kein Self-Service — Admin nutzt Supabase Dashboard → keine UI dafür
- **Fehlerhafter Email-Format**: Client-seitige Validierung vor Submit

## Technical Requirements

- **Route**: `/` (ersetzt das aktuelle Next.js Starter-Template)
- **Auth-Methode**: `supabase.auth.signInWithPassword({ email, password })`
- **Redirect nach Login**: `window.location.href = '/dashboard/workflow-hub'` (kein router.push — gemäß Frontend Rules)
- **Session-Check**: `supabase.auth.getSession()` beim Seitenaufruf → wenn aktiv → Redirect
- **Komponenten**: shadcn/ui `Card`, `Input`, `Button`, `Label`
- **Kein Self-Registration**: Kein Signup-Endpunkt, kein Registrieren-UI

---
<!-- Sections below are added by subsequent skills -->
