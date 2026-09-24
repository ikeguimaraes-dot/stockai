-- Transactional integration tests. No fixtures survive the rollback.
begin;
insert into auth.users(id,email) values
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','a@stockai.test'),
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','b@stockai.test'),
 ('cccccccc-cccc-4ccc-8ccc-cccccccccccc','operator@stockai.test'),
 ('dddddddd-dddd-4ddd-8ddd-dddddddddddd','expired@stockai.test');
set local role authenticated;
select set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true);
select set_config('test.unit_a',public.stockai_bootstrap_organization('Test A','Kitchen A')::text,true);
select set_config('test.org_a',(select org_id::text from stockai_units where id=current_setting('test.unit_a')::uuid),true);
select public.stockai_register_company('Kitchen A','Kitchen A Ltda','12345678000195',null,current_setting('test.unit_a')::uuid);
select set_config('test.receipt_a',public.stockai_create_receipt(current_setting('test.unit_a')::uuid,'Supplier A','001','[{"name":"Tomato","uom":"KG","quantity":20,"price_cents":1000}]','aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa')::text,true);
select set_config('test.line_a',(select id::text from stockai_receipt_lines where receipt_id=current_setting('test.receipt_a')::uuid),true);
select set_config('request.jwt.claim.sub','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',true);
select set_config('test.unit_b',public.stockai_bootstrap_organization('Test B','Kitchen B')::text,true);
select set_config('test.org_b',(select org_id::text from stockai_units where id=current_setting('test.unit_b')::uuid),true);
select public.stockai_register_company('Kitchen B','Kitchen B Ltda','11222333000181',null,current_setting('test.unit_b')::uuid);
select set_config('test.receipt_b',public.stockai_create_receipt(current_setting('test.unit_b')::uuid,'Supplier B','001','[{"name":"Fish","uom":"KG","quantity":10,"price_cents":2000}]','bbbbbbbb-1111-4111-8111-bbbbbbbbbbbb')::text,true);
select public.stockai_submit_receipt_count(current_setting('test.receipt_b')::uuid,(select jsonb_object_agg(id,8) from stockai_receipt_lines where receipt_id=current_setting('test.receipt_b')::uuid));
select public.stockai_approve_receipt(current_setting('test.receipt_b')::uuid);
select set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true);
do $$ declare tab text; n int; column_name text; begin
 foreach tab in array array['stockai_orgs','stockai_units','stockai_memberships','stockai_suppliers','stockai_items','stockai_receipts','stockai_receipt_lines','stockai_stock_movements','stockai_supplier_claims','stockai_audit_events'] loop
   column_name:=case when tab='stockai_orgs' then 'id' else 'org_id' end;
   execute format('select count(*) from public.%I where %I=$1',tab,column_name) into n using current_setting('test.org_b')::uuid;
   if n<>0 then raise exception 'Cross-tenant read: %',tab; end if;
   begin execute format('insert into public.%I default values',tab); raise exception 'Direct write allowed: %',tab; exception when insufficient_privilege then null; end;
   begin execute format('delete from public.%I where %I=$1',tab,column_name) using current_setting('test.org_b')::uuid; raise exception 'Direct delete allowed: %',tab; exception when insufficient_privilege then null; end;
   begin execute format('update public.%I set id=id where %I=$1',tab,column_name) using current_setting('test.org_b')::uuid; raise exception 'Direct update allowed: %',tab; exception when insufficient_privilege then null; end;
 end loop;
 begin perform public.stockai_get_receipt_conference(current_setting('test.receipt_b')::uuid);raise exception 'Conference cross-tenant read';exception when insufficient_privilege then null;end;
 begin perform public.stockai_get_blind_receipt(current_setting('test.receipt_b')::uuid); raise exception 'Blind cross-tenant read'; exception when insufficient_privilege then null; end;
 begin perform public.stockai_approve_receipt(current_setting('test.receipt_b')::uuid); raise exception 'Cross-tenant approval'; exception when insufficient_privilege then null; end;
 begin perform public.stockai_create_receipt(current_setting('test.unit_b')::uuid,'X','X','[]',gen_random_uuid()); raise exception 'Cross-tenant creation'; exception when insufficient_privilege then null; end;
 if public.stockai_create_receipt(current_setting('test.unit_a')::uuid,'Supplier A','001','[{"name":"Tomato","uom":"KG","quantity":20,"price_cents":1000}]','aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa')<>current_setting('test.receipt_a')::uuid then raise exception 'Creation not idempotent'; end if;
end $$;
reset role;
insert into stockai_memberships(org_id,unit_id,user_id,role) values(current_setting('test.org_a')::uuid,current_setting('test.unit_a')::uuid,'cccccccc-cccc-4ccc-8ccc-cccccccccccc','operator');
insert into stockai_memberships(org_id,user_id,role,expires_at) values(current_setting('test.org_a')::uuid,'dddddddd-dddd-4ddd-8ddd-dddddddddddd','implementer',now()-interval '1 day');
set local role authenticated;
select set_config('request.jwt.claim.sub','cccccccc-cccc-4ccc-8ccc-cccccccccccc',true);
do $$ declare data jsonb; begin
 if exists(select 1 from stockai_receipts) or exists(select 1 from stockai_receipt_lines) or exists(select 1 from stockai_stock_movements) or exists(select 1 from stockai_supplier_claims) then raise exception 'Operator sees financial data'; end if;
 data:=public.stockai_get_blind_receipt(current_setting('test.receipt_a')::uuid);
 if data is null or data::text~'invoiced|price|counted|payable' then raise exception 'Blind payload leaks expected quantities or prices'; end if;
 data:=public.stockai_get_receipt_conference(current_setting('test.receipt_a')::uuid);
 if (data->'lines'->0->>'invoiced')::numeric is distinct from 20 then raise exception 'Conference omitted expected quantity';end if;
 if data::text~'price|payable|credit' then raise exception 'Conference leaked financial data';end if;
 begin perform public.stockai_approve_receipt(current_setting('test.receipt_a')::uuid); raise exception 'Operator can approve'; exception when insufficient_privilege then null; end;
 if public.stockai_submit_receipt_count(current_setting('test.receipt_a')::uuid,jsonb_build_object(current_setting('test.line_a'),18))<>'pending_approval' then raise exception 'Shortage not pending'; end if;
end $$;
select set_config('request.jwt.claim.sub','dddddddd-dddd-4ddd-8ddd-dddddddddddd',true);
do $$ begin
 begin perform public.stockai_get_receipt_conference(current_setting('test.receipt_a')::uuid);raise exception 'Expired conference access';exception when insufficient_privilege then null;end;
 if exists(select 1 from stockai_orgs) or exists(select 1 from stockai_receipt_lines) then raise exception 'Expired membership retained access'; end if; end $$;
select set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true);
select public.stockai_approve_receipt(current_setting('test.receipt_a')::uuid);
select public.stockai_approve_receipt(current_setting('test.receipt_a')::uuid);
do $$ declare l stockai_receipt_lines; n int; begin
 select * into l from stockai_receipt_lines where id=current_setting('test.line_a')::uuid;
 if l.invoiced_qty<>20 or l.counted_qty<>18 or l.payable_cents<>18000 or l.credit_cents<>2000 then raise exception 'Three truths incorrect'; end if;
 select count(*) into n from stockai_stock_movements where receipt_line_id=l.id and qty_base=18;
 if n<>1 then raise exception 'Missing or duplicated movement'; end if;
 select count(*) into n from stockai_supplier_claims where receipt_line_id=l.id and amount_cents=2000;
 if n<>1 then raise exception 'Missing or duplicated claim'; end if;
 begin perform public.stockai_submit_receipt_count(current_setting('test.receipt_a')::uuid,jsonb_build_object(l.id,20)); raise exception 'Closed receipt accepted a new count'; exception when raise_exception then if sqlerrm='Closed receipt accepted a new count' then raise; end if; end;
end $$;
reset role;
do $$ declare t text; begin
 foreach t in array array['stockai_orgs','stockai_units','stockai_memberships','stockai_suppliers','stockai_items','stockai_receipts','stockai_receipt_lines','stockai_stock_movements','stockai_supplier_claims','stockai_audit_events'] loop
 if not (select relrowsecurity from pg_class where oid=('public.'||t)::regclass) then raise exception 'RLS disabled: %',t; end if;
 end loop;
 begin update stockai_stock_movements set qty_base=10 where receipt_line_id=current_setting('test.line_a')::uuid; raise exception 'Movement mutable'; exception when raise_exception then if sqlerrm='Movement mutable' then raise; end if; end;
 begin update stockai_receipt_lines set invoiced_qty=19 where id=current_setting('test.line_a')::uuid; raise exception 'Fiscal mutable'; exception when raise_exception then if sqlerrm='Fiscal mutable' then raise; end if; end;
 begin insert into stockai_receipts(org_id,unit_id,supplier_id,invoice_number,request_id,created_by) select current_setting('test.org_a')::uuid,current_setting('test.unit_b')::uuid,id,'bad',gen_random_uuid(),'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' from stockai_suppliers where org_id=current_setting('test.org_a')::uuid; raise exception 'Cross-tenant FK allowed'; exception when foreign_key_violation then null; end;
end $$;
rollback;
select 'PASS: tenant isolation on all 10 tables, role permissions, blind data, expiry, idempotency, three truths, immutable audit and composite tenant keys' as result;
