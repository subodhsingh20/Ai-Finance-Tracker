create or replace function public.preserve_trash_origin()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.deleted_at is not null then
      raise exception using
        errcode = '22023',
        message = 'Create the record before moving it to Trash.';
    end if;
    new.trashed_from_archived_at := null;
    return new;
  end if;

  if old.deleted_at is null and new.deleted_at is not null then
    new.trashed_from_archived_at := old.archived_at;
    new.archived_at := null;
  elsif old.deleted_at is not null and new.deleted_at is null then
    new.archived_at := old.trashed_from_archived_at;
    new.trashed_from_archived_at := null;
  elsif old.deleted_at is not null then
    new.archived_at := null;
    new.trashed_from_archived_at := old.trashed_from_archived_at;
  else
    new.trashed_from_archived_at := null;
  end if;

  return new;
end
$$;

revoke all on function public.preserve_trash_origin() from public, anon, authenticated;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'categories',
    'income_sources',
    'savings_goals',
    'budgets',
    'assets',
    'investment_holdings',
    'liabilities'
  ] loop
    execute format(
      'alter table public.%I
        add column deleted_at timestamptz,
        add column trashed_from_archived_at timestamptz,
        add constraint %I check (deleted_at is null or archived_at is null),
        add constraint %I check (trashed_from_archived_at is null or deleted_at is not null)',
      table_name,
      table_name || '_archive_trash_state_check',
      table_name || '_trash_origin_check'
    );
    execute format(
      'create index %I on public.%I (user_id, archived_at desc)
        where archived_at is not null and deleted_at is null',
      table_name || '_user_archived_idx',
      table_name
    );
    execute format(
      'create index %I on public.%I (user_id, deleted_at desc)
        where deleted_at is not null',
      table_name || '_user_trash_idx',
      table_name
    );
    execute format(
      'create trigger %I before insert or update on public.%I
        for each row execute function public.preserve_trash_origin()',
      table_name || '_preserve_trash_origin',
      table_name
    );
  end loop;
end
$$;

create or replace function public.permanently_delete_trashed_record(
  p_record_type text,
  p_record_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  affected_rows integer;
begin
  if caller_id is null then
    raise exception using errcode = '42501', message = 'Authentication is required.';
  end if;
  if p_record_type is null or p_record_type not in (
    'transactions',
    'categories',
    'income_sources',
    'savings_goals',
    'budgets',
    'assets',
    'investment_holdings',
    'liabilities'
  ) then
    raise exception using errcode = '22023', message = 'Unsupported Trash record type.';
  end if;
  if p_record_id is null then
    raise exception using errcode = '22023', message = 'A record ID is required.';
  end if;

  case p_record_type
    when 'transactions' then
      delete from public.transactions
      where id = p_record_id and user_id = caller_id and deleted_at is not null;
    when 'categories' then
      delete from public.categories
      where id = p_record_id and user_id = caller_id and deleted_at is not null;
    when 'income_sources' then
      delete from public.income_sources
      where id = p_record_id and user_id = caller_id and deleted_at is not null;
    when 'savings_goals' then
      delete from public.savings_goals
      where id = p_record_id and user_id = caller_id and deleted_at is not null;
    when 'budgets' then
      delete from public.budgets
      where id = p_record_id and user_id = caller_id and deleted_at is not null;
    when 'assets' then
      perform 1 from public.assets
      where id = p_record_id and user_id = caller_id and deleted_at is not null
      for update;
      if not found then
        return false;
      end if;
      delete from public.asset_valuations as valuation
      where valuation.asset_id = p_record_id
        and valuation.user_id = caller_id
        and exists (
          select 1 from public.assets as asset
          where asset.id = p_record_id
            and asset.user_id = caller_id
            and asset.deleted_at is not null
        );
      delete from public.assets
      where id = p_record_id and user_id = caller_id and deleted_at is not null;
    when 'investment_holdings' then
      perform 1 from public.investment_holdings
      where id = p_record_id and user_id = caller_id and deleted_at is not null
      for update;
      if not found then
        return false;
      end if;
      delete from public.holding_valuations as valuation
      where valuation.holding_id = p_record_id
        and valuation.user_id = caller_id
        and exists (
          select 1 from public.investment_holdings as holding
          where holding.id = p_record_id
            and holding.user_id = caller_id
            and holding.deleted_at is not null
        );
      delete from public.investment_holdings
      where id = p_record_id and user_id = caller_id and deleted_at is not null;
    when 'liabilities' then
      delete from public.liabilities
      where id = p_record_id and user_id = caller_id and deleted_at is not null;
  end case;

  get diagnostics affected_rows = row_count;
  return affected_rows = 1;
exception
  when foreign_key_violation then
    raise exception using
      errcode = '23503',
      message = 'This record is still referenced by financial history and cannot be permanently deleted.';
end
$$;

create or replace function public.empty_current_user_trash()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  deleted_count integer := 0;
  affected_rows integer;
begin
  if caller_id is null then
    raise exception using errcode = '42501', message = 'Authentication is required.';
  end if;

  delete from public.transactions
  where user_id = caller_id and deleted_at is not null;
  get diagnostics affected_rows = row_count;
  deleted_count := deleted_count + affected_rows;

  delete from public.budgets
  where user_id = caller_id and deleted_at is not null;
  get diagnostics affected_rows = row_count;
  deleted_count := deleted_count + affected_rows;

  perform 1 from public.assets
  where user_id = caller_id and deleted_at is not null
  for update;
  delete from public.asset_valuations as valuation
  where valuation.user_id = caller_id
    and exists (
      select 1 from public.assets as asset
      where asset.id = valuation.asset_id
        and asset.user_id = caller_id
        and asset.deleted_at is not null
    );
  delete from public.assets
  where user_id = caller_id and deleted_at is not null;
  get diagnostics affected_rows = row_count;
  deleted_count := deleted_count + affected_rows;

  perform 1 from public.investment_holdings
  where user_id = caller_id and deleted_at is not null
  for update;
  delete from public.holding_valuations as valuation
  where valuation.user_id = caller_id
    and exists (
      select 1 from public.investment_holdings as holding
      where holding.id = valuation.holding_id
        and holding.user_id = caller_id
        and holding.deleted_at is not null
    );
  delete from public.investment_holdings
  where user_id = caller_id and deleted_at is not null;
  get diagnostics affected_rows = row_count;
  deleted_count := deleted_count + affected_rows;

  delete from public.liabilities
  where user_id = caller_id and deleted_at is not null;
  get diagnostics affected_rows = row_count;
  deleted_count := deleted_count + affected_rows;

  delete from public.income_sources
  where user_id = caller_id and deleted_at is not null;
  get diagnostics affected_rows = row_count;
  deleted_count := deleted_count + affected_rows;

  delete from public.savings_goals
  where user_id = caller_id and deleted_at is not null;
  get diagnostics affected_rows = row_count;
  deleted_count := deleted_count + affected_rows;

  delete from public.categories
  where user_id = caller_id and deleted_at is not null;
  get diagnostics affected_rows = row_count;
  deleted_count := deleted_count + affected_rows;

  return deleted_count;
exception
  when foreign_key_violation then
    raise exception using
      errcode = '23503',
      message = 'Trash could not be emptied because a trashed record is still referenced by financial history. No records were deleted.';
end
$$;

revoke all on function public.permanently_delete_trashed_record(text, uuid) from public, anon, authenticated;
revoke all on function public.empty_current_user_trash() from public, anon, authenticated;
grant execute on function public.permanently_delete_trashed_record(text, uuid) to authenticated;
grant execute on function public.empty_current_user_trash() to authenticated;
