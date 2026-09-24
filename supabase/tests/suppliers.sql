begin;
insert into auth.users(id,email) values('61111111-aaaa-4aaa-8aaa-aaaaaaaaaaaa','supplier-owner@stockai.test'),('62222222-aaaa-4aaa-8aaa-aaaaaaaaaaaa','supplier-other@stockai.test');
set local role authenticated;
select set_config('request.jwt.claim.sub','61111111-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true);
select set_config('test.unit',public.stockai_register_company('Supplier A','Supplier A Ltda','12345678000195')::text,true);
select set_config('test.org',(select org_id::text from public.stockai_units where id=current_setting('test.unit')::uuid),true);
select set_config('test.supplier',public.stockai_save_supplier(current_setting('test.org')::uuid,'{"name":"Nome apenas"}')::text,true);
select public.stockai_save_supplier(current_setting('test.org')::uuid,'{"name":"Outro sem documento"}');
select public.stockai_save_supplier(current_setting('test.org')::uuid,'{"name":"Nome atualizado","email":"teste@example.com","tax_id":"11.222.333/0001-81"}',current_setting('test.supplier')::uuid,1);
do $$ begin
 if not exists(select 1 from public.stockai_suppliers where id=current_setting('test.supplier')::uuid and email='teste@example.com' and tax_id='11222333000181' and 'Nome apenas'=any(aliases) and revision=2) then raise exception 'Profile update failed';end if;
 if not exists(select 1 from public.stockai_suppliers where name='Outro sem documento' and tax_id is null) then raise exception 'Incomplete profile lost';end if;
 begin perform public.stockai_save_supplier(current_setting('test.org')::uuid,'{"name":"Duplicate","tax_id":"11222333000181"}');raise exception 'Duplicate allowed';exception when unique_violation then null;end;
 begin perform public.stockai_save_supplier(current_setting('test.org')::uuid,'{"name":"Lost update"}',current_setting('test.supplier')::uuid,1);raise exception 'Stale update allowed';exception when serialization_failure then null;end;
 begin perform public.stockai_save_supplier(current_setting('test.org')::uuid,'{"name":"Invalid","tax_id":"123"}');raise exception 'Invalid CNPJ';exception when invalid_parameter_value then null;end;
end $$;
select set_config('request.jwt.claim.sub','62222222-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true);
select set_config('test.otherunit',public.stockai_register_company('Supplier B','Supplier B Ltda','11222333000181')::text,true);
select set_config('test.otherorg',(select org_id::text from public.stockai_units where id=current_setting('test.otherunit')::uuid),true);
do $$ begin
 if exists(select 1 from public.stockai_suppliers where id=current_setting('test.supplier')::uuid) then raise exception 'Cross org read';end if;
 begin perform public.stockai_save_supplier(current_setting('test.org')::uuid,'{"name":"Intruder"}');raise exception 'Cross org insert';exception when insufficient_privilege then null;end;
 begin perform public.stockai_save_supplier(current_setting('test.otherorg')::uuid,'{"name":"Intruder"}',current_setting('test.supplier')::uuid,2);raise exception 'Cross org edit';exception when insufficient_privilege then null;end;
end $$;
reset role;
update public.stockai_memberships set role='viewer' where org_id=current_setting('test.otherorg')::uuid;
set local role authenticated;
do $$ begin
 begin perform public.stockai_save_supplier(current_setting('test.otherorg')::uuid,'{"name":"Viewer"}');raise exception 'Viewer insert';exception when insufficient_privilege then null;end;
end $$;
set local role anon;
do $$ begin
 begin perform public.stockai_save_supplier(current_setting('test.org')::uuid,'{"name":"Anon"}');raise exception 'Anon insert';exception when insufficient_privilege then null;end;
end $$;
rollback;
