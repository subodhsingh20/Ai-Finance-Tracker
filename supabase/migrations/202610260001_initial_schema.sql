create schema if not exists extensions;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text check (display_name is null or char_length(display_name) <= 100),
  currency text not null default 'INR' check (currency = 'INR'),
  timezone text not null default 'Asia/Kolkata',
  onboarding_completed boolean not null default false,
  enabled_modules text[] not null default array['overview','transactions','budgets','savings','investments','assets']::text[],
  dashboard_preferences jsonb not null default '{}'::jsonb check (jsonb_typeof(dashboard_preferences) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null check (type in ('income','expense','investment','savings')),
  name text not null check (char_length(name) between 1 and 80),
  icon text check (icon is null or char_length(icon) <= 40),
  color text check (color is null or char_length(color) <= 20),
  is_default boolean not null default false,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id, type),
  unique (user_id, type, name)
);

create table public.income_sources (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  unique (user_id, name)
);

create table public.savings_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  target_amount numeric(14,2) not null check (target_amount >= 0),
  target_date date,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id)
);

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null check (type in ('income','expense','investment','savings')),
  amount numeric(14,2) not null check (amount > 0),
  category_id uuid not null,
  description text not null check (char_length(description) between 1 and 180),
  occurred_on date not null,
  source_name text check (source_name is null or char_length(source_name) <= 120),
  income_source_id uuid,
  merchant_name text check (merchant_name is null or char_length(merchant_name) <= 120),
  instrument_name text check (instrument_name is null or char_length(instrument_name) <= 120),
  payment_method text check (payment_method is null or payment_method in ('cash','upi','card','bank_transfer','other')),
  savings_goal_id uuid,
  notes text check (notes is null or char_length(notes) <= 1000),
  created_via text not null default 'manual' check (created_via in ('manual','AI')),
  submission_id uuid not null,
  submission_item_index integer not null check (submission_item_index >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  foreign key (category_id, user_id, type) references public.categories(id, user_id, type),
  foreign key (income_source_id, user_id) references public.income_sources(id, user_id),
  foreign key (savings_goal_id, user_id) references public.savings_goals(id, user_id),
  check (income_source_id is null or type = 'income'),
  check (savings_goal_id is null or type = 'savings'),
  unique (user_id, submission_id, submission_item_index)
);
create index transactions_user_date_idx on public.transactions(user_id, occurred_on desc) where deleted_at is null;
create index transactions_user_category_idx on public.transactions(user_id, category_id, occurred_on desc) where deleted_at is null;
create index transactions_user_type_idx on public.transactions(user_id, type, occurred_on desc) where deleted_at is null;

create table public.budgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category_id uuid,
  category_type text not null default 'expense' check (category_type = 'expense'),
  month_start date not null check (extract(day from month_start) = 1),
  limit_amount numeric(14,2) not null check (limit_amount > 0),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (category_id, user_id, category_type) references public.categories(id, user_id, type)
);
create unique index budgets_overall_active_unique on public.budgets(user_id, month_start) where category_id is null and archived_at is null;
create unique index budgets_category_active_unique on public.budgets(user_id, category_id, month_start) where category_id is not null and archived_at is null;

create table public.assets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  category text not null check (category in ('bank_cash','real_estate','vehicle','gold_jewellery','other_valuables')),
  current_value numeric(14,2) not null check (current_value >= 0),
  as_of_date date not null,
  description text check (description is null or char_length(description) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  unique (id, user_id)
);

create table public.asset_valuations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  asset_id uuid not null,
  value numeric(14,2) not null check (value >= 0),
  as_of_date date not null,
  recorded_at timestamptz not null default now(),
  foreign key (asset_id, user_id) references public.assets(id, user_id)
);
create index asset_valuations_latest_idx on public.asset_valuations(user_id, asset_id, as_of_date desc, recorded_at desc);

create table public.investment_holdings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  instrument_type text not null check (char_length(instrument_type) between 1 and 80),
  symbol text check (symbol is null or char_length(symbol) <= 40),
  quantity numeric(18,6) check (quantity is null or quantity >= 0),
  current_value numeric(14,2) not null check (current_value >= 0),
  as_of_date date not null,
  notes text check (notes is null or char_length(notes) <= 1000),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id)
);

create table public.holding_valuations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  holding_id uuid not null,
  value numeric(14,2) not null check (value >= 0),
  as_of_date date not null,
  recorded_at timestamptz not null default now(),
  foreign key (holding_id, user_id) references public.investment_holdings(id, user_id)
);
create index holding_valuations_latest_idx on public.holding_valuations(user_id, holding_id, as_of_date desc, recorded_at desc);

create table public.liabilities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  category text not null check (char_length(category) between 1 and 80),
  outstanding_balance numeric(14,2) not null check (outstanding_balance >= 0),
  as_of_date date not null,
  due_date date,
  notes text check (notes is null or char_length(notes) <= 1000),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.ai_usage_daily (
  user_id uuid not null references auth.users(id) on delete cascade,
  usage_date date not null,
  call_count integer not null default 0 check (call_count between 0 and 30),
  primary key (user_id, usage_date)
);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end
$$;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'profiles','categories','income_sources','savings_goals','transactions',
    'budgets','assets','investment_holdings','liabilities'
  ] loop
    execute format(
      'create trigger %I_touch before update on public.%I for each row execute function public.touch_updated_at()',
      table_name, table_name
    );
  end loop;
end
$$;

create or replace function public.record_asset_valuation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.asset_valuations(user_id, asset_id, value, as_of_date)
  values (new.user_id, new.id, new.current_value, new.as_of_date);
  return new;
end
$$;
create trigger assets_record_valuation
after insert or update of current_value, as_of_date on public.assets
for each row execute function public.record_asset_valuation();

create or replace function public.record_holding_valuation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.holding_valuations(user_id, holding_id, value, as_of_date)
  values (new.user_id, new.id, new.current_value, new.as_of_date);
  return new;
end
$$;
create trigger holdings_record_valuation
after insert or update of current_value, as_of_date on public.investment_holdings
for each row execute function public.record_holding_valuation();

create or replace function public.consume_ai_usage()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_count integer;
  caller_id uuid := auth.uid();
begin
  if caller_id is null or not exists (
    select 1 from auth.users
    where id = caller_id and email_confirmed_at is not null
  ) then
    return false;
  end if;

  insert into public.ai_usage_daily(user_id, usage_date, call_count)
  values (caller_id, (now() at time zone 'UTC')::date, 1)
  on conflict (user_id, usage_date) do update
  set call_count = public.ai_usage_daily.call_count + 1
  where public.ai_usage_daily.call_count < 30
  returning call_count into current_count;

  return current_count is not null and current_count <= 30;
end
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles(id) values (new.id);
  insert into public.categories(user_id, type, name, is_default) values
    (new.id,'income','Salary',true),(new.id,'income','Freelance',true),(new.id,'income','Rapido / Gig Work',true),(new.id,'income','Other',true),
    (new.id,'expense','Food & Groceries',true),(new.id,'expense','Transport',true),(new.id,'expense','Housing & Utilities',true),(new.id,'expense','Shopping',true),(new.id,'expense','Entertainment',true),(new.id,'expense','Health',true),(new.id,'expense','Education',true),(new.id,'expense','Subscriptions',true),(new.id,'expense','Miscellaneous',true),
    (new.id,'investment','Stocks / Mutual Funds / ETF',true),(new.id,'investment','Fixed Deposit / RD',true),(new.id,'investment','Gold',true),(new.id,'investment','Other',true),
    (new.id,'savings','Emergency Fund',true),(new.id,'savings','Goal-based Savings',true);
  return new;
end
$$;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

insert into public.profiles(id)
select id from auth.users
on conflict (id) do nothing;

insert into public.categories(user_id, type, name, is_default)
select users.id, defaults.type, defaults.name, true
from auth.users as users
cross join (values
  ('income','Salary'),('income','Freelance'),('income','Rapido / Gig Work'),('income','Other'),
  ('expense','Food & Groceries'),('expense','Transport'),('expense','Housing & Utilities'),('expense','Shopping'),
  ('expense','Entertainment'),('expense','Health'),('expense','Education'),('expense','Subscriptions'),('expense','Miscellaneous'),
  ('investment','Stocks / Mutual Funds / ETF'),('investment','Fixed Deposit / RD'),('investment','Gold'),('investment','Other'),
  ('savings','Emergency Fund'),('savings','Goal-based Savings')
) as defaults(type, name)
on conflict (user_id, type, name) do nothing;

alter table public.profiles enable row level security;
alter table public.categories enable row level security;
alter table public.income_sources enable row level security;
alter table public.savings_goals enable row level security;
alter table public.transactions enable row level security;
alter table public.budgets enable row level security;
alter table public.assets enable row level security;
alter table public.asset_valuations enable row level security;
alter table public.investment_holdings enable row level security;
alter table public.holding_valuations enable row level security;
alter table public.liabilities enable row level security;
alter table public.ai_usage_daily enable row level security;

revoke all on all tables in schema public from public, anon, authenticated;
grant usage on schema public to authenticated;

grant select, update on public.profiles to authenticated;
grant select, insert, update on public.categories to authenticated;
grant select, insert, update on public.income_sources to authenticated;
grant select, insert, update on public.savings_goals to authenticated;
grant select, insert, update on public.transactions to authenticated;
grant select, insert, update on public.budgets to authenticated;
grant select, insert, update on public.assets to authenticated;
grant select on public.asset_valuations to authenticated;
grant select, insert, update on public.investment_holdings to authenticated;
grant select on public.holding_valuations to authenticated;
grant select, insert, update on public.liabilities to authenticated;

create policy profiles_select_own on public.profiles
for select to authenticated using (id = (select auth.uid()));
create policy profiles_update_own on public.profiles
for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy categories_select_own on public.categories
for select to authenticated using (user_id = (select auth.uid()));
create policy categories_insert_own on public.categories
for insert to authenticated with check (user_id = (select auth.uid()));
create policy categories_update_own on public.categories
for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy income_sources_select_own on public.income_sources
for select to authenticated using (user_id = (select auth.uid()));
create policy income_sources_insert_own on public.income_sources
for insert to authenticated with check (user_id = (select auth.uid()));
create policy income_sources_update_own on public.income_sources
for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy savings_goals_select_own on public.savings_goals
for select to authenticated using (user_id = (select auth.uid()));
create policy savings_goals_insert_own on public.savings_goals
for insert to authenticated with check (user_id = (select auth.uid()));
create policy savings_goals_update_own on public.savings_goals
for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy transactions_select_own on public.transactions
for select to authenticated using (user_id = (select auth.uid()));
create policy transactions_insert_own on public.transactions
for insert to authenticated with check (user_id = (select auth.uid()));
create policy transactions_update_own on public.transactions
for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy budgets_select_own on public.budgets
for select to authenticated using (user_id = (select auth.uid()));
create policy budgets_insert_own on public.budgets
for insert to authenticated with check (user_id = (select auth.uid()));
create policy budgets_update_own on public.budgets
for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy assets_select_own on public.assets
for select to authenticated using (user_id = (select auth.uid()));
create policy assets_insert_own on public.assets
for insert to authenticated with check (user_id = (select auth.uid()));
create policy assets_update_own on public.assets
for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy asset_valuations_select_own on public.asset_valuations
for select to authenticated using (user_id = (select auth.uid()));

create policy holdings_select_own on public.investment_holdings
for select to authenticated using (user_id = (select auth.uid()));
create policy holdings_insert_own on public.investment_holdings
for insert to authenticated with check (user_id = (select auth.uid()));
create policy holdings_update_own on public.investment_holdings
for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy holding_valuations_select_own on public.holding_valuations
for select to authenticated using (user_id = (select auth.uid()));

create policy liabilities_select_own on public.liabilities
for select to authenticated using (user_id = (select auth.uid()));
create policy liabilities_insert_own on public.liabilities
for insert to authenticated with check (user_id = (select auth.uid()));
create policy liabilities_update_own on public.liabilities
for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

revoke all on function public.touch_updated_at() from public, anon, authenticated;
revoke all on function public.record_asset_valuation() from public, anon, authenticated;
revoke all on function public.record_holding_valuation() from public, anon, authenticated;
revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.consume_ai_usage() from public, anon, authenticated;
grant execute on function public.consume_ai_usage() to authenticated;
