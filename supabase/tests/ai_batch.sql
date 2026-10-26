begin;
select plan(14);

insert into auth.users(
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000051','authenticated','authenticated','batch-a@example.test','',now(),'{"provider":"email","providers":["email"]}','{}',now(),now()),
  ('00000000-0000-0000-0000-000000000052','authenticated','authenticated','batch-b@example.test','',now(),'{"provider":"email","providers":["email"]}','{}',now(),now());

update public.categories
set id = '50000000-0000-0000-0000-000000000052'
where user_id='00000000-0000-0000-0000-000000000052'
  and type='expense' and name='Food & Groceries';

set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000051',true);

select ok(
  has_function_privilege('authenticated','public.create_ai_transaction_batch(uuid,jsonb)','execute'),
  'authenticated users can invoke the owner-scoped batch RPC'
);
select ok(
  not has_function_privilege('anon','public.create_ai_transaction_batch(uuid,jsonb)','execute'),
  'anonymous users cannot invoke the batch RPC'
);
select ok(
  not (select prosecdef from pg_catalog.pg_proc where oid='public.create_ai_transaction_batch(uuid,jsonb)'::regprocedure),
  'batch RPC runs with caller privileges rather than SECURITY DEFINER'
);
select ok(
  not has_table_privilege('authenticated','public.transactions','delete'),
  'authenticated users have no direct transaction DELETE privilege'
);
select throws_ok(
  $$select public.create_ai_transaction_batch(
    '50000000-0000-0000-0000-000000000055',
    (
      select jsonb_agg(jsonb_build_object(
        'type','expense','amount',10,
        'category_id',(select id from public.categories where user_id=auth.uid() and type='expense' and name='Food & Groceries'),
        'description','Oversized batch item','occurred_on',current_date,'submission_item_index',item_index
      ))
      from generate_series(0,25) as sequence(item_index)
    )
  )$$,
  '22023',null,'the database rejects batches larger than 25 entries'
);

select is(
  public.create_ai_transaction_batch(
    '50000000-0000-0000-0000-000000000051',
    jsonb_build_array(
      jsonb_build_object(
        'type','expense','amount',300,'category_id',(select id from public.categories where user_id=auth.uid() and type='expense' and name='Food & Groceries'),
        'description','Food','occurred_on',current_date,'submission_item_index',0
      ),
      jsonb_build_object(
        'type','expense','amount',500,'category_id',(select id from public.categories where user_id=auth.uid() and type='expense' and name='Transport'),
        'description','Petrol','occurred_on',current_date,'submission_item_index',1
      )
    )
  ),
  2,
  'batch RPC creates every requested record'
);
select is(
  (select count(*)::int from public.transactions where submission_id='50000000-0000-0000-0000-000000000051'),
  2,
  'both batch rows are visible to their owner'
);
select is(
  public.create_ai_transaction_batch(
    '50000000-0000-0000-0000-000000000051',
    jsonb_build_array(
      jsonb_build_object(
        'type','expense','amount',300,'category_id',(select id from public.categories where user_id=auth.uid() and type='expense' and name='Food & Groceries'),
        'description','Food','occurred_on',current_date,'submission_item_index',0
      ),
      jsonb_build_object(
        'type','expense','amount',500,'category_id',(select id from public.categories where user_id=auth.uid() and type='expense' and name='Transport'),
        'description','Petrol','occurred_on',current_date,'submission_item_index',1
      )
    )
  ),
  2,
  'an exact retry is idempotent and reports the existing batch'
);
select is(
  (select count(*)::int from public.transactions where submission_id='50000000-0000-0000-0000-000000000051'),
  2,
  'an exact retry does not duplicate rows'
);

select throws_ok(
  $$select public.create_ai_transaction_batch(
    '50000000-0000-0000-0000-000000000051',
    '[{"type":"expense","amount":301,"category_id":"00000000-0000-0000-0000-000000000000","description":"Changed retry","occurred_on":"2026-10-28","submission_item_index":0}]'::jsonb
  )$$,
  '23505',null,'a submission ID cannot be replayed with different data'
);

select throws_ok(
  $$select public.create_ai_transaction_batch(
    '50000000-0000-0000-0000-000000000053',
    '[{"user_id":"00000000-0000-0000-0000-000000000052","type":"expense","amount":10,"category_id":"00000000-0000-0000-0000-000000000000","description":"Spoofed owner","occurred_on":"2026-10-28","submission_item_index":0}]'::jsonb
  )$$,
  '22023',null,'the RPC rejects client-supplied ownership fields'
);

select throws_ok(
  $$select public.create_ai_transaction_batch(
    '50000000-0000-0000-0000-000000000054',
    jsonb_build_array(
      jsonb_build_object(
        'type','expense','amount',25,'category_id',(select id from public.categories where user_id=auth.uid() and type='expense' and name='Food & Groceries'),
        'description','Valid first row','occurred_on',current_date,'submission_item_index',0
      ),
      jsonb_build_object(
        'type','expense','amount',20,'category_id','50000000-0000-0000-0000-000000000052',
        'description','Foreign category','occurred_on',current_date,'submission_item_index',1
      )
    )
  )$$,
  '23503',null,'cross-user category ownership rejects the entire batch'
);
select is(
  (select count(*)::int from public.transactions where submission_id='50000000-0000-0000-0000-000000000054'),
  0,
  'a failed batch leaves no earlier item partially inserted'
);
select is(
  (select count(*)::int from public.transactions where user_id='00000000-0000-0000-0000-000000000052'),
  0,
  'a caller cannot create or touch another user transaction'
);

select * from finish();
rollback;
