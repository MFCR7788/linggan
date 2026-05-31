# Findings

## Baseline Analysis

- Project is a Next.js 14 App Router application with API routes in the same repo.
- Data layer is Supabase; most server routes use `createAdminClient()` plus explicit `user_id` filters.
- Auth is currently development-mode first: localStorage -> `dev_user_id` cookie -> `X-Dev-User-Id` header -> optional Supabase session fallback.
- Automated checks currently fail:
  - `npm test`: one failing video generation request body test.
  - `npx tsc --noEmit`: syntax typo in SMS route and missing Vitest globals in test file.
- Hotspot checker likely cannot insert discovered hotspots because `hot_items.user_id` is NOT NULL in schema but the job insert does not include `user_id`.
- Hotspot status values are inconsistent:
  - Types/schema use `new`, `following`, `used`, `ignored`.
  - Detail API PATCH accepts `new`, `confirmed`, `dismissed`.
- `docs/migration-hotspot-monitor.sql` has invalid SQL: `ENABLE ROW LEVEL LEVEL SECURITY`.
- Environment files contain real-looking secrets; do not expose values in final summary.

## Fixes Applied

- Removed stray `n` in SMS code cleanup chain.
- Imported `afterEach` and `afterAll` explicitly from Vitest.
- Changed Seedance video task request body back to string `content`, matching existing tests and the route's own "must be string" error handling.
- Added `user_id` when the hotspot checker inserts `hot_items`.
- Normalized hotspot detail PATCH accepted statuses to schema/type values: `new`, `following`, `used`, `ignored`.
- Fixed invalid RLS SQL typo in hotspot monitor migration.
- Removed `next/font/google` usage so production builds do not require fetching Google Fonts.
- Added a Next ESLint config and cleaned lint output to zero warnings/errors.
- Stabilized React hook dependencies in home and inspiration detail pages.
- Sanitized `.env.example` values into placeholders; `.env.local` still contains local secrets and should be kept out of source control or rotated if exposed.
