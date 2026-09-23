-- Internal kitchen requisitions, dispatch and signed delivery. No fiscal invoice changes.
create table public.stockai_orders (
 id uuid primary key default gen_random_uuid(),
 org_id uuid not null references public.stockai_orgs(id),
 source_id uuid not null,
 destination_id uuid not null,
 source_name text not null,
 destination_name text not null,
 kitchen text not null check(length(trim(kitchen)) between 2 and 100),
 notes text not null default '' check(length(notes)<=1000),
 needed_on date not null,
 status text not null default 'requested' check(status in ('requested','dispatched','delivered','cancelled')),
 request_id uuid not null,
 created_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(),
 dispatched_by uuid references auth.users(id),
 dispatched_at timestamptz,
 received_by uuid references auth.users(id),
 received_at timestamptz,
 receiver_name text,
 signature jsonb,
 delivery_notes text,
 cancelled_by uuid references auth.users(id),
 cancelled_at timestamptz,
 unique(org_id,request_id), unique(org_id,id),
 foreign key(org_id,source_id) references public.stockai_units(org_id,id),
 foreign key(org_id,destination_id) references public.stockai_units(org_id,id),
 check(source_id<>destination_id)
);
create index stockai_orders_source on public.stockai_orders(source_id,status,created_at desc);
create index stockai_orders_destination on public.stockai_orders(destination_id,status,created_at desc);
create table public.stockai_order_lines (
 id uuid primary key default gen_random_uuid(),
 org_id uuid not null,
 order_id uuid not null,
 item_id uuid not null,
 item_name text not null,
 uom text not null,
 requested_qty numeric(14,4) not null check(requested_qty>0),
 dispatched_qty numeric(14,4) check(dispatched_qty>=0 and dispatched_qty<=requested_qty),
 unique(order_id,item_id), unique(org_id,id),
 foreign key(org_id,order_id) references public.stockai_orders(org_id,id),
 foreign key(org_id,item_id) references public.stockai_items(org_id,id)
);
create index stockai_order_lines_item on public.stockai_order_lines(org_id,item_id);
create table public.stockai_order_movements (
 id uuid primary key default gen_random_uuid(),
 org_id uuid not null,
 unit_id uuid not null,
 item_id uuid not null,
 order_line_id uuid not null,
 qty_base numeric(14,4) not null check(qty_base<>0),
 unit_cost_cents bigint not null check(unit_cost_cents>=0),
 created_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(),
 unique(order_line_id,unit_id),
 foreign key(org_id,unit_id) references public.stockai_units(org_id,id),
 foreign key(org_id,item_id) references public.stockai_items(org_id,id),
 foreign key(org_id,order_line_id) references public.stockai_order_lines(org_id,id)
);
create index stockai_order_movements_balance on public.stockai_order_movements(unit_id,item_id);
alter table public.stockai_orders enable row level security;
alter table public.stockai_order_lines enable row level security;
alter table public.stockai_order_movements enable row level security;
create policy orders_read on public.stockai_orders for select to authenticated using (
 stockai_private.can_access(org_id,source_id) or stockai_private.can_access(org_id,destination_id));
create policy order_lines_read on public.stockai_order_lines for select to authenticated using (
 exists(select 1 from public.stockai_orders o where o.id=order_id));
create policy order_movements_read on public.stockai_order_movements for select to authenticated using (
 stockai_private.can_access(org_id,unit_id,array['owner','manager','unit_manager','implementer']));
revoke all on public.stockai_orders,public.stockai_order_lines,public.stockai_order_movements from public,anon,authenticated;
grant select on public.stockai_orders,public.stockai_order_lines,public.stockai_order_movements to authenticated;
create trigger order_movements_immutable before update or delete on public.stockai_order_movements for each row execute function stockai_private.immutable_record();

create function stockai_private.order_units() returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',u.id,'org_id',u.org_id,'name',u.name,
 'can_request',stockai_private.can_access(u.org_id,u.id,array['owner','manager','unit_manager','operator','implementer']),
 'can_dispatch',stockai_private.can_access(u.org_id,u.id,array['owner','manager','unit_manager','implementer'])) order by u.name),'[]')
 from public.stockai_units u where stockai_private.can_access(u.org_id);
$$;
create function stockai_private.create_order(p_source uuid,p_destination uuid,p_kitchen text,p_notes text,p_needed date,p_lines jsonb,p_request uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare src public.stockai_units; dst public.stockai_units; v_id uuid; l jsonb; item public.stockai_items; q numeric;
begin
 select * into dst from public.stockai_units where id=p_destination;
 if dst.id is null or not stockai_private.can_access(dst.org_id,dst.id,array['owner','manager','unit_manager','operator','implementer']) then raise exception 'Sem permissão para solicitar nesta empresa.' using errcode='42501'; end if;
 select * into src from public.stockai_units where id=p_source and org_id=dst.org_id;
 if src.id is null or src.id=dst.id then raise exception 'Escolha um estoque de origem diferente do restaurante, no mesmo grupo.' using errcode='22023'; end if;
 if p_request is null or p_needed is null or length(trim(coalesce(p_kitchen,''))) not between 2 and 100 or length(coalesce(p_notes,''))>1000 or jsonb_typeof(p_lines) is distinct from 'array' then raise exception 'Preencha cozinha, data e produtos.' using errcode='22023'; end if;
 if jsonb_array_length(p_lines) not between 1 and 100 then raise exception 'Inclua de 1 a 100 produtos.' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended(dst.org_id::text||p_request::text,0));
 select id into v_id from public.stockai_orders where org_id=dst.org_id and request_id=p_request;
 if found then return v_id; end if;
 insert into public.stockai_orders(org_id,source_id,destination_id,source_name,destination_name,kitchen,notes,needed_on,request_id,created_by)
 values(dst.org_id,src.id,dst.id,src.name,dst.name,trim(p_kitchen),coalesce(p_notes,''),p_needed,p_request,auth.uid()) returning id into v_id;
 for l in select value from jsonb_array_elements(p_lines) loop
 select * into item from public.stockai_items where id=(l->>'item_id')::uuid and org_id=dst.org_id and is_active;
 if item.id is null or jsonb_typeof(l->'quantity') is distinct from 'number' then raise exception 'Produto ou quantidade inválida.' using errcode='22023'; end if;
 q:=(l->>'quantity')::numeric;
 if q<=0 or q>=10000000000 or q<>round(q,4) then raise exception 'Quantidade inválida (até quatro casas decimais).' using errcode='22023'; end if;
 insert into public.stockai_order_lines(org_id,order_id,item_id,item_name,uom,requested_qty) values(dst.org_id,v_id,item.id,item.name,item.base_uom,q);
 end loop;
 return v_id;
end $$;

create function stockai_private.dispatch_order(p_order uuid,p_lines jsonb) returns void language plpgsql security definer set search_path='' as $$
declare o public.stockai_orders; l public.stockai_order_lines; q numeric; bal numeric; val numeric; cost bigint;
begin
 select * into o from public.stockai_orders where id=p_order for update;
 if o.id is null or not stockai_private.can_access(o.org_id,o.source_id,array['owner','manager','unit_manager','implementer']) then raise exception 'Sem permissão para expedir neste estoque.' using errcode='42501'; end if;
 if o.status='dispatched' or o.status='delivered' then return; end if;
 if o.status<>'requested' then raise exception 'Este pedido não está aberto.' using errcode='22023'; end if;
 if jsonb_typeof(p_lines) is distinct from 'array' then raise exception 'Confira os itens da entrega.' using errcode='22023'; end if;
 if jsonb_array_length(p_lines)<>(select count(*) from public.stockai_order_lines where order_id=o.id)
 or exists(select 1 from jsonb_array_elements(p_lines) x where jsonb_typeof(x->'quantity') is distinct from 'number')
 or (select count(distinct x->>'id') from jsonb_array_elements(p_lines) x)<>jsonb_array_length(p_lines)
 or exists(select 1 from jsonb_array_elements(p_lines) x where not exists(select 1 from public.stockai_order_lines where order_id=o.id and id=(x->>'id')::uuid))
 then raise exception 'Informe a quantidade de todos os itens, sem repetições.' using errcode='22023'; end if;
 if not exists(select 1 from jsonb_array_elements(p_lines) x where (x->>'quantity')::numeric>0) then raise exception 'Informe pelo menos uma quantidade para entregar.' using errcode='22023'; end if;
 -- Sorted per-product locks prevent overselling across concurrent requisitions.
 for l in select * from public.stockai_order_lines where order_id=o.id order by item_id loop
 q:=(select (x->>'quantity')::numeric from jsonb_array_elements(p_lines) x where (x->>'id')::uuid=l.id);
 if q<0 or q>l.requested_qty or q<>round(q,4) then raise exception 'A quantidade separada deve ficar entre zero e a quantidade pedida.' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended(o.source_id::text||l.item_id::text,0));
 select coalesce(sum(m.qty_base),0),coalesce(sum(m.qty_base*m.unit_cost_cents),0) into bal,val from (
 select qty_base,unit_cost_cents from public.stockai_stock_movements where unit_id=o.source_id and item_id=l.item_id
 union all select qty_base,unit_cost_cents from public.stockai_order_movements where unit_id=o.source_id and item_id=l.item_id) m;
 if q>bal then raise exception 'Saldo insuficiente para %: disponível % %.',l.item_name,bal,l.uom using errcode='22023'; end if;
 update public.stockai_order_lines set dispatched_qty=q where id=l.id;
 if q>0 then
 cost:=greatest(0,round(val/nullif(bal,0)));
 insert into public.stockai_order_movements(org_id,unit_id,item_id,order_line_id,qty_base,unit_cost_cents,created_by) values(o.org_id,o.source_id,l.item_id,l.id,-q,cost,auth.uid());
 end if;
 end loop;
 update public.stockai_orders set status='dispatched',dispatched_by=auth.uid(),dispatched_at=now() where id=o.id;
end $$;

create function stockai_private.receive_order(p_order uuid,p_name text,p_signature jsonb,p_notes text) returns void language plpgsql security definer set search_path='' as $$
declare o public.stockai_orders; stroke jsonb; point jsonb; points int:=0;
begin
 select * into o from public.stockai_orders where id=p_order for update;
 if o.id is null or not (stockai_private.can_access(o.org_id,o.destination_id,array['owner','manager','unit_manager','operator','implementer']) or stockai_private.can_access(o.org_id,o.source_id,array['owner','manager','unit_manager','implementer'])) then raise exception 'Sem permissão para confirmar esta entrega.' using errcode='42501'; end if;
 if o.status='delivered' then return; end if;
 if o.status<>'dispatched' then raise exception 'O pedido precisa ser expedido antes da assinatura.' using errcode='22023'; end if;
 if length(trim(coalesce(p_name,''))) not between 3 and 120 or length(coalesce(p_notes,''))>1000 or jsonb_typeof(p_signature) is distinct from 'array' then raise exception 'Informe o nome e a assinatura de quem recebeu.' using errcode='22023'; end if;
 if jsonb_array_length(p_signature) not between 1 and 100 then raise exception 'Assinatura inválida.' using errcode='22023'; end if;
 for stroke in select value from jsonb_array_elements(p_signature) loop
 if jsonb_typeof(stroke) is distinct from 'array' then raise exception 'Assinatura inválida.' using errcode='22023'; end if;
 for point in select value from jsonb_array_elements(stroke) loop
 if jsonb_typeof(point) is distinct from 'array' then raise exception 'Assinatura inválida.' using errcode='22023'; end if;
 if jsonb_array_length(point)<>2 or jsonb_typeof(point->0) is distinct from 'number' or jsonb_typeof(point->1) is distinct from 'number' then raise exception 'Assinatura inválida.' using errcode='22023'; end if;
 if (point->>0)::numeric not between 0 and 1 or (point->>1)::numeric not between 0 and 1 then raise exception 'Assinatura inválida.' using errcode='22023'; end if;
 points:=points+1;
 end loop;
 end loop;
 if points not between 8 and 12000 then raise exception 'Desenhe a assinatura no campo indicado.' using errcode='22023'; end if;
 insert into public.stockai_order_movements(org_id,unit_id,item_id,order_line_id,qty_base,unit_cost_cents,created_by)
 select m.org_id,o.destination_id,m.item_id,m.order_line_id,-m.qty_base,m.unit_cost_cents,auth.uid() from public.stockai_order_movements m join public.stockai_order_lines l on l.id=m.order_line_id where l.order_id=o.id and m.unit_id=o.source_id;
 update public.stockai_orders set status='delivered',received_by=auth.uid(),received_at=now(),receiver_name=trim(p_name),signature=p_signature,delivery_notes=coalesce(p_notes,'') where id=o.id;
end $$;
create function stockai_private.cancel_order(p_order uuid) returns void language plpgsql security definer set search_path='' as $$
declare o public.stockai_orders;
begin
 select * into o from public.stockai_orders where id=p_order for update;
 if o.id is null or not (stockai_private.can_access(o.org_id,o.destination_id,array['owner','manager','unit_manager','operator','implementer']) or stockai_private.can_access(o.org_id,o.source_id,array['owner','manager','unit_manager','implementer'])) then raise exception 'Sem permissão.' using errcode='42501'; end if;
 if o.status='cancelled' then return; end if;
 if o.status<>'requested' then raise exception 'Só é possível cancelar antes da expedição.' using errcode='22023'; end if;
 update public.stockai_orders set status='cancelled',cancelled_by=auth.uid(),cancelled_at=now() where id=o.id;
end $$;
create function public.stockai_order_units() returns jsonb language sql security invoker set search_path='' as $$ select stockai_private.order_units(); $$;
create function public.stockai_create_order(p_source uuid,p_destination uuid,p_kitchen text,p_notes text,p_needed date,p_lines jsonb,p_request uuid) returns uuid language sql security invoker set search_path='' as $$ select stockai_private.create_order(p_source,p_destination,p_kitchen,p_notes,p_needed,p_lines,p_request); $$;
create function public.stockai_dispatch_order(p_order uuid,p_lines jsonb) returns void language sql security invoker set search_path='' as $$ select stockai_private.dispatch_order(p_order,p_lines); $$;
create function public.stockai_receive_order(p_order uuid,p_name text,p_signature jsonb,p_notes text) returns void language sql security invoker set search_path='' as $$ select stockai_private.receive_order(p_order,p_name,p_signature,p_notes); $$;
create function public.stockai_cancel_order(p_order uuid) returns void language sql security invoker set search_path='' as $$ select stockai_private.cancel_order(p_order); $$;
create function public.stockai_stock_balances() returns table(unit_id uuid,item_id uuid,name text,uom text,quantity numeric,value_cents numeric)
language sql stable security invoker set search_path='' as $$
 select m.unit_id,m.item_id,i.name,i.base_uom,sum(m.qty_base),round(sum(m.qty_base*m.unit_cost_cents)) from (
 select unit_id,item_id,qty_base,unit_cost_cents from public.stockai_stock_movements
 union all select unit_id,item_id,qty_base,unit_cost_cents from public.stockai_order_movements) m
 join public.stockai_items i on i.id=m.item_id group by m.unit_id,m.item_id,i.name,i.base_uom;
$$;
revoke execute on function stockai_private.order_units(),stockai_private.create_order(uuid,uuid,text,text,date,jsonb,uuid),stockai_private.dispatch_order(uuid,jsonb),stockai_private.receive_order(uuid,text,jsonb,text),stockai_private.cancel_order(uuid) from public,anon,authenticated;
grant execute on function stockai_private.order_units(),stockai_private.create_order(uuid,uuid,text,text,date,jsonb,uuid),stockai_private.dispatch_order(uuid,jsonb),stockai_private.receive_order(uuid,text,jsonb,text),stockai_private.cancel_order(uuid) to authenticated;
revoke execute on function public.stockai_order_units(),public.stockai_create_order(uuid,uuid,text,text,date,jsonb,uuid),public.stockai_dispatch_order(uuid,jsonb),public.stockai_receive_order(uuid,text,jsonb,text),public.stockai_cancel_order(uuid),public.stockai_stock_balances() from public,anon;
grant execute on function public.stockai_order_units(),public.stockai_create_order(uuid,uuid,text,text,date,jsonb,uuid),public.stockai_dispatch_order(uuid,jsonb),public.stockai_receive_order(uuid,text,jsonb,text),public.stockai_cancel_order(uuid),public.stockai_stock_balances() to authenticated;
