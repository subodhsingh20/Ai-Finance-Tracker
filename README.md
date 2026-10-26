# Ledger — AI Finance Tracker

A private, invite-only INR finance tracker built with React, Vite, Cloudflare Workers/Workers AI, and Supabase Auth/Postgres. This is an actively developed foundation, **not production-ready**. Database migrations have not been applied to an external Supabase project, the database security suite has not been run here, and no deployment or multi-user live-isolation check has been performed. Do not use it as the sole record of financial data.

See [docs/IMPLEMENTATION_CHECKLIST.md](./docs/IMPLEMENTATION_CHECKLIST.md) for implementation and verification status.

## Current implementation

- Invite-only email/password sign-in and password reset; no public sign-up flow in the application.
- First-login setup for profile, enabled modules, dashboard preferences, budget, categories, income sources, savings goals, assets, and liabilities.
- Supabase-backed transaction, category, budget, goal, income-source, asset/valuation, holding/valuation, liability, and profile workflows; RLS is the database isolation boundary.
- Dashboard summaries and charts use the signed-in user's active transactions, budgets, goals, liabilities, and recorded valuation snapshots. Asset and holding valuations are manually entered; there is no live market feed.
- AI entry calls the authenticated Worker parser, validates and displays the proposal, supports editing/removing proposed rows, and writes only after explicit confirmation. Update/delete intents search the user's active rows, require selection when ambiguous, preview changes, and require explicit confirmation. AI never receives authority to execute SQL or choose record IDs.
- Local unit/UI tests cover finance helpers, AI proposal validation/mock adapter, sign-in/onboarding controls, manual forms, AI preview/confirmation/cancellation, and accessible controls. The independent Supabase pgTAP suite is authored but not yet run in this workspace.

## Verified platform assumptions

Checked against official provider documentation on **2026-11-02**. Pricing, limits, model availability, and dashboard settings can change; check the linked pages again before deployment.

| Topic | Verified behavior and project setting | Official source |
|---|---|---|
| React + Vite on Workers | Cloudflare's current guide supports an existing React/Vite SPA with the Cloudflare Vite plugin, a `wrangler.jsonc`, and a Worker entry point. This repository uses `@vitejs/plugin-react`, `@cloudflare/vite-plugin`, and `worker/index.ts`. | [Cloudflare React + Vite guide](https://developers.cloudflare.com/workers/framework-guides/web-apps/react/), [Vite plugin](https://developers.cloudflare.com/workers/vite-plugin/) |
| Workers AI binding | The Wrangler AI binding is `AI`; the Worker uses that binding and the model is set in `wrangler.jsonc`. | [Workers AI bindings](https://developers.cloudflare.com/workers-ai/configuration/bindings/) |
| Selected model | Cloudflare's model page lists `@cf/meta/llama-3.2-3b-instruct` as a Workers AI text-generation model. The same page lists unit pricing of $0.0509/M input tokens and $0.335/M output tokens at the time checked. | [Model page](https://developers.cloudflare.com/workers-ai/models/llama-3.2-3b-instruct/) |
| Workers AI allowance | Cloudflare currently documents 10,000 Neurons/day at no charge; usage above that requires a Paid Workers plan and is listed at $0.011/1,000 Neurons. These are provider-wide terms, not a per-user guarantee. | [Workers AI pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/) |
| Supabase browser key and RLS | The browser uses the current `sb_publishable_...` API key, which is safe to expose. RLS and database grants—not hiding this key—must enforce access. The migration enables RLS and explicitly grants only required operations to `authenticated`. Supabase currently documents deprecating legacy `anon` and `service_role` keys by the end of 2026; never put an elevated secret/service-role key in browser or Worker configuration. | [Supabase API keys](https://supabase.com/docs/guides/getting-started/api-keys), [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security) |
| Supabase Auth | Password-based email Auth is supported. The product has no public registration UI; disable sign-ups in Supabase Auth settings and invite users administratively. | [Supabase password Auth](https://supabase.com/docs/guides/auth/passwords), [Auth configuration](https://supabase.com/docs/guides/auth/redirect-urls) |
| Supabase database tests | Supabase documents `supabase test db` for SQL/pgTAP database tests. The workflow starts a local Supabase stack, resets it from migrations, and runs this suite. | [Supabase RLS and database testing](https://supabase.com/docs/guides/database/postgres/row-level-security) |
| Supabase backup | Free projects should export regularly with `supabase db dump`; provider daily backups are listed for Pro (7 days), Team (14 days), and Enterprise (up to 30 days). | [Supabase database backups](https://supabase.com/docs/guides/platform/backups), [CLI `db dump`](https://supabase.com/docs/reference/cli/supabase-db-dump) |
| Cloudflare CI token | Wrangler CI uses an API token and account ID. Cloudflare recommends its **Edit Cloudflare Workers** token template and restricting the token to only the account where the Worker is deployed. | [Cloudflare GitHub Actions guide](https://developers.cloudflare.com/workers/ci-cd/external-cicd/github-actions/) |

The official Supabase API-key Markdown page, RLS guidance, password Auth guide, and pricing page were retrieved directly for this review. The pricing and key deprecation details below are time-sensitive; recheck them in the provider dashboards before setup.

## Requirements and local setup

- Node.js 22 and npm.
- Docker Desktop with its Linux engine running for local Supabase and database tests.
- A Supabase project for hosted Auth and persistence; a Cloudflare account for Workers AI and eventual deployment.

Copy `.env.example` to `.env.local` and provide the Supabase project URL and **publishable** key. Copy `.dev.vars.example` to `.dev.vars` and provide the Worker-side `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY`. The example files use placeholders only. Do not use a secret/service-role key in either file. These local files are ignored by Git.

```powershell
npm ci
npx supabase@2.122.0 start
npx supabase@2.122.0 db reset
npx supabase@2.122.0 test db
npm run dev
```

`db reset` applies the checked-in migration to the local database and resets local data. The same database test suite is run in CI. For a hosted project, review the migration in a disposable project first, then use the Supabase CLI (`supabase link`, `supabase db push`) or the dashboard migration process. Do not apply an unverified migration directly to production.

Disable public sign-ups in the Supabase Auth dashboard before inviting intended users. Configure the site URL and password-reset redirect URL. The application offers no public registration. The target is a maximum of three invited accounts, but no hard account-count enforcement exists in the database; administer invitations accordingly.

## Validation commands

```powershell
npm ci
npm run lint
npm run typecheck
npm test
npm run build
npx supabase@2.122.0 test db
```

In the current workspace, `npm ci`, lint, TypeScript, unit/UI tests (21 tests), production build, and `npm audit` (0 reported vulnerabilities) have passed. Re-run the audit before release. The pgTAP suite has not passed or failed here: Docker's Linux engine was unavailable, and it requires the local Supabase stack. The production build emitted only dependency annotation warnings from Zod; it completed successfully.

## Data, AI, privacy, and limitations

- Browser database access uses the signed-in Supabase client. Normal CRUD never uses a service-role key. The migration denies direct client access to AI quota counters and exposes a security-definer quota RPC limited to 30 calls per verified user per UTC day.
- The Worker verifies the bearer token and confirmed-email status before parsing, enforces the quota before inference, bounds and validates inputs/outputs, and returns proposals only. Finance writes use the user's authenticated Supabase client and RLS.
- Text that a user submits to AI is sent to Cloudflare Workers AI for processing. The application does not intentionally log or persist the raw prompt. Do not enter credentials, account numbers, or other sensitive details into AI text.
- Asset and investment valuations are manual snapshots, not live prices. There is no bank connection, tax calculation, financial advice, automatic reconciliation, or independently audited accounting.
- Filtered transaction CSV/JSON exports are available in the application. Keep any exports and database backups encrypted and outside this repository.
- Cloudflare Workers AI currently documents 10,000 Neurons/day free and per-model charges beyond the allowance on Paid Workers; this can be exhausted by usage outside this application. Supabase plan quotas, project pausing, backups, and availability are provider-controlled and may change. Verify current Supabase pricing/limits directly before selecting a plan.
- As listed on Supabase's Free plan page on 2026-11-02: unlimited API requests, 50,000 monthly active users, 500 MB database size with shared CPU/500 MB RAM, 5 GB egress, 5 GB cached egress, 1 GB file storage, and at most two active free projects. Free projects pause after one week of inactivity. Daily backups stored for seven days are listed under Pro, not Free; arrange an independent export/backup process if remaining on Free. See [Supabase pricing](https://supabase.com/pricing) for current terms.

## Backups and restore

The Free plan has no provider-managed daily backup retention. Supabase currently lists daily backups for Pro (7 days), Team (14 days), and Enterprise (up to 30 days). Paid-plan backups can be restored from the dashboard's **Database > Backups** page; restoration makes the project unavailable during recovery. Database backups do not include Storage API objects.

For a logical export on Free, install `psql`, set the database connection URL from the Supabase dashboard in the current PowerShell session, and choose a secure backup path outside the repository:

```powershell
$env:SUPABASE_DB_URL = '<database connection string>'
$backup = 'D:\EncryptedBackups\ledger-public-data.sql'
npx supabase@2.122.0 db dump --db-url $env:SUPABASE_DB_URL --schema public --data-only --file $backup
```

Keep the dump encrypted and access-restricted. Restore only after applying the same migration versions to a compatible project and confirming the Auth user UUIDs referenced by `public.profiles` still exist:

```powershell
psql $env:SUPABASE_DB_URL -v ON_ERROR_STOP=1 -f $backup
```

This logical dump contains public application data only; it is not a complete project/Auth configuration backup and cannot by itself restore a deleted project with different Auth user IDs. For a full recovery, use the plan's supported dashboard backup restore, or provision Auth identities and project configuration separately before importing data. Filtered transaction exports from the app are not full database backups. Record applied migration versions and rehearse restores in a non-production project.

This repository has not yet run a backup/restore drill; verify the chosen Supabase plan's backup retention and restore options before relying on recovery.

## CI and deployment configuration

Pull requests and pushes to `main` run `npm ci`, lint, typecheck, unit/UI tests, production build, and local Supabase migration/pgTAP tests. A push to `main` deploys only after the validation job succeeds. No deployment has been run or verified from this workspace.

Configure these GitHub repository **variables**:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY` (public, but set as a variable for build reproducibility)
- `CLOUDFLARE_ACCOUNT_ID`

Configure this GitHub repository **secret**:

- `CLOUDFLARE_API_TOKEN`: create an Account API token using Cloudflare's **Edit Cloudflare Workers** template, then restrict its resource scope to only the target account. Do not use an account-wide Global API Key or grant unrelated zone, DNS, or user-management permissions.

Set Worker runtime variables `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` for the deployed Worker using Cloudflare's Worker settings or Wrangler. The publishable key is public, but a service-role/secret key is never appropriate here. The model is configured by the `AI_MODEL` Wrangler variable. Before claiming a live release, configure the Supabase project and redirect URLs, deploy, verify the actual `workers.dev` URL, and execute the required three-user isolation checks against the deployed project.

### Remaining external/manual checks

1. Start Docker and run local Supabase migration plus pgTAP tests; fix any SQL/runtime failures.
2. Apply the migration to a disposable hosted Supabase project; configure invite-only Auth and verify isolation with three accounts.
3. Review current Supabase plan limits/backup retention and complete a restore drill.
4. Configure GitHub variables/secrets and Cloudflare token; validate the CI workflow and deployment.
5. Verify the deployed `workers.dev` URL, authenticated AI request, quota behavior, and three-user isolation. No external credentials or accounts were available for these checks here.
