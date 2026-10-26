begin;
select plan(20);

insert into auth.users(
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000001','authenticated','authenticated','ledger-a@example.test','',now(),'{"provider":"email","providers":["email"]}','{}',now(),now()),
  ('00000000-0000-0000-0000-000000000002','authenticated','authenticated','ledger-b@example.test','',null,'{"provider":"email","providers":["email"]}','{}',now(),now());

insert into public.categories(id, user_id, type, name)
values (
  '10000000-0000-0000-0000-000000000004',
  '00000000-0000-0000-0000-000000000002',
  'expense',
  'Foreign ownership test'
);

insert into public.transactions(
  id, user_id, type, amount, category_id, description, occurred_on,
  created_via, submission_id, submission_item_index, deleted_at
)
select
  '10000000-0000-0000-0000-000000000001', user_a.id, 'expense', 100,
  category_a.id, 'User A lunch', current_date, 'manual',
  '20000000-0000-0000-0000-000000000001', 0, null
from auth.users user_a
join public.categories category_a on category_a.user_id = user_a.id and category_a.type = 'expense' and category_a.name = 'Food & Groceries'
where user_a.id = '00000000-0000-0000-0000-000000000001';

insert into public.transactions(
  id, user_id, type, amount, category_id, description, occurred_on,
  created_via, submission_id, submission_item_index, deleted_at
)
select
  rows.id, user_b.id, 'expense', 200, category_b.id, rows.description,
  current_date, 'manual', rows.submission_id, 0, rows.deleted_at
from auth.users user_b
join public.categories category_b on category_b.user_id = user_b.id and category_b.type = 'expense' and category_b.name = 'Food & Groceries'
cross join (values
  ('10000000-0000-0000-0000-000000000002'::uuid,'User B active','20000000-0000-0000-0000-000000000002'::uuid,null::timestamptz),
  ('10000000-0000-0000-0000-000000000003'::uuid,'User B deleted','20000000-0000-0000-0000-000000000003'::uuid,now())
) as rows(id, description, submission_id, deleted_at)
where user_b.id = '00000000-0000-0000-0000-000000000002';

set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);

select is((select count(*)::int from public.profiles),1,'auth trigger provisions only the signed-in profile');
select is((select count(*)::int from public.categories where type='expense'),9,'auth trigger provisions default expense categories');
select is((select count(*)::int from public.transactions where user_id='00000000-0000-0000-0000-000000000001'),1,'user can read their own transaction');
select is((select count(*)::int from public.transactions where id='10000000-0000-0000-0000-000000000002'),0,'user cannot read another account transaction');
select throws_ok(
  $$insert into public.transactions(user_id,type,amount,category_id,description,occurred_on,created_via,submission_id,submission_item_index)
    values('00000000-0000-0000-0000-000000000002','expense',10,'00000000-0000-0000-0000-000000000000','cross-user insert',current_date,'manual','20000000-0000-0000-0000-000000000004',0)$$,
  '42501',null,'user cannot create a row for another account'
);
select lives_ok(
  $$update public.transactions set description='attempted cross-user update'
    where id='10000000-0000-0000-0000-000000000002'$$,
  'cross-user update request completes without exposing the target row'
);
reset role;
select is(
  (select count(*)::int from public.transactions
   where id='10000000-0000-0000-0000-000000000002' and description='User B active'),
  1,
  'RLS leaves another account transaction unchanged after an update attempt'
);
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
select throws_ok($$delete from public.transactions where id='10000000-0000-0000-0000-000000000002'$$,'42501',null,'clients cannot hard-delete transactions');
select lives_ok(
  $$update public.transactions set deleted_at=null
    where id='10000000-0000-0000-0000-000000000003'$$,
  'cross-user restore request completes without exposing the target row'
);
reset role;
select is(
  (select count(*)::int from public.transactions
   where id='10000000-0000-0000-0000-000000000003' and deleted_at is not null),
  1,
  'RLS leaves another account transaction in Trash after a restore attempt'
);
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
select throws_ok(
  $$insert into public.transactions(user_id,type,amount,category_id,description,occurred_on,created_via,submission_id,submission_item_index)
    values('00000000-0000-0000-0000-000000000001','expense',10,
      '10000000-0000-0000-0000-000000000004',
      'foreign category',current_date,'manual','20000000-0000-0000-0000-000000000005',0)$$,
  '23503',null,'category foreign key enforces composite ownership'
);
select throws_ok(
  $$insert into public.transactions(user_id,type,amount,category_id,description,occurred_on,created_via,submission_id,submission_item_index)
    values('00000000-0000-0000-0000-000000000001','expense',10,
      (select id from public.categories where user_id='00000000-0000-0000-0000-000000000001' and type='income' limit 1),
      'wrong type category',current_date,'manual','20000000-0000-0000-0000-000000000006',0)$$,
  '23503',null,'category foreign key enforces transaction type'
);
insert into public.transactions(user_id,type,amount,category_id,description,occurred_on,created_via,submission_id,submission_item_index)
select '00000000-0000-0000-0000-000000000001','expense',75,id,'idempotent retry',current_date,'AI','20000000-0000-0000-0000-000000000007',0
from public.categories where user_id='00000000-0000-0000-0000-000000000001' and type='expense' and name='Food & Groceries'
on conflict(user_id,submission_id,submission_item_index) do nothing;
insert into public.transactions(user_id,type,amount,category_id,description,occurred_on,created_via,submission_id,submission_item_index)
select '00000000-0000-0000-0000-000000000001','expense',75,id,'idempotent retry',current_date,'AI','20000000-0000-0000-0000-000000000007',0
from public.categories where user_id='00000000-0000-0000-0000-000000000001' and type='expense' and name='Food & Groceries'
on conflict(user_id,submission_id,submission_item_index) do nothing;
select is((select count(*)::int from public.transactions where submission_id='20000000-0000-0000-0000-000000000007'),1,'same user submission and item index are idempotent');
update public.transactions set deleted_at=now() where id='10000000-0000-0000-0000-000000000001';
select ok((select deleted_at is not null from public.transactions where id='10000000-0000-0000-0000-000000000001'),'soft delete marks the owned transaction');
update public.transactions set deleted_at=null where id='10000000-0000-0000-0000-000000000001';
select ok((select deleted_at is null from public.transactions where id='10000000-0000-0000-0000-000000000001'),'owner can restore a soft-deleted transaction');
select is((select count(*)::int from generate_series(1,30) where public.consume_ai_usage()),30,'quota permits exactly thirty calls for a verified user');
select ok(not public.consume_ai_usage(),'quota denies the thirty-first call');
select throws_ok($$select * from public.ai_usage_daily$$,'42501',null,'clients cannot read quota counters');

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',true);
select ok(not public.consume_ai_usage(),'unverified users cannot consume the AI quota');
select throws_ok(
  $$insert into public.ai_usage_daily(user_id,usage_date,call_count) values('00000000-0000-0000-0000-000000000002',current_date,30)$$,
  '42501',null,'clients cannot manipulate quota counters'
);

select * from finish();
rollback;
