# PROJ-5: Dashboard-Navigation (Shell)

## Status: Deployed
**Created:** 2026-03-03
**Last Updated:** 2026-03-04

## Dependencies
- Requires: PROJ-4 (Login / Authentifizierung) — User muss eingeloggt sein

## Übersicht

Persistente Sidebar-Navigation auf allen `/dashboard/*` Seiten. Zeigt Links zu allen Features, hebt die aktive Seite hervor, zeigt User-Email und enthält den Logout-Button. Ersetzt das bestehende leere `dashboard/layout.tsx`.

## Navigation-Items

| Menüpunkt | Route | Rollen |
|-----------|-------|--------|
| Workflow Hub | `/dashboard/workflow-hub` | Admin, Staff |
| Workflow Monitor | `/dashboard/workflows` | Admin, Staff |
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

## QA Test Results

**Tested:** 2026-03-04
**App URL:** http://localhost:3000
**Tester:** QA Engineer (AI)
**Build Status:** PASS (Next.js build compiles with 0 errors)

### Acceptance Criteria Status

#### AC-1: Sidebar visible on all /dashboard/* routes
- [x] `DashboardSidebar` is rendered in `src/app/dashboard/layout.tsx` which wraps all `/dashboard/*` routes
- [x] Verified: `/dashboard/workflow-hub`, `/dashboard/workflows`, `/dashboard/orders`, `/dashboard/prices` all share the same layout with sidebar
- **PASS**

#### AC-2: Active route highlighting for current page
- [x] `usePathname()` is used to get the current route
- [x] `isActive={pathname === item.href}` correctly compares exact route match
- [ ] BUG: Active state uses exact match (`===`) which will NOT highlight parent routes. If a user navigates to a sub-route (e.g., `/dashboard/workflow-hub/something`), the "Workflow Hub" item will NOT be highlighted. See BUG-1.
- **PASS (for current routes, but fragile for future sub-routes)**

#### AC-3: Click on menu item navigates to correct route
- [x] Each `SidebarMenuItem` wraps a Next.js `<Link href={item.href}>` which handles client-side navigation
- [x] All 4 nav items (Workflow Hub, Workflow Monitor, Bestellungen, Preisdatenbank) have correct routes matching the spec
- **PASS**

#### AC-4: Logout button clears session and redirects to /
- [x] `handleLogout` calls `supabase.auth.signOut()` then `window.location.href = '/'`
- [x] Uses `window.location.href` (not `router.push`) as required by frontend rules
- [ ] BUG: No error handling on `signOut()`. If the sign-out request fails (network error), the user is still redirected to `/` with an active session. See BUG-2.
- **PASS (happy path works, error path is unhandled)**

#### AC-5: User email displayed at bottom of sidebar
- [x] `userEmail` is fetched server-side via `supabase.auth.getUser()` in `layout.tsx` and passed as prop
- [x] Email displayed in `SidebarFooter` with `text-xs text-muted-foreground truncate` styling
- [x] `truncate` class handles long email addresses properly
- **PASS**

#### AC-6: Placeholder pages for /dashboard/orders and /dashboard/prices
- [x] `src/app/dashboard/orders/page.tsx` exists with "Demnachst verfugbar" message
- [x] `src/app/dashboard/prices/page.tsx` exists with "Demnachst verfugbar" message
- [x] Both render proper headings ("Bestellungen" / "Preisdatenbank") and placeholder text
- [x] No 404 returned -- confirmed in build output as dynamic routes
- **PASS**

#### AC-7: Mobile (375px) - Sidebar collapsible via hamburger button
- [x] `SidebarTrigger` (hamburger button) is rendered in the layout header with `lg:hidden` class
- [x] shadcn/ui Sidebar uses `Sheet` (drawer overlay) for mobile via `useIsMobile()` hook
- [ ] BUG: Mobile breakpoint mismatch. The `useIsMobile()` hook uses 768px as the breakpoint, but the hamburger button visibility uses `lg:hidden` (1024px). Between 768px-1023px, the sidebar is permanently visible (as desktop) but there is no hamburger trigger visible either -- this is actually fine because at 768px+ the sidebar shows as desktop. However, the spec says "Mobile (375px)" which is well below 768px. See BUG-3 for the breakpoint discrepancy with the spec's "Desktop (1024px+)" requirement.
- **PASS (at 375px, hamburger works correctly)**

#### AC-8: Desktop (1024px+) - Sidebar always visible
- [x] shadcn/ui Sidebar component shows the sidebar as a persistent panel on `md:` breakpoint (768px+) using `md:block` and `md:flex` classes
- [ ] BUG: The spec says "Desktop (1024px+)" but the sidebar becomes always-visible at 768px (md breakpoint), not 1024px. This is actually BETTER than spec (visible sooner), but is a discrepancy. The header hamburger trigger uses `lg:hidden` (hidden at 1024px+) creating a 768-1023px zone where BOTH the sidebar AND the hamburger could theoretically conflict. See BUG-3.
- **PASS (sidebar is visible at 1024px+, and also visible at 768px+)**

### Edge Cases Status

#### EC-1: User role not in DB - Fallback to Staff
- [x] The DashboardSidebar component does NOT check roles at all -- all 4 nav items are shown to every user regardless of role
- [x] This effectively means staff and admin see the same navigation, which matches the spec ("derzeit alle gleich")
- [x] No error is thrown if user has no role entry
- **PASS**

#### EC-2: Session expired during navigation - Middleware redirect
- [x] Middleware at `src/middleware.ts` checks `supabase.auth.getUser()` on every `/dashboard/:path*` request
- [x] If no user found, redirects to `/` (login page)
- **PASS**

#### EC-3: Sidebar state not persisted
- [x] On mobile, `openMobile` state starts as `false` (closed by default) -- confirmed in `SidebarProvider`
- [x] On desktop, `defaultOpen = true` -- sidebar starts expanded
- [ ] NOTE: The shadcn/ui sidebar DOES persist state via a cookie (`sidebar_state`). This contradicts the spec which says "Wird nicht persistiert." This is not a bug per se since the cookie persistence is a built-in shadcn feature, but it deviates from spec. See BUG-4.
- **PASS (behavior is acceptable, but deviates from spec)**

#### EC-4: Placeholder pages render without 404
- [x] Both `/dashboard/orders` and `/dashboard/prices` have dedicated `page.tsx` files
- [x] Build output confirms they are valid dynamic routes
- **PASS**

#### EC-5: Toaster preserved from original layout
- [x] `<Toaster richColors position="top-right" />` is present in the dashboard layout
- **PASS**

### Additional Edge Cases (Discovered During Testing)

#### EC-6: No dashboard root page (/dashboard)
- [ ] BUG: There is no `src/app/dashboard/page.tsx`. Navigating to `/dashboard` will show a 404 or empty page. The middleware redirects logged-in users from `/` to `/dashboard/workflow-hub`, so this is rarely hit, but if a user manually types `/dashboard` they get no content. See BUG-5.

#### EC-7: Email not displayed when null
- [x] The email display is conditionally rendered with `{userEmail && (...)}` -- if null, no email shown, no crash
- **PASS**

### Security Audit Results

#### Authentication
- [x] Dashboard layout fetches user via `supabase.auth.getUser()` server-side
- [x] Middleware protects all `/dashboard/:path*` routes -- unauthenticated users are redirected
- [x] Logout uses `supabase.auth.signOut()` which clears the Supabase session cookie
- **PASS**

#### Authorization
- [x] All nav items are visible to all roles (by design -- spec says "derzeit alle gleich")
- [x] No role-based route protection in the sidebar itself (individual pages like `/dashboard/workflows` handle their own role checks)
- **PASS**

#### Input Injection (XSS)
- [x] The logout button does not accept user input
- [x] User email is rendered as text content (not `dangerouslySetInnerHTML`) -- safe from XSS
- [x] Navigation items are hardcoded constants -- no user-controlled data in nav
- **PASS**

#### Sensitive Data Exposure
- [x] `SUPABASE_SERVICE_ROLE_KEY` is only used in `supabase-server.ts` (server-side) -- never exposed to client
- [x] Only `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are exposed to browser (expected)
- [x] User email in the sidebar is fetched server-side and rendered in HTML -- not leaked via extra API calls
- **PASS**

#### Security Headers
- [x] `X-Frame-Options: DENY` configured in `next.config.ts`
- [x] `X-Content-Type-Options: nosniff` configured
- [x] `Referrer-Policy: origin-when-cross-origin` configured
- [x] `Strict-Transport-Security` with `includeSubDomains` and `preload` configured
- **PASS**

#### Rate Limiting
- [x] The sidebar/navigation itself does not make API calls (no rate limiting concern)
- [x] Logout is a single client-side Supabase call -- low abuse risk
- **PASS**

### Cross-Browser Testing (Code Review)
- [x] Chrome: Uses standard CSS flexbox, Radix UI primitives, standard `matchMedia` API -- no compatibility issues expected
- [x] Firefox: Same standards-based approach -- no Firefox-specific issues identified
- [x] Safari: Uses `h-svh` (viewport height) which Safari supports since v15.4 -- compatible
- NOTE: Full browser testing requires manual verification in each browser with a running instance

### Responsive Testing (Code Review)
- [x] 375px (Mobile): Sidebar hidden by default, hamburger trigger visible, opens as Sheet/drawer overlay
- [x] 768px (Tablet): Sidebar becomes persistent panel (md breakpoint), hamburger trigger hidden at lg (1024px)
- [x] 1440px (Desktop): Sidebar always visible, full width layout with SidebarInset content area

### Bugs Found

#### BUG-1: Active state uses exact match -- fragile for future sub-routes
- **Severity:** Low
- **Steps to Reproduce:**
  1. Navigate to any `/dashboard/workflow-hub/sub-page` (hypothetical future route)
  2. Expected: "Workflow Hub" nav item is highlighted
  3. Actual: No nav item is highlighted because `pathname === item.href` is an exact match, not a `startsWith` match
- **Priority:** Nice to have (no sub-routes exist currently, but should be fixed before sub-routes are added)

#### BUG-2: Logout has no error handling
- **Severity:** Low
- **Steps to Reproduce:**
  1. Disconnect network / simulate offline state
  2. Click "Abmelden" in the sidebar
  3. Expected: Error message shown, user stays on dashboard
  4. Actual: `signOut()` fails silently, then `window.location.href = '/'` executes, redirecting to login. On page load, middleware may redirect back to dashboard (session cookie still valid), creating a loop.
- **Priority:** Fix in next sprint

#### BUG-3: Mobile/Desktop breakpoint mismatch between spec and implementation
- **Severity:** Low
- **Steps to Reproduce:**
  1. Spec says "Desktop (1024px+)" for always-visible sidebar
  2. Implementation shows sidebar as always-visible at 768px+ (md breakpoint from shadcn/ui)
  3. The hamburger trigger in `layout.tsx` uses `lg:hidden` (hidden at 1024px+)
  4. Between 768-1023px: sidebar is visible as a panel AND the hamburger trigger is also visible
- **Impact:** At 768-1023px, the user sees both a persistent sidebar and a hamburger button (the hamburger toggles collapse/expand of the already-visible sidebar, which is actually fine UX). The spec just expected the cutoff at 1024px rather than 768px.
- **Priority:** Nice to have (current behavior is arguably better)

#### BUG-4: Sidebar state IS persisted via cookie (contradicts spec)
- **Severity:** Low
- **Steps to Reproduce:**
  1. On desktop, collapse the sidebar (Ctrl+B shortcut)
  2. Refresh the page
  3. Expected (per spec): Sidebar should be open (spec says "Wird nicht persistiert")
  4. Actual: Sidebar remembers collapsed state via `sidebar_state` cookie (shadcn/ui built-in behavior)
- **Priority:** Nice to have (the actual behavior is arguably better UX than the spec)

#### BUG-5: Missing /dashboard root page
- **Severity:** Medium
- **Steps to Reproduce:**
  1. Navigate directly to `http://localhost:3000/dashboard`
  2. Expected: Either a redirect to `/dashboard/workflow-hub` or a meaningful page
  3. Actual: Shows the dashboard layout (sidebar + content area) but with no page content (likely a Next.js 404 inside the content area)
- **Priority:** Fix before deployment (add a redirect or a root dashboard page)

#### BUG-6: INDEX.md status is "Planned" but feature is implemented
- **Severity:** Medium
- **Steps to Reproduce:**
  1. Open `features/INDEX.md`
  2. PROJ-5 status shows "Planned"
  3. Actual: The feature is fully implemented and functional
- **Priority:** Fix before deployment (update status to reflect reality)

#### BUG-7: Logout button uses plain `<button>` instead of shadcn/ui Button
- **Severity:** Low
- **Steps to Reproduce:**
  1. Inspect the "Abmelden" button in the sidebar footer
  2. Expected: Uses `<Button>` from `@/components/ui/button` per frontend rules ("NEVER create custom implementations of: Button...")
  3. Actual: Uses a plain `<button>` with custom Tailwind classes
- **Priority:** Nice to have (functional but violates project convention)

### Regression Testing

#### PROJ-1: Workflow Hub (Deployed)
- [x] `/dashboard/workflow-hub` route exists and renders `WorkflowHubClient`
- [x] Page is accessible from sidebar navigation
- **No regression detected**

#### PROJ-4: Login (Deployed)
- [x] Login page at `/` still renders correctly
- [x] Middleware redirects unauthenticated users from `/dashboard/*` to `/`
- [x] Middleware redirects authenticated users from `/` to `/dashboard/workflow-hub`
- [x] Logout flow (`signOut` + redirect) still functional
- **No regression detected**

#### PROJ-7: Workflow Monitor (In Review)
- [x] `/dashboard/workflows` route exists and renders `WorkflowMonitorClient`
- [x] Page is accessible from sidebar navigation
- **No regression detected**

### Summary

- **Acceptance Criteria:** 8/8 passed (all criteria met, with minor caveats noted)
- **Edge Cases:** 5/5 spec'd cases passed + 1 additional case found (BUG-5)
- **Bugs Found:** 7 total (0 critical, 0 high, 2 medium, 5 low)
- **Security:** PASS -- no vulnerabilities found
- **Regression:** PASS -- no regressions on PROJ-1, PROJ-4, PROJ-7
- **Build:** PASS -- compiles with 0 errors
- **Production Ready:** YES (with caveat: fix 2 medium bugs first)
- **Recommendation:** Fix BUG-5 (missing /dashboard page) and BUG-6 (INDEX.md status) before deployment. All other bugs are low severity and can be addressed in a future sprint.
