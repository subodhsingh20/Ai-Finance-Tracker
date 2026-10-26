begin;
select plan(24);

insert into auth.users(
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  ('00000000-0000-0000-0000-000000000061','authenticated','authenticated','confirmed-email@example.test','',now(),'{"provider":"email","providers":["email"]}','{}',now(),now()),
  ('00000000-0000-0000-0000-000000000062','authenticated','authenticated','unconfirmed-email@example.test','',null,'{"provider":"email","providers":["email"]}','{}',now(),now());

insert into public.categories(id,user_id,type,name)
values ('60000000-0000-0000-0000-000000000010','00000000-0000-0000-0000-000000000062','expense','Unconfirmed expense');

insert into public.income_sources(id,user_id,name)
values ('60000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000062','Unconfirmed source');

insert into public.savings_goals(id,user_id,name,target_amount)
values ('60000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000062','Unconfirmed goal',100);

insert into public.transactions(
  id,user_id,type,amount,category_id,description,occurred_on,
  income_source_id,created_via,submission_id,submission_item_index
)
select
  '60000000-0000-0000-0000-000000000003',
  '00000000-0000-0000-0000-000000000062',
  'income',100,
  id,'Unconfirmed transaction',current_date,
  '60000000-0000-0000-0000-000000000001','manual',
  '60000000-0000-0000-0000-000000000004',0
from public.categories
where user_id='00000000-0000-0000-0000-000000000062'
  and type='income' and name='Salary';

insert into public.budgets(id,user_id,category_id,month_start,limit_amount)
select '60000000-0000-0000-0000-000000000005','00000000-0000-0000-0000-000000000062',id,date_trunc('month',current_date)::date,1000
from public.categories
where user_id='00000000-0000-0000-0000-000000000062'
  and type='expense' and name='Food & Groceries';

insert into public.assets(id,user_id,name,category,current_value,as_of_date)
values ('60000000-0000-0000-0000-000000000006','00000000-0000-0000-0000-000000000062','Unconfirmed asset','other_valuables',100,current_date);

insert into public.investment_holdings(id,user_id,name,instrument_type,current_value,as_of_date)
values ('60000000-0000-0000-0000-000000000007','00000000-0000-0000-0000-000000000062','Unconfirmed holding','fund',100,current_date);

insert into public.liabilities(id,user_id,name,category,outstanding_balance,as_of_date)
values ('60000000-0000-0000-0000-000000000008','00000000-0000-0000-0000-000000000062','Unconfirmed liability','loan',100,current_date);

set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000061',true);
select ok(has_function_privilege('authenticated','public.is_current_user_email_confirmed()','EXECUTE'),'authenticated users can execute the confirmation helper');
select ok(not has_function_privilege('anon','public.is_current_user_email_confirmed()','EXECUTE'),'anonymous users cannot execute the confirmation helper');
select ok(public.is_current_user_email_confirmed(),'confirmed user passes the confirmation helper');
select is((select count(*)::int from public.transactions where user_id='00000000-0000-0000-0000-000000000062'),0,'confirmed user cannot inspect another user transactions');
select is((select count(*)::int from public.transactions where user_id='00000000-0000-0000-0000-000000000061'),0,'confirmed user has no seeded transactions');

select lives_ok($$insert into public.categories(user_id,type,name) values('00000000-0000-0000-0000-000000000061','expense','Confirmed category')$$,'confirmed user can insert their own category');
select lives_ok($$update public.profiles set display_name='Confirmed user' where id='00000000-0000-0000-0000-000000000061'$$,'confirmed user can update their own profile');
select lives_ok($$insert into public.transactions(user_id,type,amount,category_id,description,occurred_on,created_via,submission_id,submission_item_index) select '00000000-0000-0000-0000-000000000061','expense',10,id,'Confirmed transaction',current_date,'manual','60000000-0000-0000-0000-000000000011',0 from public.categories where user_id='00000000-0000-0000-0000-000000000061' and type='expense' and name='Food & Groceries'$$,'confirmed user can insert their own transaction');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000062',true);
select ok(not public.is_current_user_email_confirmed(),'unconfirmed user fails the confirmation helper');
select is((select count(*)::int from public.profiles where id='00000000-0000-0000-0000-000000000062'),0,'unconfirmed user cannot read their profile');
select is((select count(*)::int from public.categories where user_id='00000000-0000-0000-0000-000000000062'),0,'unconfirmed user cannot read categories');
select is((select count(*)::int from public.income_sources where user_id='00000000-0000-0000-0000-000000000062'),0,'unconfirmed user cannot read income sources');
select is((select count(*)::int from public.savings_goals where user_id='00000000-0000-0000-0000-000000000062'),0,'unconfirmed user cannot read savings goals');
select is((select count(*)::int from public.transactions where user_id='00000000-0000-0000-0000-000000000062'),0,'unconfirmed user cannot read transactions');
select is((select count(*)::int from public.budgets where user_id='00000000-0000-0000-0000-000000000062'),0,'unconfirmed user cannot read budgets');
select is((select count(*)::int from public.assets where user_id='00000000-0000-0000-0000-000000000062'),0,'unconfirmed user cannot read assets');
select is((select count(*)::int from public.asset_valuations where user_id='00000000-0000-0000-0000-000000000062'),0,'unconfirmed user cannot read asset valuations');
select is((select count(*)::int from public.investment_holdings where user_id='00000000-0000-0000-0000-000000000062'),0,'unconfirmed user cannot read holdings');
select is((select count(*)::int from public.holding_valuations where user_id='00000000-0000-0000-0000-000000000062'),0,'unconfirmed user cannot read holding valuations');
select is((select count(*)::int from public.liabilities where user_id='00000000-0000-0000-0000-000000000062'),0,'unconfirmed user cannot read liabilities');
select throws_ok($$insert into public.categories(user_id,type,name) values('00000000-0000-0000-0000-000000000062','expense','Blocked category')$$,'42501',null,'unconfirmed user cannot insert categories');
select throws_ok($$insert into public.transactions(user_id,type,amount,category_id,description,occurred_on,created_via,submission_id,submission_item_index) values('00000000-0000-0000-0000-000000000062','expense',10,'60000000-0000-0000-0000-000000000010','Blocked transaction',current_date,'manual','60000000-0000-0000-0000-000000000009',0)$$,'42501',null,'unconfirmed user cannot insert transactions');
select lives_ok($$update public.transactions set description='Blocked update' where id='60000000-0000-0000-0000-000000000003'$$,'unconfirmed update request does not expose a row');
reset role;
select is((select description from public.transactions where id='60000000-0000-0000-0000-000000000003'),'Unconfirmed transaction','unconfirmed user cannot update transactions');

select * from finish();
rollback;
