# Architecture and data flow

The React client uses the Supabase publishable key and the signed-in user's Supabase session. User CRUD goes directly to Postgres through Supabase JS; RLS policies and composite ownership foreign keys are the authorization boundary. The client never uses a service-role key.

AI text is posted to `/api/ai/parse` with the access token. The Worker verifies the token through Supabase Auth, consumes a per-user UTC-day quota through a narrow authenticated RPC, calls the configured Workers AI binding, validates the response and returns a proposal. The Worker cannot write finance rows. A user confirmation UI and client-side write path are still required before AI finance entry can be considered complete.

Amounts are stored as `NUMERIC(14,2)`. Summaries are deterministic application calculations over active transaction rows; assets, holding valuations and liabilities are separate snapshots. Savings contributions are not added to net worth.
