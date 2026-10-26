# Implementation checklist

This checklist distinguishes local implementation and checks from work that requires Docker, external accounts, or an actual deployment. The application is not production-ready until all release and live isolation checks are completed.

## Phase 1 — Foundation and verified platform assumptions
- [x] React + TypeScript + Vite app integrated with Cloudflare's current Vite plugin and Worker entry point.
- [x] Wrangler AI binding and `@cf/meta/llama-3.2-3b-instruct` model setting verified against current official Cloudflare docs (2026-11-02).
- [x] Supabase publishable-key/RLS and password Auth assumptions documented with official sources.
- [x] Responsive UI, reduced-motion support, local lint, typecheck, unit/UI tests, and production build pass.

## Phase 2 — Authentication, onboarding, and persistence
- [x] Invite-only email/password sign-in and password reset UI; no public registration page or sign-up handler.
- [x] Onboarding captures optional profile, modules, monthly budget, categories, income sources, goals, assets, liabilities, and dashboard preferences.
- [x] SQL migration authored with per-user RLS, explicit grants, ownership/type constraints, valuation history, and quota RPC.
- [x] Local two-user pgTAP security/integrity suite authored.
- [ ] Apply and test migration locally with Supabase CLI/Docker; current environment Docker engine is unavailable.
- [ ] Configure hosted Supabase Auth with public sign-ups disabled and invite accounts.
- [ ] Validate three-user isolation against a hosted project.

## Phase 3 — Finance functionality
- [x] Supabase-backed transaction create/read/update, trash/restore, active/deleted views, filters, CSV/JSON export.
- [x] Category and income-source CRUD/archive/restore.
- [x] Budget and savings-goal CRUD/archive/restore; savings contributions link to goals.
- [x] Asset, investment-holding, valuation-snapshot, and liability CRUD/archive/restore.
- [x] Dashboard uses active records and recorded valuations; money arithmetic is deterministic and handles empty/zero targets safely.
- [x] Local tests cover finance calculations, transaction workflows, category/budget forms, and asset valuation editing.
- [ ] Exercise every finance workflow against local and hosted Supabase after migrations run.

## Phase 4 — AI entry
- [x] Authenticated Worker parser verifies user token/email, calls quota RPC before inference, and validates output.
- [x] Browser calls the Worker with access token and revalidates the returned proposal.
- [x] Create proposals show/edit/remove rows and resolved dates; writes require explicit confirmation and use submission/item idempotency.
- [x] Update/delete intents search only signed-in user's active rows, require selection for ambiguity, preview changes, and require confirmation.
- [x] Mock AI adapter; tests cover proposal preview, edits, cancel, and ambiguous-update selection.
- [ ] Run authenticated AI and quota flows against a configured Cloudflare/Supabase environment.
- [ ] Verify retry behavior against Supabase after migration and database suite pass.

## Phase 5 — Security and reliability
- [x] No normal CRUD path uses a service-role key; no model-supplied IDs or SQL are executed.
- [x] RLS and grants are defined for every application table in the migration.
- [x] pgTAP cases cover cross-user read/create/update/delete/restore, ownership/type constraints, quota limits, idempotency, and soft-delete/restore.
- [ ] Run pgTAP suite and resolve failures; no database test result is claimed yet.
- [x] Current lockfile audit reports zero known vulnerabilities; rerun the audit before release.
- [ ] Complete live backup/restore drill and verify current provider limits.

## Phase 6 — CI, documentation, and deployment
- [x] README documents setup, migration, tests, provider sources/limits, AI privacy, backup/restore, secrets, and remaining manual steps.
- [x] GitHub workflow uses `npm ci` and actual lint/typecheck/test/build scripts; deploy job is gated on validation.
- [x] `package-lock.json` generated and `npm ci` verified locally.
- [ ] Run the updated CI workflow, including local Supabase tests, in GitHub Actions.
- [ ] Configure GitHub variables/secrets and narrowly scoped Cloudflare API token.
- [ ] Deploy and verify the actual `workers.dev` URL and three-user isolation; deployment has not been attempted.

## Local verification record

Passed in this workspace: `npm ci`, `npm run lint`, `npm run typecheck`, `npm test` (21 tests), `npm run build`, and `npm audit` (zero reported vulnerabilities). The Supabase CLI parsed the local config but could not start because Docker's Linux engine is unavailable; pgTAP was not executed. No hosted migration, live isolation test, or deployment was performed. See [README.md](../README.md) for exact manual steps and official platform references.
