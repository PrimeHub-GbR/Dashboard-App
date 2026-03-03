# PROJ-5: Dashboard-Navigation (Shell)

## Status: Planned
**Created:** 2026-03-03
**Last Updated:** 2026-03-03

## Dependencies
- Requires: PROJ-4 (Login / Authentifizierung) — User muss eingeloggt sein

## Übersicht

Persistente Sidebar-Navigation auf allen `/dashboard/*` Seiten. Zeigt Links zu allen Features, hebt die aktive Seite hervor, zeigt User-Email und enthält den Logout-Button. Ersetzt das bestehende leere `dashboard/layout.tsx`.

## Navigation-Items

| Menüpunkt | Route | Rollen |
|-----------|-------|--------|
| Workflow Hub | `/dashboard/workflow-hub` | Admin, Staff |
| Bestellungen | `/dashboard/orders` | Admin, Staff |
| Preisdatenbank | `/dashboard/prices` | Admin, Staff |

## User Stories

- Als eingeloggter User möchte ich eine Sidebar sehen, die mich zu allen Features navigiert
- Als Admin möchte ich alle Menüpunkte sehen
- Als Staff möchte ich nur die freigegebenen Menüpunkte sehen (derzeit alle gleich)
- Als User möchte ich auf einen Blick sehen, auf welcher Seite ich mich befinde (aktiver State)
- Als User möchte ich meine Email-Adresse und einen Logout-Button in der Sidebar sehen

## Acceptance Criteria

- [ ] Gegeben ein eingeloggter User auf einer beliebigen `/dashboard/*` Route, dann ist die Sidebar sichtbar
- [ ] Gegeben die aktuelle Route `/dashboard/workflow-hub`, dann ist "Workflow Hub" visuell hervorgehoben
- [ ] Gegeben ein Klick auf einen Menüpunkt, dann navigiert der User zur entsprechenden Route
- [ ] Gegeben ein Klick auf "Abmelden", dann wird die Supabase-Session gelöscht und der User zu `/` weitergeleitet
- [ ] Gegeben die User-Email ist in der Session, dann wird sie am unteren Rand der Sidebar angezeigt
- [ ] Gegeben Routes für PROJ-2/3 noch nicht gebaut (`/dashboard/orders`, `/dashboard/prices`), dann zeigen diese Seiten einen Placeholder "Demnächst verfügbar"
- [ ] Auf Mobile (375px): Sidebar ist per Hamburger-Button ein-/ausklappbar
- [ ] Auf Desktop (1024px+): Sidebar ist immer sichtbar

## Edge Cases

- **User-Rolle nicht in DB**: Fallback auf Staff-Rechte (kein Fehler)
- **Session während Navigation abgelaufen**: Middleware übernimmt → Redirect zu `/`
- **Sidebar-Zustand**: Wird nicht persistiert — Desktop immer offen, Mobile immer geschlossen beim Laden
- **Placeholder-Seiten**: `/dashboard/orders` und `/dashboard/prices` werden als eigene `page.tsx` angelegt mit "Demnächst verfügbar" Message — kein 404
- **Layout-Konsistenz**: `<Toaster>` aus dem bisherigen Dashboard-Layout bleibt erhalten

## Technical Requirements

- **Datei**: `src/app/dashboard/layout.tsx` (wird überschrieben)
- **Neue Dateien**: `src/app/dashboard/orders/page.tsx`, `src/app/dashboard/prices/page.tsx` (Placeholder)
- **Komponenten**: shadcn/ui `Sidebar` (bereits installiert unter `src/components/ui/sidebar.tsx`)
- **Auth-Info**: User-Email via `supabase.auth.getUser()` oder aus Supabase Session Context
- **Logout**: `supabase.auth.signOut()` → `window.location.href = '/'`
- **Aktiv-Erkennung**: `usePathname()` aus Next.js
- **Responsive**: shadcn/ui Sidebar hat eingebaute Mobile-Support via `SidebarProvider`

---
<!-- Sections below are added by subsequent skills -->
