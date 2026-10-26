# Implementation checklist

This checklist distinguishes local implementation and checks from work that requires Docker, external accounts, or an actual deployment. The application is not production-ready until all release and live isolation checks are completed.

## Phase 1 — Foundation and verified platform assumptions
- [x] React + TypeScript + Vite app integrated with Cloudflare's current Vite plugin and Worker entry point.
- [x] Wrangler AI binding and `@cf/zai-org/glm-4.7-flash` model setting verified against the official model documentation; local AI binding is configured for remote inference.
- [x] Supabase publishable-key/RLS and password Auth assumptions documented with official sources.
- [x] Responsive UI, reduced-motion support, local lint, typecheck, unit/UI tests, and production build pass.

## Phase 2 — Authentication, onboarding, and persistence
- [x] Invite-only email/password sign-in and password reset UI; no public registration page or sign-up handler.
- [x] Onboarding captures optional profile, modules, monthly budget, categories, income sources, goals, assets, liabilities, and dashboard preferences.
- [x] SQL migration authored with per-user RLS, explicit grants, ownership/type constraints, valuation history, and quota RPC.
- [x] Local two-user pgTAP security/integrity suite authored.
- [x] Apply incremental migrations locally without resetting the database; local migration history includes Archive & Trash and atomic AI batch writes.
- [ ] Configure hosted Supabase Auth with public sign-ups disabled and invite accounts.
- [ ] Validate three-user isolation against a hosted project.

## Phase 3 — Finance functionality
- [x] Supabase-backed transaction create/read/update, trash/restore, active/deleted views, filters, CSV/JSON export.
- [x] Category and income-source CRUD/archive/restore.
- [x] Budget and savings-goal CRUD/archive/restore; savings contributions link to goals.
- [x] Asset, investment-holding, valuation-snapshot, and liability CRUD/archive/restore.
- [x] Central Archive & Trash UI lists archived/trashed records, searches and filters, restores prior state, and confirms owner-scoped permanent deletion/empty-trash RPC actions.
- [x] Active finance selectors and dashboard calculations exclude trashed entities; archived entities remain excluded from active totals.
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
- [x] Verify retry behavior against local Supabase after the batch migration and database suite pass.
- [x] Parse and preview mixed one-to-25-entry batches from line, comma, or sentence input; keep defaults visible and resolve categories/goals only from active signed-in user rows.
- [x] Require a complete editable batch confirmation, show per-type totals, and require a real investment instrument when the proposal did not specify one.
- [x] Save batches through an invoker-rights atomic RPC with `auth.uid()` ownership, transaction-level retry serialization, and mismatched-retry rejection.

## Phase 5 — Security and reliability
- [x] No normal CRUD path uses a service-role key; no model-supplied IDs or SQL are executed.
- [x] RLS and grants are defined for every application table in the migration.
- [x] pgTAP cases cover cross-user read/create/update/delete/restore, ownership/type constraints, quota limits, idempotency, and soft-delete/restore.
- [x] Local pgTAP suite covers RLS, Archive & Trash, and atomic AI batch writes, including retry, ownership/type integrity, and transaction DELETE privilege checks.
- [x] Current lockfile audit reports zero known vulnerabilities; rerun the audit before release.
- [ ] Complete live backup/restore drill and verify current provider limits.

## Phase 6 — CI, documentation, and deployment
- [x] README documents setup, migration, tests, provider sources/limits, AI privacy, backup/restore, secrets, and remaining manual steps.
- [x] GitHub workflow uses `npm ci` and actual lint/typecheck/test/build scripts; deploy job is gated on validation.
- [x] `package-lock.json` generated and `npm ci` verified locally.
- [ ] Run the updated CI workflow, including local Supabase tests, in GitHub Actions.
- [ ] Configure GitHub variables/secrets and narrowly scoped Cloudflare API token.
- [ ] Verify the reported `workers.dev` deployment's health, authentication, AI behavior, and three-user isolation; the deployment was triggered unintentionally during local artifact verification on 2026-10-27 and must not be treated as a verified release.

## Local verification record

The AI Batch Entry phase applied `202610280001_ai_batch_write.sql` to the local Supabase database with `npx --yes supabase migration up --local` (no reset). `npm run typecheck` passed; `npm run lint` reported 0 errors and 2 existing warnings in generated Worker declarations; `npm test` passed 68 tests across 7 files; `npm run build` passed with existing dependency-annotation and large-chunk warnings. The focused database test passed 14 assertions, and `npx --yes supabase test db --local` passed 56 assertions across `ai_batch.sql`, `archive_trash.sql`, and `rls.sql`. No hosted database migration, live isolation test, live AI inference, or deployment was performed in this phase. An unintended Worker deployment occurred on 2026-10-27 and remains unverified; see [README.md](../README.md) for details and manual checks.
