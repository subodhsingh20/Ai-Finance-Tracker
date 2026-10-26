create or replace function public.create_ai_transaction_batch(
  p_submission_id uuid,
  p_items jsonb
)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  item_count integer;
  existing_count integer;
begin
  if caller_id is null then
    raise exception using errcode = '42501', message = 'Authentication is required.';
  end if;
  if p_submission_id is null or p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception using errcode = '22023', message = 'A submission ID and an array of entries are required.';
  end if;

  item_count := jsonb_array_length(p_items);
  if item_count < 1 or item_count > 25 then
    raise exception using errcode = '22023', message = 'An AI batch must contain between 1 and 25 entries.';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_items) as item(value)
    where jsonb_typeof(item.value) <> 'object'
      or not (item.value ?& array[
        'type', 'amount', 'category_id', 'description', 'occurred_on', 'submission_item_index'
      ])
      or exists (
        select 1
        from jsonb_object_keys(
          case when jsonb_typeof(item.value) = 'object' then item.value else '{}'::jsonb end
        ) as field_name(name)
        where field_name.name not in (
          'type', 'amount', 'category_id', 'description', 'occurred_on',
          'income_source_id', 'source_name', 'merchant_name', 'instrument_name',
          'savings_goal_id', 'submission_item_index'
        )
      )
  ) then
    raise exception using errcode = '22023', message = 'An AI batch entry has missing or unsupported fields.';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_items) as item(value)
    where jsonb_typeof(item.value -> 'type') <> 'string'
      or jsonb_typeof(item.value -> 'amount') <> 'number'
      or jsonb_typeof(item.value -> 'category_id') <> 'string'
      or jsonb_typeof(item.value -> 'description') <> 'string'
      or jsonb_typeof(item.value -> 'occurred_on') <> 'string'
      or jsonb_typeof(item.value -> 'submission_item_index') <> 'number'
      or (item.value ? 'income_source_id' and jsonb_typeof(item.value -> 'income_source_id') not in ('string', 'null'))
      or (item.value ? 'source_name' and jsonb_typeof(item.value -> 'source_name') not in ('string', 'null'))
      or (item.value ? 'merchant_name' and jsonb_typeof(item.value -> 'merchant_name') not in ('string', 'null'))
      or (item.value ? 'instrument_name' and jsonb_typeof(item.value -> 'instrument_name') not in ('string', 'null'))
      or (item.value ? 'savings_goal_id' and jsonb_typeof(item.value -> 'savings_goal_id') not in ('string', 'null'))
  ) or exists (
    select 1
    from jsonb_to_recordset(p_items) as item(
      type text,
      amount numeric,
      category_id uuid,
      description text,
      occurred_on date,
      submission_item_index integer
    )
    where item.type is null or item.type not in ('income', 'expense', 'investment', 'savings')
      or item.amount is null or item.amount <= 0
      or item.amount > 999999999999.99
      or item.amount * 100 <> trunc(item.amount * 100)
      or item.category_id is null
      or item.description is null or length(btrim(item.description)) = 0
      or item.occurred_on is null
      or item.submission_item_index is null or item.submission_item_index < 0
  ) or (
    select count(distinct item.submission_item_index)
    from jsonb_to_recordset(p_items) as item(submission_item_index integer)
  ) <> item_count then
    raise exception using errcode = '22023', message = 'An AI batch entry contains invalid values or duplicate item indexes.';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(caller_id::text || ':' || p_submission_id::text, 0)
  );

  select count(*) into existing_count
  from public.transactions as transaction
  where transaction.user_id = caller_id
    and transaction.submission_id = p_submission_id;

  if existing_count > 0 then
    if existing_count <> item_count or exists (
      select 1
      from jsonb_to_recordset(p_items) as item(
        type text,
        amount numeric,
        category_id uuid,
        description text,
        occurred_on date,
        income_source_id uuid,
        source_name text,
        merchant_name text,
        instrument_name text,
        savings_goal_id uuid,
        submission_item_index integer
      )
      left join public.transactions as saved
        on saved.user_id = caller_id
        and saved.submission_id = p_submission_id
        and saved.submission_item_index = item.submission_item_index
      where saved.id is null
        or saved.type is distinct from item.type
        or saved.amount is distinct from item.amount
        or saved.category_id is distinct from item.category_id
        or saved.description is distinct from item.description
        or saved.occurred_on is distinct from item.occurred_on
        or saved.income_source_id is distinct from item.income_source_id
        or saved.source_name is distinct from item.source_name
        or saved.merchant_name is distinct from item.merchant_name
        or saved.instrument_name is distinct from item.instrument_name
        or saved.savings_goal_id is distinct from item.savings_goal_id
    ) then
      raise exception using errcode = '23505', message = 'This submission ID already has different saved entries.';
    end if;
    return item_count;
  end if;

  insert into public.transactions(
    user_id, type, amount, category_id, description, occurred_on,
    income_source_id, source_name, merchant_name, instrument_name, savings_goal_id,
    created_via, submission_id, submission_item_index
  )
  select
    caller_id, item.type, item.amount, item.category_id, item.description, item.occurred_on,
    item.income_source_id, item.source_name, item.merchant_name, item.instrument_name, item.savings_goal_id,
    'AI', p_submission_id, item.submission_item_index
  from jsonb_to_recordset(p_items) as item(
    type text,
    amount numeric,
    category_id uuid,
    description text,
    occurred_on date,
    income_source_id uuid,
    source_name text,
    merchant_name text,
    instrument_name text,
    savings_goal_id uuid,
    submission_item_index integer
  );

  return item_count;
end
$$;

revoke all on function public.create_ai_transaction_batch(uuid, jsonb) from public, anon;
grant execute on function public.create_ai_transaction_batch(uuid, jsonb) to authenticated;
