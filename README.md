# Friday — AI Finance Tracker

Friday is a private, invite-only app for tracking personal finances in Indian rupees (INR). Use it to record transactions, manage budgets and savings goals, and keep track of income, assets, and liabilities. An AI assistant can turn written notes into transaction suggestions for you to review before saving.

## What you can do

- Track income, expenses, savings, and investments.
- Review dashboards and summaries based on your records.
- Organize older or removed records in Archive & Trash, and restore them when needed.
- Enter several transactions at once with AI suggestions. Check the preview and confirm before anything is saved.
- Export filtered transaction data as CSV or JSON.

## Built with

- React, TypeScript, and Vite
- Supabase Auth and Postgres for accounts and data
- Cloudflare Workers and Workers AI for AI-assisted entry

## Run locally

### Requirements

- Node.js 22 and npm
- Docker Desktop with its Linux engine, for local Supabase
- Supabase CLI (the commands below use version 2.122.0)

### Setup

1. Create `.env.local` with your Supabase project URL and publishable key:

```powershell
npm ci
npx supabase@2.122.0 start
npx supabase@2.122.0 migration up --local
npx supabase@2.122.0 test db --local
npm run dev
```

The migration command applies pending checked-in migrations to the local database without resetting it. The AI batch write function is introduced by `202610280001_ai_batch_write.sql`; it uses invoker privileges, derives ownership from `auth.uid()`, requires the user's existing transaction insert grant and RLS policy, and grants execution only to `authenticated`. A single SQL insert makes writes atomic; a transaction advisory lock serializes submission retries and mismatched retries are rejected. Do not use `db reset` on an environment containing data you want to keep. For a hosted project, review and test migrations in a disposable project first, then use the Supabase CLI or dashboard migration process. Do not apply an unverified migration directly to production.

Disable public sign-ups in the Supabase Auth dashboard before inviting intended users. Configure the site URL and password-reset redirect URL. The application offers no public registration. The target is a maximum of three invited accounts, but no hard account-count enforcement exists in the database; administer invitations accordingly.

## Validation commands

```powershell
npm ci
npm run lint
npm run typecheck
npm test
npm run build
npx supabase@2.122.0 test db --local
```

In this UI implementation phase, lint completed with two existing generated Worker declaration warnings and no errors; TypeScript passed; frontend tests passed (35 tests across 4 files); production build passed; and local Supabase pgTAP passed (42 tests across `archive_trash.sql` and `rls.sql`). The build emitted dependency annotation and large-chunk warnings but completed successfully. The npm audit and lockfile install were checked in the earlier dependency phase; rerun both before release.

The Cloudflare Vite plugin normally copies local development variables into its Worker build output for `vite preview`. Production builds override Wrangler's inferred `secrets.required` list to empty, so no local variables are serialized into the Worker build. `npm run dev` retains the normal local `.dev.vars` workflow. Public asset exclusions in [public/.assetsignore](./public/.assetsignore) prevent `.dev.vars*` and `.env*` files from being uploaded as static assets. `npm run deploy` deploys using the generated Vite Worker configuration and its client asset directory; use `npm run deploy:dry-run` to inspect the upload without deploying.

## Data, AI, privacy, and limitations

- Browser database access uses the signed-in Supabase client. Normal CRUD never uses a service-role key. The migration denies direct client access to AI quota counters and exposes a security-definer quota RPC limited to 30 calls per verified user per UTC day.
- The Worker verifies the bearer token and confirmed-email status before parsing, enforces the quota before inference, bounds and validates inputs/outputs, and returns proposals only. Finance writes use the user's authenticated Supabase client and RLS.
- Text that a user submits to AI is sent to Cloudflare Workers AI for processing. The application does not intentionally log or persist the raw prompt. Do not enter credentials, account numbers, or other sensitive details into AI text.
- AI category and goal names are semantic suggestions only; the browser resolves them against active records returned for the signed-in account. Generic savings prefers one unique active Emergency Fund goal, then the active Emergency Fund category; this project has no configured default-goal field. Generic investment uses an existing `Other` investment category when available, flags the missing instrument, and blocks saving until the user enters it.
- Asset and investment valuations are manual snapshots, not live prices. There is no bank connection, tax calculation, financial advice, automatic reconciliation, or independently audited accounting.
- Filtered transaction CSV/JSON exports are available in the application. Keep any exports and database backups encrypted and outside this repository.
- Cloudflare Workers AI currently documents 10,000 Neurons/day free and per-model charges beyond the allowance on Paid Workers; this can be exhausted by usage outside this application. Supabase plan quotas, project pausing, backups, and availability are provider-controlled and may change. Verify current Supabase pricing/limits directly before selecting a plan.
- As listed on Supabase's Free plan page on 2026-11-02: unlimited API requests, 50,000 monthly active users, 500 MB database size with shared CPU/500 MB RAM, 5 GB egress, 5 GB cached egress, 1 GB file storage, and at most two active free projects. Free projects pause after one week of inactivity. Daily backups stored for seven days are listed under Pro, not Free; arrange an independent export/backup process if remaining on Free. See [Supabase pricing](https://supabase.com/pricing) for current terms.

## Backups and restore

The Free plan has no provider-managed daily backup retention. Supabase currently lists daily backups for Pro (7 days), Team (14 days), and Enterprise (up to 30 days). Paid-plan backups can be restored from the dashboard's **Database > Backups** page; restoration makes the project unavailable during recovery. Database backups do not include Storage API objects.

For a logical export on Free, install `psql`, set the database connection URL from the Supabase dashboard in the current PowerShell session, and choose a secure backup path outside the repository:

```powershell
$env:SUPABASE_DB_URL = '<database connection string>'
$backup = 'D:\EncryptedBackups\friday-public-data.sql'
npx supabase@2.122.0 db dump --db-url $env:SUPABASE_DB_URL --schema public --data-only --file $backup
```

Keep the dump encrypted and access-restricted. Restore only after applying the same migration versions to a compatible project and confirming the Auth user UUIDs referenced by `public.profiles` still exist:

```powershell
psql $env:SUPABASE_DB_URL -v ON_ERROR_STOP=1 -f $backup
```

This logical dump contains public application data only; it is not a complete project/Auth configuration backup and cannot by itself restore a deleted project with different Auth user IDs. For a full recovery, use the plan's supported dashboard backup restore, or provision Auth identities and project configuration separately before importing data. Filtered transaction exports from the app are not full database backups. Record applied migration versions and rehearse restores in a non-production project.

This repository has not yet run a backup/restore drill; verify the chosen Supabase plan's backup retention and restore options before relying on recovery.

## CI and deployment configuration

Pull requests and pushes to `main` run `npm ci`, lint, typecheck, unit/UI tests, production build, and local Supabase migration/pgTAP tests. A push to `main` deploys only after the validation job succeeds. Wrangler reported a deployment during local artifact verification on 2026-10-27; no endpoint health, authentication, AI, or isolation checks have verified it as a release.

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
