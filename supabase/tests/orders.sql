begin;
insert into auth.users(id,email) values('61111111-aaaa-4aaa-8aaa-aaaaaaaaaaaa','orders-owner@stockai.test'),('62222222-aaaa-4aaa-8aaa-aaaaaaaaaaaa','orders-other@stockai.test'),('63333333-aaaa-4aaa-8aaa-aaaaaaaaaaaa','orders-operator@stockai.test');
set local role authenticated;
select set_config('request.jwt.claim.sub','61111111-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true);
select set_config('test.source',public.stockai_register_company('Estoque','Estoque Ltda','12345678000195')::text,true);
select set_config('test.org',(select org_id::text from public.stockai_units where id=current_setting('test.source')::uuid),true);
select set_config('test.dest',public.stockai_register_company('Restaurante','Restaurante Ltda','11222333000181',current_setting('test.org')::uuid)::text,true);
select set_config('test.receipt',public.stockai_create_receipt(current_setting('test.source')::uuid,'Fornecedor','pedido-1','[{"name":"Arroz","uom":"KG","quantity":10,"price_cents":200}]',gen_random_uuid())::text,true);
select public.stockai_submit_receipt_count(current_setting('test.receipt')::uuid,(select jsonb_object_agg(id::text,10) from public.stockai_receipt_lines where receipt_id=current_setting('test.receipt')::uuid));
select set_config('test.item',(select item_id::text from public.stockai_receipt_lines where receipt_id=current_setting('test.receipt')::uuid),true);
select set_config('test.request',gen_random_uuid()::text,true);
select set_config('test.order',public.stockai_create_order(current_setting('test.source')::uuid,current_setting('test.dest')::uuid,'Cozinha quente','Urgente',current_date,jsonb_build_array(jsonb_build_object('item_id',current_setting('test.item'),'quantity',8)),current_setting('test.request')::uuid)::text,true);
select set_config('test.line',(select id::text from public.stockai_order_lines where order_id=current_setting('test.order')::uuid),true);
do $$ begin
 if public.stockai_create_order(current_setting('test.source')::uuid,current_setting('test.dest')::uuid,'Cozinha quente','Urgente',current_date,jsonb_build_array(jsonb_build_object('item_id',current_setting('test.item'),'quantity',8)),current_setting('test.request')::uuid)<>current_setting('test.order')::uuid then raise exception 'Duplicate request';end if;
 begin update public.stockai_orders set status='delivered' where id=current_setting('test.order')::uuid;raise exception 'Direct mutation';exception when insufficient_privilege then null;end;
 begin perform public.stockai_dispatch_order(current_setting('test.order')::uuid,jsonb_build_array(jsonb_build_object('id',current_setting('test.line'),'quantity',9)));raise exception 'Over requested quantity';exception when invalid_parameter_value then null;end;
 begin perform public.stockai_receive_order(current_setting('test.order')::uuid,'Receiver','[]','');raise exception 'Receive before dispatch';exception when invalid_parameter_value then null;end;
end $$;
-- Unit kitchen operator may request but may not dispatch from the stock unit.
reset role;
insert into public.stockai_memberships(org_id,unit_id,user_id,role) values(current_setting('test.org')::uuid,current_setting('test.dest')::uuid,'63333333-aaaa-4aaa-8aaa-aaaaaaaaaaaa','operator');
set local role authenticated;
select set_config('request.jwt.claim.sub','63333333-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true);
do $$ begin
 if not exists(select 1 from public.stockai_orders where id=current_setting('test.order')::uuid) then raise exception 'Kitchen cannot read request';end if;
 begin perform public.stockai_dispatch_order(current_setting('test.order')::uuid,jsonb_build_array(jsonb_build_object('id',current_setting('test.line'),'quantity',7)));raise exception 'Operator dispatched';exception when insufficient_privilege then null;end;
end $$;
select set_config('request.jwt.claim.sub','61111111-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true);
select public.stockai_dispatch_order(current_setting('test.order')::uuid,jsonb_build_array(jsonb_build_object('id',current_setting('test.line'),'quantity',7)));
select public.stockai_dispatch_order(current_setting('test.order')::uuid,jsonb_build_array(jsonb_build_object('id',current_setting('test.line'),'quantity',7)));
select set_config('test.second',public.stockai_create_order(current_setting('test.source')::uuid,current_setting('test.dest')::uuid,'Cozinha fria','',current_date,jsonb_build_array(jsonb_build_object('item_id',current_setting('test.item'),'quantity',4)),gen_random_uuid())::text,true);
do $$ begin
 if (select quantity from public.stockai_stock_balances() where unit_id=current_setting('test.source')::uuid)<>3 then raise exception 'Wrong stock after dispatch';end if;
 if (select count(*) from public.stockai_order_movements)<>1 then raise exception 'Duplicate dispatch movement';end if;
 begin perform public.stockai_dispatch_order(current_setting('test.second')::uuid,(select jsonb_agg(jsonb_build_object('id',id,'quantity',4)) from public.stockai_order_lines where order_id=current_setting('test.second')::uuid));raise exception 'Overselling allowed';exception when invalid_parameter_value then null;end;
 if (select status from public.stockai_orders where id=current_setting('test.second')::uuid)<>'requested' then raise exception 'Failed dispatch changed state';end if;
 begin perform public.stockai_receive_order(current_setting('test.order')::uuid,'Receiver','[]','');raise exception 'Blank signature';exception when invalid_parameter_value then null;end;
 begin perform public.stockai_cancel_order(current_setting('test.order')::uuid);raise exception 'Cancel dispatched allowed';exception when invalid_parameter_value then null;end;
end $$;
select set_config('request.jwt.claim.sub','63333333-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true);
select public.stockai_receive_order(current_setting('test.order')::uuid,'Maria da Cozinha','[[[0.1,0.2],[0.2,0.3],[0.3,0.4],[0.4,0.5],[0.5,0.6],[0.6,0.7],[0.7,0.8],[0.8,0.9]]]','Conferido');
select public.stockai_receive_order(current_setting('test.order')::uuid,'Outra assinatura','[]','');
do $$ begin
 if not exists(select 1 from public.stockai_orders where id=current_setting('test.order')::uuid and receiver_name='Maria da Cozinha' and status='delivered' and received_at is not null) then raise exception 'Signature not persisted or overwritten';end if;
end $$;
select set_config('request.jwt.claim.sub','61111111-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true);
select public.stockai_cancel_order(current_setting('test.second')::uuid);
do $$ begin
 if (select quantity from public.stockai_stock_balances() where unit_id=current_setting('test.dest')::uuid)<>7 then raise exception 'Wrong destination balance';end if;
 if (select sum(value_cents) from public.stockai_stock_balances())<>2000 then raise exception 'Transfer lost valuation';end if;
 if (select count(*) from public.stockai_order_movements)<>2 then raise exception 'Duplicate receipt movement';end if;
end $$;
select set_config('request.jwt.claim.sub','62222222-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true);
do $$ begin
 if exists(select 1 from public.stockai_orders) or exists(select 1 from public.stockai_order_lines) or exists(select 1 from public.stockai_order_movements) then raise exception 'Cross tenant read';end if;
 if public.stockai_order_units()<>'[]'::jsonb then raise exception 'Cross tenant unit leak';end if;
 begin perform public.stockai_receive_order(current_setting('test.order')::uuid,'Intruder','[]','');raise exception 'Cross tenant receive';exception when insufficient_privilege then null;end;
 begin perform public.stockai_create_order(current_setting('test.source')::uuid,current_setting('test.dest')::uuid,'Intruder','',current_date,'[]',gen_random_uuid());raise exception 'Cross tenant create';exception when insufficient_privilege then null;end;
end $$;
set local role anon;
do $$ begin
 begin perform 1 from public.stockai_orders;raise exception 'Anon read';exception when insufficient_privilege then null;end;
 begin perform public.stockai_order_units();raise exception 'Anon RPC';exception when insufficient_privilege then null;end;
end $$;
rollback;
