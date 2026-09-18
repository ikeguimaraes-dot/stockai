-- All test data is rolled back; verify onboarding, tenant permissions and invoice destination.
begin;
insert into auth.users(id,email) values
 ('11111111-aaaa-4aaa-8aaa-aaaaaaaaaaaa','company-owner@stockai.test'),
 ('22222222-aaaa-4aaa-8aaa-aaaaaaaaaaaa','other-company@stockai.test'),
 ('33333333-aaaa-4aaa-8aaa-aaaaaaaaaaaa','company-operator@stockai.test');
set local role authenticated;
select set_config('request.jwt.claim.sub','11111111-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true);
select set_config('test.company',public.stockai_register_company('Empresa A','Empresa A Ltda','12.345.678/0001-95')::text,true);
select set_config('test.org',(select org_id::text from public.stockai_units where id=current_setting('test.company')::uuid),true);
select set_config('test.other_company',public.stockai_register_company('Empresa B','Empresa B Ltda','11222333000181',current_setting('test.org')::uuid)::text,true);
do $$ begin
 if (select tax_id from public.stockai_units where id=current_setting('test.company')::uuid)<>'12345678000195' then raise exception 'CNPJ normalization failed'; end if;
 begin perform public.stockai_register_company('Duplicada','Duplicada Ltda','12345678000195',current_setting('test.org')::uuid); raise exception 'Duplicate CNPJ allowed'; exception when unique_violation then null; end;
 begin perform public.stockai_register_company('Inválida','Inválida Ltda','123',current_setting('test.org')::uuid); raise exception 'Invalid CNPJ format allowed'; exception when invalid_parameter_value then null; end;
end $$;
select public.stockai_create_receipt(current_setting('test.company')::uuid,'Supplier','001','[{"name":"Item","uom":"UN","quantity":1,"price_cents":100}]',gen_random_uuid());
select public.stockai_create_receipt(current_setting('test.other_company')::uuid,'Supplier','001','[{"name":"Item","uom":"UN","quantity":1,"price_cents":100}]',gen_random_uuid());
do $$ begin
 if (select count(*) from public.stockai_receipts where org_id=current_setting('test.org')::uuid)<>2 then raise exception 'Receipt destination not preserved'; end if;
 begin perform public.stockai_register_company('Empresa A','Empresa A Ltda','11222333000981',null,current_setting('test.company')::uuid); raise exception 'CNPJ reassignment allowed after receipt'; exception when invalid_parameter_value then null; end;
end $$;
select set_config('request.jwt.claim.sub','22222222-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true);
do $$ begin
 if exists(select 1 from public.stockai_units where org_id=current_setting('test.org')::uuid) then raise exception 'Cross-tenant company read'; end if;
 begin perform public.stockai_register_company('Intruder','Intruder Ltda','12345678000195',null,current_setting('test.company')::uuid); raise exception 'Cross-tenant update'; exception when insufficient_privilege then null; end;
 begin perform public.stockai_register_company('Intruder','Intruder Ltda','12345678000195',current_setting('test.org')::uuid); raise exception 'Cross-tenant insert'; exception when insufficient_privilege then null; end;
end $$;
select set_config('test.legacy',public.stockai_bootstrap_organization('Legacy','Legacy company')::text,true);
do $$ begin
 begin perform public.stockai_create_receipt(current_setting('test.legacy')::uuid,'Supplier','001','[{"name":"Item","uom":"UN","quantity":1,"price_cents":100}]',gen_random_uuid()); raise exception 'Unregistered company received invoice'; exception when check_violation then null; end;
end $$;
reset role;
insert into public.stockai_memberships(org_id,unit_id,user_id,role) values(current_setting('test.org')::uuid,current_setting('test.company')::uuid,'33333333-aaaa-4aaa-8aaa-aaaaaaaaaaaa','operator');
set local role authenticated;
select set_config('request.jwt.claim.sub','33333333-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true);
do $$ begin
 begin perform public.stockai_register_company('Operator','Operator Ltda','12345678000195',null,current_setting('test.company')::uuid); raise exception 'Operator changed company'; exception when insufficient_privilege then null; end;
 begin perform public.stockai_register_company('Operator','Operator Ltda','12345678000195',current_setting('test.org')::uuid); raise exception 'Operator created company'; exception when insufficient_privilege then null; end;
end $$;
set local role anon;
do $$ begin
 begin perform public.stockai_register_company('Anon','Anon Ltda','12345678000195'); raise exception 'Anon created company'; exception when insufficient_privilege then null; end;
end $$;
rollback;
