alter table public.stockai_receipts add column revision integer not null default 0;
alter table public.stockai_receipts add column notes text not null default '' check(length(notes)<=2000);
alter table public.stockai_receipt_lines add column is_active boolean not null default true;
drop index public.stockai_manual_receipt_item;
drop index public.stockai_xml_receipt_item;
create unique index stockai_manual_receipt_item on public.stockai_receipt_lines(receipt_id,item_id) where source_item_number is null and is_active;
create unique index stockai_xml_receipt_item on public.stockai_receipt_lines(receipt_id,source_item_number) where source_item_number is not null and is_active;
-- Historical rows keep their original unit when the operational destination is corrected.
alter table public.stockai_receipt_lines drop constraint stockai_receipt_lines_org_id_unit_id_receipt_id_fkey;
alter table public.stockai_receipt_lines add constraint stockai_lines_receipt_history foreign key(org_id,receipt_id) references public.stockai_receipts(org_id,id);
alter table public.stockai_receipt_lines add constraint stockai_lines_unit_history foreign key(org_id,unit_id) references public.stockai_units(org_id,id);
alter table public.stockai_audit_events drop constraint stockai_audit_events_org_id_unit_id_receipt_id_fkey;
alter table public.stockai_audit_events add constraint stockai_audit_receipt_history foreign key(org_id,receipt_id) references public.stockai_receipts(org_id,id);
alter table public.stockai_nfe_documents drop constraint stockai_nfe_documents_org_id_unit_id_receipt_id_fkey;
alter table public.stockai_nfe_documents add constraint stockai_nfe_receipt_history foreign key(org_id,receipt_id) references public.stockai_receipts(org_id,id);
alter table public.stockai_supplier_claims drop constraint stockai_supplier_claims_status_check;
alter table public.stockai_supplier_claims add constraint stockai_supplier_claims_status_check check(status in ('open','acknowledged','settled','written_off','superseded'));
create table public.stockai_receipt_revisions (
 id uuid primary key default gen_random_uuid(),org_id uuid not null,receipt_id uuid not null,version integer not null,
 request_id uuid not null,actor_id uuid not null references auth.users(id),reason text not null check(length(trim(reason)) between 3 and 1000),
 before_data jsonb not null,after_data jsonb not null,created_at timestamptz not null default now(),
 unique(receipt_id,version),unique(receipt_id,request_id),foreign key(org_id,receipt_id) references public.stockai_receipts(org_id,id)
);
alter table public.stockai_receipt_revisions enable row level security;
create policy receipt_revisions_read on public.stockai_receipt_revisions for select to authenticated using(exists(select 1 from public.stockai_receipts r where r.id=receipt_id));
revoke all on public.stockai_receipt_revisions from public,anon,authenticated;
grant select on public.stockai_receipt_revisions to authenticated;
create trigger revisions_immutable before update or delete on public.stockai_receipt_revisions for each row execute function stockai_private.immutable_record();

CREATE OR REPLACE FUNCTION stockai_private.finalize_receipt(p_receipt uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare r stockai_receipts;
begin
 select * into r from stockai_receipts where id=p_receipt for update;
 if r.status='closed' then return; end if;
 if exists(select 1 from stockai_receipt_lines where receipt_id=r.id and is_active and counted_qty is null) then raise exception 'Contagem incompleta.'; end if;
 insert into stockai_stock_movements(org_id,unit_id,item_id,receipt_line_id,qty_base,unit_cost_cents,created_by)
 select org_id,unit_id,item_id,id,counted_qty,unit_price_cents,auth.uid() from stockai_receipt_lines where receipt_id=r.id and is_active and counted_qty>0;
 insert into stockai_supplier_claims(org_id,unit_id,supplier_id,receipt_line_id,amount_cents,qty_base)
 select org_id,unit_id,r.supplier_id,id,credit_cents,invoiced_qty-counted_qty from stockai_receipt_lines where receipt_id=r.id and is_active and credit_cents>0;
 update stockai_receipts set status='closed',approved_by=auth.uid(),closed_at=now() where id=r.id;
 insert into stockai_audit_events(org_id,unit_id,actor_id,receipt_id,kind) values(r.org_id,r.unit_id,auth.uid(),r.id,'receipt_closed');
end; $function$;

CREATE OR REPLACE FUNCTION stockai_private.submit_count(p_receipt uuid, p_counts jsonb)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare r stockai_receipts; l stockai_receipt_lines; v_qty numeric; v_divergent boolean := false;
begin
 select * into r from stockai_receipts where id=p_receipt for update;
 if not found or not stockai_private.can_access(r.org_id,r.unit_id,array['owner','manager','unit_manager','operator','implementer']) then raise exception 'Sem permissão.' using errcode='42501'; end if;
 if r.status<>'counting' then raise exception 'Recebimento já conferido.'; end if;
 if p_counts is null or jsonb_typeof(p_counts)<>'object' then raise exception 'Contagem inválida.'; end if;
 if (select count(*) from jsonb_object_keys(p_counts))<>(select count(*) from stockai_receipt_lines where receipt_id=r.id and is_active) then raise exception 'Informe todos os itens, sem duplicações.'; end if;
 for l in select * from stockai_receipt_lines where receipt_id=r.id and is_active loop
   if not (p_counts ? l.id::text) or jsonb_typeof(p_counts->l.id::text)<>'number' then raise exception 'Contagem incompleta.'; end if;
   v_qty := (p_counts->>l.id::text)::numeric;
   if v_qty<0 or v_qty>=1000000000 or v_qty<>round(v_qty,4) then raise exception 'Quantidade inválida.'; end if;
   v_divergent:=v_divergent or v_qty<>l.invoiced_qty;
   update stockai_receipt_lines set counted_qty=v_qty,payable_cents=case when fiscal_total_cents is null then round(least(v_qty,invoiced_qty)*unit_price_cents) else round(least(v_qty,invoiced_qty)/invoiced_qty*fiscal_total_cents) end,
   credit_cents=coalesce(fiscal_total_cents,round(invoiced_qty*unit_price_cents))-case when fiscal_total_cents is null then round(least(v_qty,invoiced_qty)*unit_price_cents) else round(least(v_qty,invoiced_qty)/invoiced_qty*fiscal_total_cents) end where id=l.id;
 end loop;
 update stockai_receipts set counted_by=auth.uid(),status='pending_approval' where id=r.id;
 insert into stockai_audit_events(org_id,unit_id,actor_id,receipt_id,kind,payload) values(r.org_id,r.unit_id,auth.uid(),r.id,'receipt_counted',jsonb_build_object('divergent',v_divergent));
 if not v_divergent then perform stockai_private.finalize_receipt(r.id); return 'closed'; end if;
 return 'pending_approval';
end; $function$;

CREATE OR REPLACE FUNCTION stockai_private.blind_receipt(p_receipt uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare r stockai_receipts; result jsonb;
begin
 select * into r from stockai_receipts where id=p_receipt;
 if not found or not stockai_private.can_access(r.org_id,r.unit_id,array['owner','manager','unit_manager','operator','implementer']) then raise exception 'Sem permissão.' using errcode='42501'; end if;
 select jsonb_build_object('id',r.id,'supplier',s.name,'unit',u.name,'status',r.status,'lines',
   (select jsonb_agg(jsonb_build_object('id',l.id,'name',i.name,'uom',i.base_uom) order by i.name)
    from stockai_receipt_lines l join stockai_items i on i.id=l.item_id where l.receipt_id=r.id and l.is_active)) into result
 from stockai_suppliers s,stockai_units u where s.id=r.supplier_id and u.id=r.unit_id;
 return result;
end; $function$;


create function stockai_private.edit_receipt(p_receipt uuid,p_expected integer,p_request uuid,p_header jsonb,p_lines jsonb,p_reason text) returns void language plpgsql security definer set search_path='' as $$
declare r public.stockai_receipts;v_unit uuid;v_supplier uuid;v_before jsonb;v_after jsonb;l jsonb;v_item public.stockai_items;v_qty numeric;v_count numeric;v_price numeric;v_fiscal bigint;v_payable bigint;v_closed boolean;
begin
 select * into r from public.stockai_receipts where id=p_receipt for update;
 if r.id is null or not stockai_private.can_access(r.org_id,r.unit_id,array['owner','manager','unit_manager','implementer']) then raise exception 'Sem permissão para editar esta nota.' using errcode='42501';end if;
 if exists(select 1 from public.stockai_receipt_revisions where receipt_id=r.id and request_id=p_request) then return;end if;
 if p_expected is distinct from r.revision then raise exception 'A nota foi alterada por outra pessoa. Atualize antes de salvar.' using errcode='40001';end if;
 if p_request is null or length(trim(coalesce(p_reason,''))) not between 3 and 1000 or jsonb_typeof(p_header) is distinct from 'object' or jsonb_typeof(p_lines) is distinct from 'array' then raise exception 'Informe os campos e o motivo da alteração.' using errcode='22023';end if;
 if jsonb_array_length(p_lines) not between 1 and 990 then raise exception 'A nota precisa ter de 1 a 990 itens.' using errcode='22023';end if;
 v_unit:=(p_header->>'unit_id')::uuid;
 if not exists(select 1 from public.stockai_units where id=v_unit and org_id=r.org_id and tax_id is not null) or not stockai_private.can_access(r.org_id,v_unit,array['owner','manager','unit_manager','implementer']) then raise exception 'Escolha uma empresa autorizada do mesmo grupo.' using errcode='42501';end if;
 if length(trim(coalesce(p_header->>'supplier',''))) not between 1 and 120 or length(trim(coalesce(p_header->>'invoice_number',''))) not between 1 and 44 or length(coalesce(p_header->>'notes',''))>2000 or length(coalesce(p_header->>'invoice_series',''))>3 then raise exception 'Revise fornecedor, número, série e observações.' using errcode='22023';end if;
 if jsonb_typeof(p_header->'invoice_total_cents') is distinct from 'number' or (p_header->>'invoice_total_cents')::numeric<0 or (p_header->>'invoice_total_cents')::numeric<>trunc((p_header->>'invoice_total_cents')::numeric) then raise exception 'Total da nota inválido.' using errcode='22023';end if;
 -- Snapshot original versions, including financial claim status, before changing anything.
 v_before:=jsonb_build_object('receipt',to_jsonb(r),'lines',(select jsonb_agg(to_jsonb(x)) from public.stockai_receipt_lines x where x.receipt_id=r.id and x.is_active),'claims',(select jsonb_agg(to_jsonb(c)) from public.stockai_supplier_claims c join public.stockai_receipt_lines x on x.id=c.receipt_line_id where x.receipt_id=r.id and x.is_active));
 v_closed:=r.status='closed';
 -- Share stock locks with dispatch so it never observes only half of a correction.
 for l in select jsonb_build_object('unit',u,'item',i) from (
 select r.unit_id u,item_id i from public.stockai_receipt_lines where receipt_id=r.id and is_active
 union select v_unit,(value->>'item_id')::uuid from jsonb_array_elements(p_lines)) x order by u,i loop
 perform pg_advisory_xact_lock(hashtextextended((l->>'unit')||(l->>'item'),0));
 end loop;
 if v_closed then
 insert into public.stockai_stock_movements(org_id,unit_id,item_id,receipt_line_id,kind,qty_base,unit_cost_cents,reverses_id,created_by)
 select m.org_id,m.unit_id,m.item_id,m.receipt_line_id,'reversal',-m.qty_base,m.unit_cost_cents,m.id,auth.uid() from public.stockai_stock_movements m join public.stockai_receipt_lines x on x.id=m.receipt_line_id where x.receipt_id=r.id and x.is_active and m.kind='entry' and not exists(select 1 from public.stockai_stock_movements rev where rev.reverses_id=m.id);
 end if;
 update public.stockai_supplier_claims set status='superseded' where receipt_line_id in(select id from public.stockai_receipt_lines where receipt_id=r.id and is_active);
 update public.stockai_receipt_lines set is_active=false where receipt_id=r.id and is_active;
 insert into public.stockai_suppliers(org_id,name) values(r.org_id,trim(p_header->>'supplier')) on conflict(org_id,name) do update set name=excluded.name returning id into v_supplier;
 update public.stockai_receipts set unit_id=v_unit,supplier_id=v_supplier,invoice_number=trim(p_header->>'invoice_number'),invoice_series=nullif(trim(p_header->>'invoice_series'),''),issued_at=nullif(p_header->>'issued_at','')::timestamptz,invoice_total_cents=(p_header->>'invoice_total_cents')::bigint,notes=coalesce(p_header->>'notes',''),revision=revision+1,status=case when v_closed then 'pending_approval' else 'counting' end,counted_by=case when v_closed then auth.uid() else null end,approved_by=null,closed_at=null where id=r.id;
 for l in select value from jsonb_array_elements(p_lines) loop
 select * into v_item from public.stockai_items where id=(l->>'item_id')::uuid and org_id=r.org_id and is_active;
 if v_item.id is null or jsonb_typeof(l->'quantity') is distinct from 'number' or jsonb_typeof(l->'price_cents') is distinct from 'number' then raise exception 'Produto, quantidade ou preço inválido.' using errcode='22023';end if;
 v_qty:=(l->>'quantity')::numeric;v_price:=(l->>'price_cents')::numeric;
 if v_qty<=0 or v_qty>=1e9 or v_qty<>round(v_qty,4) or v_price<0 or v_price>=1e11 or v_price<>round(v_price,8) then raise exception 'Quantidade ou preço fora do limite.' using errcode='22023';end if;
 if v_closed then
 if jsonb_typeof(l->'counted') is distinct from 'number' then raise exception 'Informe a quantidade recebida de cada item.' using errcode='22023';end if;
 v_count:=(l->>'counted')::numeric;
 if v_count<0 or v_count>=1e9 or v_count<>round(v_count,4) then raise exception 'Quantidade recebida inválida.' using errcode='22023';end if;
 else v_count:=null;end if;
 v_fiscal:=round(v_qty*v_price);v_payable:=case when v_count is null then null else round(least(v_count,v_qty)/v_qty*v_fiscal) end;
 insert into public.stockai_receipt_lines(org_id,unit_id,receipt_id,item_id,invoiced_qty,counted_qty,unit_price_cents,fiscal_total_cents,payable_cents,credit_cents)
 values(r.org_id,v_unit,r.id,v_item.id,v_qty,v_count,v_price,v_fiscal,v_payable,case when v_payable is null then null else v_fiscal-v_payable end);
 end loop;
 if v_closed then perform stockai_private.finalize_receipt(r.id);end if;
 select jsonb_build_object('receipt',to_jsonb(h),'lines',(select jsonb_agg(to_jsonb(x)) from public.stockai_receipt_lines x where x.receipt_id=r.id and x.is_active)) into v_after from public.stockai_receipts h where h.id=r.id;
 insert into public.stockai_receipt_revisions(org_id,receipt_id,version,request_id,actor_id,reason,before_data,after_data) values(r.org_id,r.id,r.revision+1,p_request,auth.uid(),trim(p_reason),v_before,v_after);
 insert into public.stockai_audit_events(org_id,unit_id,actor_id,receipt_id,kind,payload) values(r.org_id,v_unit,auth.uid(),r.id,'receipt_edited',jsonb_build_object('revision',r.revision+1,'reason',trim(p_reason)));
end $$;
create function public.stockai_edit_receipt(p_receipt uuid,p_expected integer,p_request uuid,p_header jsonb,p_lines jsonb,p_reason text) returns void language sql security invoker set search_path='' as $$select stockai_private.edit_receipt(p_receipt,p_expected,p_request,p_header,p_lines,p_reason);$$;
revoke all on function stockai_private.edit_receipt(uuid,integer,uuid,jsonb,jsonb,text),public.stockai_edit_receipt(uuid,integer,uuid,jsonb,jsonb,text) from public,anon;
grant execute on function stockai_private.edit_receipt(uuid,integer,uuid,jsonb,jsonb,text),public.stockai_edit_receipt(uuid,integer,uuid,jsonb,jsonb,text) to authenticated;
