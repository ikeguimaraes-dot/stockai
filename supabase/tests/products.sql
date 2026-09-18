begin;
insert into auth.users(id,email) values('51111111-aaaa-4aaa-8aaa-aaaaaaaaaaaa','catalog-owner@stockai.test'),('52222222-aaaa-4aaa-8aaa-aaaaaaaaaaaa','catalog-other@stockai.test'),('53333333-aaaa-4aaa-8aaa-aaaaaaaaaaaa','catalog-operator@stockai.test');
set local role authenticated;
select set_config('request.jwt.claim.sub','51111111-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true);
select set_config('test.unit',public.stockai_register_company('Cat A','Cat A Ltda','12345678000195')::text,true);
select set_config('test.org',(select org_id::text from public.stockai_units where id=current_setting('test.unit')::uuid),true);
select set_config('test.category',public.stockai_save_category(current_setting('test.org')::uuid,'Alimentos')::text,true);
select set_config('test.product',public.stockai_save_product(current_setting('test.org')::uuid,'Arroz','KG',current_setting('test.category')::uuid,true)::text,true);
select public.stockai_save_product(current_setting('test.org')::uuid,'Sabão','UN',null,false);
select set_config('test.receipt',public.stockai_create_receipt(current_setting('test.unit')::uuid,'Fornecedor','cat-1','[{"name":"Arroz","uom":"KG","quantity":10,"price_cents":200,"composes_cmv":false},{"name":"Legado","uom":"UN","quantity":1,"price_cents":100}]',gen_random_uuid())::text,true);
do $$ begin
 if (select composes_cmv from public.stockai_items where id=current_setting('test.product')::uuid) is distinct from true then raise exception 'Receipt overwrote classification'; end if;
 if not exists(select 1 from public.stockai_items where org_id=current_setting('test.org')::uuid and name='Legado' and composes_cmv is null) then raise exception 'Legacy classification guessed'; end if;
 if not exists(select 1 from public.stockai_items where org_id=current_setting('test.org')::uuid and name='Sabão' and composes_cmv=false) then raise exception 'False CMV lost'; end if;
 begin perform public.stockai_save_category(current_setting('test.org')::uuid,' alimentos ');raise exception 'Duplicate category allowed';exception when unique_violation then null;end;
 begin perform public.stockai_save_product(current_setting('test.org')::uuid,'Invalid','UN',null,null);raise exception 'Missing CMV allowed';exception when invalid_parameter_value then null;end;
 begin update public.stockai_items set composes_cmv=false where id=current_setting('test.product')::uuid;raise exception 'Direct mutation allowed';exception when insufficient_privilege then null;end;
end $$;
select public.stockai_save_product(current_setting('test.org')::uuid,'Arroz','KG',null,false,current_setting('test.product')::uuid);
select public.stockai_save_category(current_setting('test.org')::uuid,'Alimentos e bebidas',current_setting('test.category')::uuid);
do $$ begin
 if (select composes_cmv from public.stockai_items where id=current_setting('test.product')::uuid) is distinct from false then raise exception 'Classification edit lost'; end if;
 if (select sum(invoiced_qty*unit_price_cents) from public.stockai_receipt_lines where receipt_id=current_setting('test.receipt')::uuid)<>2100 then raise exception 'Classification changed invoice value';end if;
end $$;
select set_config('request.jwt.claim.sub','52222222-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true);
select set_config('test.otherunit',public.stockai_register_company('Cat B','Cat B Ltda','11222333000181')::text,true);
select set_config('test.otherorg',(select org_id::text from public.stockai_units where id=current_setting('test.otherunit')::uuid),true);
do $$ begin
 if exists(select 1 from public.stockai_product_categories where org_id=current_setting('test.org')::uuid) then raise exception 'Cross-tenant category read';end if;
 begin perform public.stockai_save_category(current_setting('test.org')::uuid,'Intruder');raise exception 'Cross-tenant category write';exception when insufficient_privilege then null;end;
 begin perform public.stockai_save_product(current_setting('test.org')::uuid,'Arroz','KG',null,true,current_setting('test.product')::uuid);raise exception 'Cross-tenant product write';exception when insufficient_privilege then null;end;
 begin perform public.stockai_save_product(current_setting('test.otherorg')::uuid,'Intruder','UN',current_setting('test.category')::uuid,true);raise exception 'Cross-tenant category assignment';exception when invalid_parameter_value then null;end;
end $$;
reset role;
insert into public.stockai_memberships(org_id,unit_id,user_id,role) values(current_setting('test.org')::uuid,current_setting('test.unit')::uuid,'53333333-aaaa-4aaa-8aaa-aaaaaaaaaaaa','operator');
set local role authenticated;
select set_config('request.jwt.claim.sub','53333333-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true);
do $$ begin
 begin perform public.stockai_save_category(current_setting('test.org')::uuid,'Operator');raise exception 'Operator category mutation';exception when insufficient_privilege then null;end;
 begin perform public.stockai_save_product(current_setting('test.org')::uuid,'Arroz','KG',null,true,current_setting('test.product')::uuid);raise exception 'Operator product mutation';exception when insufficient_privilege then null;end;
 begin perform stockai_private.resolve_item(current_setting('test.org')::uuid,'Bypass','KG','{}');raise exception 'Helper exposed';exception when insufficient_privilege then null;end;
end $$;
set local role anon;
do $$ begin
 begin perform 1 from public.stockai_product_categories;raise exception 'Anonymous read';exception when insufficient_privilege then null;end;
 begin perform public.stockai_save_category(current_setting('test.org')::uuid,'Anon');raise exception 'Anonymous mutation';exception when insufficient_privilege then null;end;
end $$;
rollback;
