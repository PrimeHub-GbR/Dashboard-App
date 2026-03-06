# PROJ-3: Preisdatenbank (EAN-eindeutige EK-Preis-Übersicht)

## Status: In Review
**Created:** 2026-03-03
**Last Updated:** 2026-03-05

## Dependencies
- PROJ-2 (Bestellungs-Viewer) — Datenquelle: `orders` Tabelle mit EAN und Einkaufspreis

## Übersicht

Zentrale Preisdatenbank aller Produkte. Jede EAN erscheint **genau einmal**. Angezeigt wird immer der **aktuellste Einkaufspreis** (basierend auf `order_date` der Bestellungen). Die ASIN-Zuordnung erfolgt über eine manuell pflegbare Mapping-Tabelle (`ean_asin_map`). Keine Sellerboard-API erforderlich — Daten werden direkt aus der bestehenden `orders` Tabelle aggregiert.

## Datenfluss

```
orders Tabelle (PROJ-2)
  ↓ [PostgreSQL View: current_ek_prices]
  ↓ [LEFT JOIN ean_asin_map]
Dashboard (Preisdatenbank-Ansicht)
```

## User Stories

- Als Admin möchte ich alle Produkte mit EAN, ASIN, aktuellem EK-Preis und Bestelldatum in einer zentralen Tabelle sehen
- Als Admin möchte ich nach EAN oder ASIN suchen, um schnell ein bestimmtes Produkt zu finden
- Als Admin möchte ich die Tabelle als CSV exportieren, um sie extern weiterverarbeiten zu können
- Als Admin möchte ich ASINs zu EANs manuell zuordnen, wenn keine automatische Zuordnung vorliegt

## Acceptance Criteria

- [ ] Jede EAN erscheint genau einmal in der Tabelle (keine Duplikate)
- [ ] Tabelle zeigt: EAN, ASIN, EK-Preis (€), Lieferant, Bestelldatum (des letzten Eintrags)
- [ ] Bei mehreren Bestellungen mit gleicher EAN: aktuellster `order_date`-Eintrag gewinnt
- [ ] Suche nach EAN oder ASIN filtert die Tabelle in < 300ms
- [ ] CSV-Export der aktuell gefilterten Ansicht per Button-Klick
- [ ] EANs ohne EK-Preis werden trotzdem angezeigt, EK-Preis-Zelle zeigt "-"
- [ ] EANs ohne ASIN-Mapping zeigen "-" in der ASIN-Spalte

## Edge Cases

- **EAN in mehreren Bestellungen**: View gibt nur die Zeile mit dem neuesten `order_date` zurück (`DISTINCT ON`)
- **Kein order_date vorhanden**: `NULL` in `order_date` wird als ältestes Datum behandelt (`NULLS LAST`)
- **Keine ASIN-Zuordnung**: `LEFT JOIN` zeigt `null` → Zelle zeigt "-"
- **Sehr viele EANs (>5.000)**: Serverseitige Pagination (100 Zeilen/Seite) + serverseitige Suche
- **EAN ist null**: Gefiltert durch `WHERE ean IS NOT NULL` im View

## Technical Requirements

- **Datenbank — View `current_ek_prices`** (Migration 007):
  ```sql
  CREATE VIEW current_ek_prices AS
  SELECT DISTINCT ON (ean)
    ean,
    cost        AS ek_price,
    order_date,
    supplier,
    file_name
  FROM orders
  WHERE ean IS NOT NULL
  ORDER BY ean, order_date DESC NULLS LAST;
  ```

- **Datenbank — Tabelle `ean_asin_map`** (Migration 007):
  ```sql
  CREATE TABLE ean_asin_map (
    ean  TEXT PRIMARY KEY,
    asin TEXT
  );
  ALTER TABLE ean_asin_map ENABLE ROW LEVEL SECURITY;
  -- SELECT: alle authenticated User
  -- INSERT/UPDATE/DELETE: nur Admin (service role via API)
  ```

- **API**: `GET /api/prices` — Join von `current_ek_prices` und `ean_asin_map`, mit Suche/Pagination
- **Performance**: Index auf `orders(ean, order_date DESC)` für View-Performance
- **Security**: RLS auf `ean_asin_map`; View erbt RLS der `orders`-Tabelle
- **Frontend Library**: TanStack Table v8 (bereits installiert)
- **CSV Export**: Client-seitig aus gefilterten Daten (papaparse oder native Array-to-CSV)

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)

### Komponentenstruktur

```
/prices — Preisdatenbank-Seite
+-- PageHeader
|   +-- Titel "Preisdatenbank"
|   +-- CSV-Export-Button (oben rechts)
+-- SearchBar (Freitext: EAN oder ASIN)
+-- PricesTable (TanStack Table v8)
|   +-- Spalten: EAN | ASIN | EK-Preis (€) | Lieferant | Bestelldatum
|   +-- Leere Zellen zeigen "-"
|   +-- Pagination (100 Zeilen/Seite)
+-- LoadingSkeleton (während Daten laden)
+-- EmptyState (keine Ergebnisse)
```

### Datenmodell

**Bestehende Tabelle `orders`** (PROJ-2, unverändert) — Datenquelle

**Neue Datenbank-Objekte (Migration 007):**

| Objekt | Typ | Zweck |
|--------|-----|-------|
| `current_ek_prices` | PostgreSQL View | 1 Zeile pro EAN, neuestes Bestelldatum gewinnt |
| `ean_asin_map` | Tabelle | Manuelle EAN → ASIN Zuordnung (Admin-pflegbar) |

### Datenfluss

```
Browser (Suche / Pagination)
    ↓ GET /api/prices?q=...&page=...
API Route (serverseitig, Next.js)
    ↓ Supabase Query
current_ek_prices (View) LEFT JOIN ean_asin_map
    ↓ JSON Response
TanStack Table v8 → Anzeige im Browser
```

### Tech-Entscheidungen

| Entscheidung | Gewählt | Warum |
|---|---|---|
| Tabellen-Library | TanStack Table v8 | Bereits installiert |
| Suche & Pagination | Serverseitig | >5.000 EANs möglich |
| CSV-Export | Client-seitig (native Array→CSV) | Kein extra Package nötig |
| EAN→ASIN Mapping | Eigene Tabelle | Sellerboard-API nicht erforderlich |
| Deduplizierung | PostgreSQL DISTINCT ON | Effizienter als App-Logik |

### Neue Dateien

| Datei | Zweck |
|---|---|
| `src/app/api/prices/route.ts` | API-Endpunkt (Suche + Pagination) |
| `src/app/(dashboard)/prices/page.tsx` | Neue Dashboard-Seite |
| `src/components/prices/prices-table.tsx` | Tabellenkomponente |
| Supabase Migration 007 | View `current_ek_prices` + Tabelle `ean_asin_map` |

### Abhängigkeiten
Keine neuen Packages — TanStack Table, Supabase Client und alle benötigten shadcn/ui-Komponenten sind bereits installiert.

## QA Test Results

**Auditor:** Claude Opus 4.6 (QA / Red-Team)
**Date:** 2026-03-06
**Files Audited:** 10 files (API routes, hooks, components, types, server client)

---

### Acceptance Criteria Checklist

| # | Criterion | Status | Notes |
|---|-----------|--------|-------|
| AC-1 | Jede EAN erscheint genau einmal (keine Duplikate) | CANNOT VERIFY | Depends on `current_ek_prices` view using `DISTINCT ON` -- but migration 007 is missing (see BUG-01) |
| AC-2 | Tabelle zeigt: EAN, ASIN, EK-Preis, Lieferant, Bestelldatum | PASS | All 5 columns present in PricesTable.tsx columns definition (lines 20-70) |
| AC-3 | Bei mehreren Bestellungen: aktuellster order_date gewinnt | CANNOT VERIFY | Depends on view definition which is not deployed (see BUG-01) |
| AC-4 | Suche nach EAN oder ASIN in < 300ms | PASS (code) | Server-side ilike search implemented; performance depends on DB indexes |
| AC-5 | CSV-Export der gefilterten Ansicht per Button-Klick | PARTIAL | Exports only current page, not full filtered result set (see BUG-08) |
| AC-6 | EANs ohne EK-Preis zeigen "-" | PASS | PricesTable.tsx line 41: `if (v == null)` renders dash |
| AC-7 | EANs ohne ASIN-Mapping zeigen "-" | PASS | PricesTable.tsx line 33: null renders dash |

---

### Bug Report

#### BUG-01 -- CRITICAL -- Missing Database Migration 007
**File:** `supabase/migrations/` (missing file)
**Description:** The spec requires migration 007 to create the `current_ek_prices` view and `ean_asin_map` table. Only migrations 001-006 exist. Furthermore, the `orders` table (migration 005) has no `ean` or `cost` column -- the view references `orders.ean` and `orders.cost` which do not exist in the schema.
**Impact:** The entire feature cannot function. Queries to `current_ek_prices` and `ean_asin_map` will fail at the database level unless these objects were created manually outside of version-controlled migrations.
**Recommended Fix:** Create `supabase/migrations/007_price_database.sql` containing: (1) ALTER TABLE orders ADD COLUMN ean TEXT, cost NUMERIC if not present; (2) CREATE VIEW current_ek_prices; (3) CREATE TABLE ean_asin_map with id, ean, asin, created_at; (4) RLS policies; (5) indexes on orders(ean, order_date DESC).

#### BUG-02 -- HIGH -- PostgREST Filter Injection Incomplete Sanitization
**File:** `src/app/api/prices/route.ts`, lines 48-55
**Description:** The search sanitization escapes `\`, `,`, `.`, `(`, `)` but does NOT escape the `%` and `_` characters which are SQL LIKE wildcards. A user searching for `%` or `_` will get unintended wildcard matching. More critically, the PostgREST filter syntax uses `:` and `*` as special characters in some contexts which are also not escaped.
**Steps to Reproduce:** Search for `%` in the search bar -- it will match all rows instead of rows literally containing `%`.
**Recommended Fix:** Also escape `%` as `\%` and `_` as `\_` before inserting into the ilike pattern.

#### BUG-03 -- HIGH -- Race Condition: Double-Fetch on Search Change
**File:** `src/hooks/usePrices.ts`, lines 54-61
**Description:** When `search` changes, two effects fire: (1) the `refresh` effect (because `search` is a dependency of `fetchPrices` which is a dependency of `refresh`) and (2) the `setPage(1)` effect. If `page` was not 1, the `setPage(1)` triggers ANOTHER re-render which triggers `refresh` again. This means every search keystroke when page > 1 fires TWO API requests -- one with the old page number and one with page=1.
**Impact:** Unnecessary API load, potential UI flicker, and the first response may arrive after the second, showing stale data.
**Recommended Fix:** Combine both effects into one, or use a debounce on search, or reset page inside the same callback that triggers the fetch.

#### BUG-04 -- HIGH -- No Search Debounce
**File:** `src/hooks/usePrices.ts` + `src/components/prices/PricesClient.tsx`, line 90
**Description:** Every keystroke in the search input immediately updates `search` state, which triggers an API call. Typing "B08XYZ" fires 6 sequential API requests.
**Impact:** Excessive API calls, poor UX on slow connections, potential rate limiting issues.
**Recommended Fix:** Add a 300ms debounce to the search input before updating the `search` state in usePrices.

#### BUG-05 -- HIGH -- Upsert onConflict Mismatch with Table Schema
**File:** `src/app/api/prices/ean-asin-map/route.ts`, line 84
**Description:** The upsert uses `onConflict: 'ean,asin'` (composite unique on ean+asin). However, the spec defines `ean_asin_map` with `ean TEXT PRIMARY KEY` -- meaning the unique constraint is on `ean` alone, not on `(ean, asin)`. If the table was created per spec, this upsert will fail because there is no unique constraint on `(ean, asin)`. If the actual table has `id UUID PRIMARY KEY` (as the code implies with the `id` column in SELECT and DELETE), then the `ean` column is NOT a primary key and may have no unique constraint at all, meaning upsert cannot resolve conflicts.
**Impact:** POST requests to add mappings may fail with a Supabase error or create duplicate ean entries.
**Recommended Fix:** Verify the actual table schema. If `ean` should be unique (one ASIN per EAN), use `onConflict: 'ean'`. If the table has `id` as PK with a unique constraint on `ean`, use `onConflict: 'ean'`.

#### BUG-06 -- MEDIUM -- Loading State Not Reset on Fetch Error
**File:** `src/hooks/usePrices.ts`, lines 28-46
**Description:** In `fetchPrices`, if `res.ok` is false, the function sets `error` and returns -- but never sets `isLoading = false`. The `refresh` wrapper does set it, but if `fetchPrices` throws an exception (e.g., network error, JSON parse failure), the error propagates past `refresh` and `isLoading` stays true forever.
**Steps to Reproduce:** Disconnect network while the prices page is loading. The spinner never stops.
**Recommended Fix:** Wrap `fetchPrices` in a try/catch inside `refresh`, or use try/finally to always reset `isLoading`.

#### BUG-07 -- MEDIUM -- Same Issue in useEanAsinMap Hook
**File:** `src/hooks/useEanAsinMap.ts`, lines 17-26
**Description:** Same pattern as BUG-06. If `fetch()` throws (network error), `isLoading` stays true forever because the exception bypasses `setIsLoading(false)` in `refresh`.
**Recommended Fix:** Add try/catch/finally in the `refresh` function.

#### BUG-08 -- MEDIUM -- CSV Export Only Exports Current Page
**File:** `src/components/prices/PricesClient.tsx`, lines 15-34, 51-53
**Description:** `exportToCsv(prices)` exports only the `prices` array from the current page (max 100 rows). The acceptance criterion says "CSV-Export der aktuell gefilterten Ansicht" -- users expect ALL filtered results, not just one page.
**Impact:** If there are 5,000 products matching the filter, only 100 are exported.
**Recommended Fix:** Either (a) fetch all pages before exporting, or (b) add a server-side CSV endpoint that streams all matching rows, or (c) clearly label the button "Seite exportieren" to set correct expectations.

#### BUG-09 -- MEDIUM -- Delete Error Not Displayed to User
**File:** `src/hooks/useEanAsinMap.ts`, lines 53-63 + `src/components/prices/EanAsinMapManager.tsx`, lines 49-53
**Description:** `deleteMapping` returns an error string on failure, but `handleDelete` in EanAsinMapManager discards the return value (`await deleteMapping(id)` without checking the result). If deletion fails, the user sees no error.
**Recommended Fix:** Capture the return value and set `formError` or a dedicated `deleteError` state.

#### BUG-10 -- MEDIUM -- No Confirmation Dialog for Delete
**File:** `src/components/prices/EanAsinMapManager.tsx`, lines 155-160
**Description:** Clicking the delete button immediately deletes the mapping with no confirmation. This is a destructive action that should have a confirmation step.
**Impact:** Accidental deletions with no undo.
**Recommended Fix:** Add an AlertDialog confirmation before executing the delete.

#### BUG-11 -- MEDIUM -- useUserRole Casts Role Unsafely
**File:** `src/hooks/useUserRole.ts`, line 37
**Description:** `data.role` is cast as `'admin' | 'staff'` but if the database contains any other role string (e.g., 'viewer', 'manager'), it would be silently accepted as a valid role, bypassing type safety. Additionally, if the user has no role row (`single()` returns null/error for no rows), `roleError` is set but the error message is generic.
**Recommended Fix:** Validate `data.role` against allowed values before setting state.

#### BUG-12 -- MEDIUM -- GET /api/prices Has No .limit() Fallback
**File:** `src/app/api/prices/route.ts`, line 9
**Description:** While `pageSize` defaults to `PRICES_PAGE_SIZE` (100) and max is 500 via Zod, the `.range()` call on line 58 effectively limits results. However, per the backend rules, all list queries should use `.limit()`. The `range(from, to)` is functionally equivalent but if `to` somehow exceeds row count, Supabase returns fewer rows (which is fine). This is a minor compliance issue.
**Recommended Fix:** This is acceptable as-is since `.range()` provides the same bound. Low priority.

#### BUG-13 -- LOW -- Stale Prices After Adding/Deleting EAN-ASIN Mapping
**File:** `src/components/prices/PricesClient.tsx` + `src/hooks/usePrices.ts`
**Description:** After adding or deleting an EAN-ASIN mapping in the EanAsinMapManager dialog, the main PricesTable does not refresh. The ASIN column will show stale data until the user manually reloads the page or changes the search.
**Recommended Fix:** Expose a callback from EanAsinMapManager or use a shared refresh trigger so that PricesClient re-fetches after mapping changes.

#### BUG-14 -- LOW -- Object URL Memory Leak Edge Case in CSV Export
**File:** `src/components/prices/PricesClient.tsx`, line 33
**Description:** `URL.revokeObjectURL(url)` is called synchronously right after `a.click()`. In some browsers, the download may not have started yet when `revokeObjectURL` is called. This can cause the download to fail silently.
**Recommended Fix:** Use `setTimeout(() => URL.revokeObjectURL(url), 1000)` to give the browser time to initiate the download.

#### BUG-15 -- LOW -- EAN-ASIN Map GET Has Hard Limit of 500 With No Pagination
**File:** `src/app/api/prices/ean-asin-map/route.ts`, line 32
**Description:** The GET endpoint returns at most 500 mappings with no pagination. If the admin creates more than 500 mappings, the rest are silently omitted.
**Recommended Fix:** Add pagination support, or increase the limit, or display a warning when 500 is reached.

---

### Security Audit (Red-Team Perspective)

#### SEC-01 -- HIGH -- No RLS Policies Documented or Deployed for ean_asin_map
**Description:** The spec says `ean_asin_map` should have RLS with SELECT for authenticated and INSERT/UPDATE/DELETE for admin only. However, migration 007 does not exist. If the table was created without RLS policies, any authenticated user can directly INSERT/UPDATE/DELETE via the Supabase client (bypassing the API admin check). The API-level admin check in `route.ts` is good defense-in-depth, but RLS is the required second line of defense per `security.md`.
**Recommended Fix:** Create and deploy RLS policies: SELECT for authenticated, INSERT/UPDATE/DELETE restricted to admin role or service_role only.

#### SEC-02 -- MEDIUM -- Admin Role Check Uses Client-Scoped Query (No RLS Bypass)
**File:** `src/app/api/prices/ean-asin-map/route.ts`, lines 5-16
**Description:** `getAuthenticatedUser` queries `user_roles` using the cookie-authenticated Supabase client (anon key). This is correct IF `user_roles` has a SELECT RLS policy for authenticated users. If `user_roles` has restrictive RLS (e.g., users can only see their own role), this works. But if RLS is misconfigured on `user_roles`, the admin check could silently fail, treating everyone as non-admin.
**Impact:** If `user_roles` SELECT returns no rows due to RLS, `data?.role` is null, so `isAdmin` is false -- this fails safe (denies access). Not a vulnerability, but could cause admin lockout.
**Recommended Fix:** Ensure `user_roles` RLS policy allows users to SELECT their own row. Verify this is in migration 001.

#### SEC-03 -- MEDIUM -- Non-Deterministic Delete (No Row-Existence Check)
**File:** `src/app/api/prices/ean-asin-map/route.ts`, lines 124-134
**Description:** The DELETE endpoint does not verify the row exists before deleting. If the ID does not exist, Supabase returns success with no error. This is not a security vulnerability but could mask bugs (e.g., double-delete of the same ID).
**Recommended Fix:** Check the count of affected rows and return 404 if zero rows were deleted.

#### SEC-04 -- LOW -- Service Role Key Loaded at Module Level
**File:** `src/lib/supabase-server.ts`, line 7
**Description:** `supabaseServiceRoleKey` is assigned with `!` (non-null assertion) at the module top level. If the env var is missing, this will be `undefined` at runtime. The `createSupabaseServiceClient` function (not used in PROJ-3 code but available) would create a client with `undefined` as the key, which would fail on first query rather than at startup.
**Recommended Fix:** Add a runtime check or use a lazy initialization pattern that throws immediately if the key is missing.

#### SEC-05 -- LOW -- No Rate Limiting on EAN-ASIN Map Endpoints
**Description:** The POST and DELETE endpoints have no rate limiting. An authenticated admin could rapid-fire requests. Given the small user base (1 admin, 2-3 staff), this is low risk but noted per security best practices.

#### SEC-06 -- INFO -- NEXT_PUBLIC_ Env Vars Correctly Used
**File:** `src/lib/supabase-server.ts`, `src/lib/supabase.ts`
**Description:** `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are correctly prefixed for browser exposure. `SUPABASE_SERVICE_ROLE_KEY` is NOT prefixed, so it stays server-side only. This is correct.

---

### Summary

| Severity | Count |
|----------|-------|
| CRITICAL | 1 (BUG-01: missing migration) |
| HIGH | 4 (BUG-02, BUG-03, BUG-04, BUG-05, SEC-01) |
| MEDIUM | 6 (BUG-06 through BUG-12, SEC-02, SEC-03) |
| LOW | 4 (BUG-13 through BUG-15, SEC-04, SEC-05) |

**Overall Verdict: BLOCKED -- Cannot deploy.**

The critical blocker is BUG-01: the database migration for the view and mapping table is missing from version control, and the `orders` table schema does not contain the `ean` or `cost` columns referenced by the view. Until the database layer is verified and migration 007 is committed, this feature cannot be considered functional.

**Recommended next steps (priority order):**
1. Verify/create migration 007 with correct schema (BUG-01)
2. Fix upsert onConflict to match actual table constraint (BUG-05)
3. Deploy RLS policies for ean_asin_map (SEC-01)
4. Add search debounce and fix race condition (BUG-03, BUG-04)
5. Fix loading state error paths (BUG-06, BUG-07)
6. Fix delete error display (BUG-09)
7. Address remaining MEDIUM/LOW items

## Deployment
_To be added by /deploy_
