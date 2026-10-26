begin;
select plan(22);

insert into auth.users(
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000003','authenticated','authenticated','archive-a@example.test','',now(),'{"provider":"email","providers":["email"]}','{}',now(),now()),
  ('00000000-0000-0000-0000-000000000004','authenticated','authenticated','archive-b@example.test','',now(),'{"provider":"email","providers":["email"]}','{}',now(),now());

insert into public.categories(id,user_id,type,name)
values
  ('30000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000003','expense','Archive dependency category'),
  ('30000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000003','income','Archive test income category'),
  ('30000000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000003','savings','Archive test savings category'),
  ('30000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000004','expense','Other user category');

insert into public.income_sources(id,user_id,name)
values ('30000000-0000-0000-0000-000000000040','00000000-0000-0000-0000-000000000003','Referenced source');
insert into public.savings_goals(id,user_id,name,target_amount)
values ('30000000-0000-0000-0000-000000000041','00000000-0000-0000-0000-000000000003','Referenced goal',100);

insert into public.transactions(
  id,user_id,type,amount,category_id,description,occurred_on,created_via,submission_id,submission_item_index
) values (
  '30000000-0000-0000-0000-000000000010','00000000-0000-0000-0000-000000000003','expense',10,
  '30000000-0000-0000-0000-000000000001','Retained financial history',current_date,'manual',
  '30000000-0000-0000-0000-000000000011',0
);
insert into public.transactions(
  id,user_id,type,amount,category_id,description,occurred_on,income_source_id,created_via,submission_id,submission_item_index
) values (
  '30000000-0000-0000-0000-000000000012','00000000-0000-0000-0000-000000000003','income',10,
  '30000000-0000-0000-0000-000000000003','Income history',current_date,'30000000-0000-0000-0000-000000000040',
  'manual','30000000-0000-0000-0000-000000000013',0
);
insert into public.transactions(
  id,user_id,type,amount,category_id,description,occurred_on,savings_goal_id,created_via,submission_id,submission_item_index
) values (
  '30000000-0000-0000-0000-000000000014','00000000-0000-0000-0000-000000000003','savings',10,
  '30000000-0000-0000-0000-000000000004','Savings history',current_date,'30000000-0000-0000-0000-000000000041',
  'manual','30000000-0000-0000-0000-000000000015',0
);

insert into public.assets(id,user_id,name,category,current_value,as_of_date)
values ('30000000-0000-0000-0000-000000000020','00000000-0000-0000-0000-000000000003','Trashed asset','other_valuables',10,current_date);
insert into public.investment_holdings(id,user_id,name,instrument_type,current_value,as_of_date)
values ('30000000-0000-0000-0000-000000000021','00000000-0000-0000-0000-000000000003','Trashed holding','fund',10,current_date);
insert into public.liabilities(id,user_id,name,category,outstanding_balance,as_of_date)
values
  ('30000000-0000-0000-0000-000000000030','00000000-0000-0000-0000-000000000003','Active liability','Loan',10,current_date),
  ('30000000-0000-0000-0000-000000000031','00000000-0000-0000-0000-000000000003','Archived liability','Loan',10,current_date),
  ('30000000-0000-0000-0000-000000000032','00000000-0000-0000-0000-000000000003','Trash batch liability','Loan',10,current_date),
  ('30000000-0000-0000-0000-000000000033','00000000-0000-0000-0000-000000000004','Other user trash','Loan',10,current_date),
  ('30000000-0000-0000-0000-000000000034','00000000-0000-0000-0000-000000000003','Archive-only liability','Loan',10,current_date),
  ('30000000-0000-0000-0000-000000000035','00000000-0000-0000-0000-000000000003','Trash rollback sentinel','Loan',10,current_date);

update public.liabilities
set archived_at = '2026-01-01T00:00:00Z'
where id in ('30000000-0000-0000-0000-000000000031','30000000-0000-0000-0000-000000000034');
update public.liabilities
set deleted_at = now()
where id in (
  '30000000-0000-0000-0000-000000000031',
  '30000000-0000-0000-0000-000000000032',
  '30000000-0000-0000-0000-000000000035',
  '30000000-0000-0000-0000-000000000033'
);
update public.assets set deleted_at = now() where id = '30000000-0000-0000-0000-000000000020';
update public.investment_holdings set deleted_at = now() where id = '30000000-0000-0000-0000-000000000021';
update public.categories set deleted_at = now() where id = '30000000-0000-0000-0000-000000000001';
update public.income_sources set deleted_at = now() where id = '30000000-0000-0000-0000-000000000040';
update public.savings_goals set deleted_at = now() where id = '30000000-0000-0000-0000-000000000041';

set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',true);

select is(
  public.permanently_delete_trashed_record('liabilities','30000000-0000-0000-0000-000000000030'),
  false,
  'active records cannot be permanently deleted'
);
select is(
  public.permanently_delete_trashed_record('liabilities','30000000-0000-0000-0000-000000000034'),
  false,
  'archived records cannot be permanently deleted before entering Trash'
);
select is(
  public.permanently_delete_trashed_record('liabilities','30000000-0000-0000-0000-000000000033'),
  false,
  'another user’s trashed record is not eligible for deletion'
);
select ok(
  (select archived_at is null and trashed_from_archived_at = '2026-01-01T00:00:00Z'::timestamptz
   from public.liabilities where id = '30000000-0000-0000-0000-000000000031'),
  'archived state is preserved while the record is in Trash'
);
update public.liabilities set deleted_at = null where id = '30000000-0000-0000-0000-000000000031';
select ok(
  (select archived_at = '2026-01-01T00:00:00Z'::timestamptz
      and deleted_at is null and trashed_from_archived_at is null
   from public.liabilities where id = '30000000-0000-0000-0000-000000000031'),
  'restoring Trash returns an archived record to its prior archived state'
);
update public.liabilities set deleted_at = now() where id = '30000000-0000-0000-0000-000000000031';
update public.liabilities set archived_at = now(), trashed_from_archived_at = null
where id = '30000000-0000-0000-0000-000000000031';
select ok(
  (select archived_at is null and trashed_from_archived_at = '2026-01-01T00:00:00Z'::timestamptz
   from public.liabilities where id = '30000000-0000-0000-0000-000000000031'),
  'a trashed record cannot simultaneously appear in Archive'
);
update public.liabilities set deleted_at = null where id = '30000000-0000-0000-0000-000000000030';
select ok(
  (select archived_at is null and deleted_at is null and trashed_from_archived_at is null
   from public.liabilities where id = '30000000-0000-0000-0000-000000000030'),
  'restoring a record that was active before Trash returns it to Active'
);
update public.liabilities set deleted_at = now() where id = '30000000-0000-0000-0000-000000000030';
select throws_ok(
  $$select public.permanently_delete_trashed_record('categories','30000000-0000-0000-0000-000000000001')$$,
  '23503',
  'This record is still referenced by financial history and cannot be permanently deleted.',
  'financial-history foreign keys block permanent deletion'
);
select throws_ok(
  $$select public.permanently_delete_trashed_record('income_sources','30000000-0000-0000-0000-000000000040')$$,
  '23503',
  'This record is still referenced by financial history and cannot be permanently deleted.',
  'income sources referenced by transaction history cannot be deleted'
);
select throws_ok(
  $$select public.permanently_delete_trashed_record('savings_goals','30000000-0000-0000-0000-000000000041')$$,
  '23503',
  'This record is still referenced by financial history and cannot be permanently deleted.',
  'savings goals referenced by transaction history cannot be deleted'
);
select is(
  public.permanently_delete_trashed_record('assets','30000000-0000-0000-0000-000000000020'),
  true,
  'a trashed asset can be permanently deleted'
);
select is(
  (select count(*)::integer from public.asset_valuations where asset_id = '30000000-0000-0000-0000-000000000020'),
  0,
  'asset valuation snapshots are removed with their trashed asset'
);
select is(
  public.permanently_delete_trashed_record('investment_holdings','30000000-0000-0000-0000-000000000021'),
  true,
  'a trashed holding can be permanently deleted'
);
select is(
  (select count(*)::integer from public.holding_valuations where holding_id = '30000000-0000-0000-0000-000000000021'),
  0,
  'holding valuation snapshots are removed with their trashed holding'
);
select is(
  public.permanently_delete_trashed_record('liabilities','30000000-0000-0000-0000-000000000032'),
  true,
  'an owned trashed record can be permanently deleted'
);
select throws_ok(
  $$select public.permanently_delete_trashed_record('profiles','30000000-0000-0000-0000-000000000003')$$,
  '22023',
  'Unsupported Trash record type.',
  'permanent deletion accepts only allowlisted record types'
);
select throws_ok(
  $$delete from public.transactions where id = '30000000-0000-0000-0000-000000000010'$$,
  '42501',
  null,
  'authenticated users still cannot directly hard-delete transactions'
);
select is(
  has_function_privilege('anon','public.empty_current_user_trash()','EXECUTE'),
  false,
  'anonymous role cannot execute the Empty Trash function'
);
select is(
  has_function_privilege('authenticated','public.empty_current_user_trash()','EXECUTE'),
  true,
  'authenticated role can execute the owner-scoped Empty Trash function'
);
select throws_ok(
  $$select public.empty_current_user_trash()$$,
  '23503',
  'Trash could not be emptied because a trashed record is still referenced by financial history. No records were deleted.',
  'a dependency failure aborts Empty Trash with a useful error'
);
reset role;
select is(
  (select count(*)::integer from public.liabilities where id = '30000000-0000-0000-0000-000000000035'),
  1,
  'Empty Trash rolls back all earlier deletions when a later dependency blocks it'
);
select is(
  (select count(*)::integer from public.liabilities where id = '30000000-0000-0000-0000-000000000033'),
  1,
  'Empty Trash does not touch another user’s Trash'
);

select * from finish();
rollback;
