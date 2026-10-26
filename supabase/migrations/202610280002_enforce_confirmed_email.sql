-- Migration ordering: 202610280001 is already part of the local migration
-- history. This migration intentionally uses the next greater version and
-- does not edit, rename, or recreate any earlier migration.

create or replace function public.is_current_user_email_confirmed()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from auth.users
    where auth.users.id = auth.uid()
      and auth.users.email_confirmed_at is not null
  );
$$;

ALTER FUNCTION public.is_current_user_email_confirmed() OWNER TO postgres;
revoke all on function public.is_current_user_email_confirmed() from public, anon;
grant execute on function public.is_current_user_email_confirmed() to authenticated;

drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own
  on public.profiles for select to authenticated
  using (id = (select auth.uid()) and (select public.is_current_user_email_confirmed()));

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own
  on public.profiles for update to authenticated
  using (id = (select auth.uid()) and (select public.is_current_user_email_confirmed()))
  with check (id = (select auth.uid()) and (select public.is_current_user_email_confirmed()));

drop policy if exists categories_select_own on public.categories;
create policy categories_select_own
  on public.categories for select to authenticated
  using (user_id = (select auth.uid()) and (select public.is_current_user_email_confirmed()));

drop policy if exists categories_insert_own on public.categories;
create policy categories_insert_own
  on public.categories for insert to authenticated
  with check (user_id = (select auth.uid()) and (select public.is_current_user_email_confirmed()));

drop policy if exists categories_update_own on public.categories;
create policy categories_update_own
  on public.categories for update to authenticated
  using (user_id = (select auth.uid()) and (select public.is_current_user_email_confirmed()))
  with check (user_id = (select auth.uid()) and (select public.is_current_user_email_confirmed()));

drop policy if exists income_sources_select_own on public.income_sources;
create policy income_sources_select_own
  on public.income_sources for select to authenticated
  using (user_id = (select auth.uid()) and (select public.is_current_user_email_confirmed()));

drop policy if exists income_sources_insert_own on public.income_sources;
create policy income_sources_insert_own
  on public.income_sources for insert to authenticated
  with check (user_id = (select auth.uid()) and (select public.is_current_user_email_confirmed()));

drop policy if exists income_sources_update_own on public.income_sources;
create policy income_sources_update_own
  on public.income_sources for update to authenticated
  using (user_id = (select auth.uid()) and (select public.is_current_user_email_confirmed()))
  with check (user_id = (select auth.uid()) and (select public.is_current_user_email_confirmed()));

drop policy if exists savings_goals_select_own on public.savings_goals;
create policy savings_goals_select_own
  on public.savings_goals for select to authenticated
  using (user_id = (select auth.uid()) and (select public.is_current_user_email_confirmed()));

drop policy if exists savings_goals_insert_own on public.savings_goals;
create policy savings_goals_insert_own
  on public.savings_goals for insert to authenticated
  with check (user_id = (select auth.uid()) and (select public.is_current_user_email_confirmed()));

drop policy if exists savings_goals_update_own on public.savings_goals;
create policy savings_goals_update_own
  on public.savings_goals for update to authenticated
  using (user_id = (select auth.uid()) and (select public.is_current_user_email_confirmed()))
  with check (user_id = (select auth.uid()) and (select public.is_current_user_email_confirmed()));

drop policy if exists transactions_select_own on public.transactions;
create policy transactions_select_own
  on public.transactions for select to authenticated
  using (user_id = (select auth.uid()) and (select public.is_current_user_email_confirmed()));

drop policy if exists transactions_insert_own on public.transactions;
create policy transactions_insert_own
  on public.transactions for insert to authenticated
  with check (user_id = (select auth.uid()) and (select public.is_current_user_email_confirmed()));

drop policy if exists transactions_update_own on public.transactions;
create policy transactions_update_own
  on public.transactions for update to authenticated
  using (user_id = (select auth.uid()) and (select public.is_current_user_email_confirmed()))
  with check (user_id = (select auth.uid()) and (select public.is_current_user_email_confirmed()));

drop policy if exists budgets_select_own on public.budgets;
create policy budgets_select_own
  on public.budgets for select to authenticated
  using (user_id = (select auth.uid()) and (select public.is_current_user_email_confirmed()));

drop policy if exists budgets_insert_own on public.budgets;
create policy budgets_insert_own
  on public.budgets for insert to authenticated
  with check (user_id = (select auth.uid()) and (select public.is_current_user_email_confirmed()));

drop policy if exists budgets_update_own on public.budgets;
create policy budgets_update_own
  on public.budgets for update to authenticated
  using (user_id = (select auth.uid()) and (select public.is_current_user_email_confirmed()))
  with check (user_id = (select auth.uid()) and (select public.is_current_user_email_confirmed()));

drop policy if exists assets_select_own on public.assets;
create policy assets_select_own
  on public.assets for select to authenticated
  using (user_id = (select auth.uid()) and (select public.is_current_user_email_confirmed()));

drop policy if exists assets_insert_own on public.assets;
create policy assets_insert_own
  on public.assets for insert to authenticated
  with check (user_id = (select auth.uid()) and (select public.is_current_user_email_confirmed()));

drop policy if exists assets_update_own on public.assets;
create policy assets_update_own
  on public.assets for update to authenticated
  using (user_id = (select auth.uid()) and (select public.is_current_user_email_confirmed()))
  with check (user_id = (select auth.uid()) and (select public.is_current_user_email_confirmed()));

drop policy if exists asset_valuations_select_own on public.asset_valuations;
create policy asset_valuations_select_own
  on public.asset_valuations for select to authenticated
  using (user_id = (select auth.uid()) and (select public.is_current_user_email_confirmed()));

drop policy if exists holdings_select_own on public.investment_holdings;
create policy holdings_select_own
  on public.investment_holdings for select to authenticated
  using (user_id = (select auth.uid()) and (select public.is_current_user_email_confirmed()));

drop policy if exists holdings_insert_own on public.investment_holdings;
create policy holdings_insert_own
  on public.investment_holdings for insert to authenticated
  with check (user_id = (select auth.uid()) and (select public.is_current_user_email_confirmed()));

drop policy if exists holdings_update_own on public.investment_holdings;
create policy holdings_update_own
  on public.investment_holdings for update to authenticated
  using (user_id = (select auth.uid()) and (select public.is_current_user_email_confirmed()))
  with check (user_id = (select auth.uid()) and (select public.is_current_user_email_confirmed()));

drop policy if exists holding_valuations_select_own on public.holding_valuations;
create policy holding_valuations_select_own
  on public.holding_valuations for select to authenticated
  using (user_id = (select auth.uid()) and (select public.is_current_user_email_confirmed()));

drop policy if exists liabilities_select_own on public.liabilities;
create policy liabilities_select_own
  on public.liabilities for select to authenticated
  using (user_id = (select auth.uid()) and (select public.is_current_user_email_confirmed()));

drop policy if exists liabilities_insert_own on public.liabilities;
create policy liabilities_insert_own
  on public.liabilities for insert to authenticated
  with check (user_id = (select auth.uid()) and (select public.is_current_user_email_confirmed()));

drop policy if exists liabilities_update_own on public.liabilities;
create policy liabilities_update_own
  on public.liabilities for update to authenticated
  using (user_id = (select auth.uid()) and (select public.is_current_user_email_confirmed()))
  with check (user_id = (select auth.uid()) and (select public.is_current_user_email_confirmed()));
