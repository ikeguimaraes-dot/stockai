alter table public.stockai_items add column internal_code text;
update public.stockai_items set internal_code='P-'||upper(replace(id::text,'-',''));
alter table public.stockai_items alter column internal_code set not null;
alter table public.stockai_items alter column internal_code set default ('P-'||upper(replace(gen_random_uuid()::text,'-','')));
alter table public.stockai_items add constraint stockai_internal_code_valid check(length(trim(internal_code)) between 1 and 60);
create unique index stockai_item_code on public.stockai_items(org_id,upper(trim(internal_code)));
create function stockai_private.save_product_code(p_org uuid,p_name text,p_uom text,p_code text,p_category uuid,p_cmv boolean,p_id uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid;
begin
 v_id:=stockai_private.save_product(p_org,p_name,p_uom,p_category,p_cmv,p_id);
 if length(trim(coalesce(p_code,''))) not between 1 and 60 then raise exception 'Informe seu código interno do produto.' using errcode='22023';end if;
 update public.stockai_items set internal_code=trim(p_code) where id=v_id;
 return v_id;
end $$;
create function public.stockai_save_product_code(p_org uuid,p_name text,p_uom text,p_code text,p_category uuid default null,p_cmv boolean default null,p_id uuid default null) returns uuid language sql security invoker set search_path='' as $$select stockai_private.save_product_code(p_org,p_name,p_uom,p_code,p_category,p_cmv,p_id);$$;

create table public.stockai_xml_inbox (
 id uuid primary key default gen_random_uuid(), uploaded_by uuid not null references auth.users(id),
 request_id uuid not null, filename text not null check(length(filename) between 1 and 255), raw_xml text not null check(octet_length(raw_xml)<=1048576),
 content_hash text generated always as (md5(raw_xml)) stored,
 org_id uuid references public.stockai_orgs(id),unit_id uuid,receipt_id uuid references public.stockai_receipts(id),
 status text not null default 'pending' check(status in ('pending','imported','duplicate')),
 message text not null default 'Aguardando identificação.',created_at timestamptz not null default now(),
 unique(uploaded_by,request_id),unique(uploaded_by,content_hash),
 foreign key(org_id,unit_id) references public.stockai_units(org_id,id)
);
create index stockai_xml_inbox_owner on public.stockai_xml_inbox(uploaded_by,created_at desc);
create index stockai_xml_inbox_unit on public.stockai_xml_inbox(org_id,unit_id);
create table public.stockai_product_links (
 id uuid primary key default gen_random_uuid(),org_id uuid not null references public.stockai_orgs(id),
 supplier_tax_id text not null check(supplier_tax_id ~ '^[A-Z0-9]{12}[0-9]{2}$'),
 supplier_code text not null check(length(supplier_code) between 1 and 60),
 source_unit text not null check(length(source_unit) between 1 and 12),
 item_id uuid not null, factor numeric(18,6) not null check(factor>0),
 updated_by uuid not null references auth.users(id),updated_at timestamptz not null default now(),
 unique(org_id,supplier_tax_id,supplier_code,source_unit),
 foreign key(org_id,item_id) references public.stockai_items(org_id,id)
);
create index stockai_product_links_item on public.stockai_product_links(org_id,item_id);
alter table public.stockai_xml_inbox enable row level security;
alter table public.stockai_product_links enable row level security;
create policy xml_inbox_read on public.stockai_xml_inbox for select to authenticated using(uploaded_by=(select auth.uid()) or stockai_private.can_access(org_id,unit_id,array['owner','manager','unit_manager','implementer']));
create policy product_links_read on public.stockai_product_links for select to authenticated using(stockai_private.can_access(org_id));
revoke all on public.stockai_xml_inbox,public.stockai_product_links from public,anon,authenticated;
grant select on public.stockai_xml_inbox,public.stockai_product_links to authenticated;
create function stockai_private.queue_xml(p_filename text,p_xml text,p_request uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid;
begin
 if auth.uid() is null then raise exception 'Entre novamente.' using errcode='42501';end if;
 if p_request is null or p_xml is null or octet_length(p_xml)>1048576 or length(trim(coalesce(p_filename,''))) not between 1 and 255 then raise exception 'Arquivo inválido ou maior que 1 MB.' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text||md5(p_xml),0));
 select id into v_id from public.stockai_xml_inbox where uploaded_by=auth.uid() and (request_id=p_request or content_hash=md5(p_xml));
 if found then return v_id;end if;
 insert into public.stockai_xml_inbox(uploaded_by,request_id,filename,raw_xml) values(auth.uid(),p_request,p_filename,p_xml) returning id into v_id;
 return v_id;
end $$;
create function public.stockai_queue_xml(p_filename text,p_xml text,p_request uuid) returns uuid language sql security invoker set search_path='' as $$select stockai_private.queue_xml(p_filename,p_xml,p_request);$$;
create function stockai_private.xml_pending(p_id uuid,p_message text,p_unit uuid default null) returns void language plpgsql security definer set search_path='' as $$
declare r public.stockai_xml_inbox; v_org uuid;
begin
 select * into r from public.stockai_xml_inbox where id=p_id for update;
 if r.id is null or not (r.uploaded_by=auth.uid() or stockai_private.can_access(r.org_id,r.unit_id,array['owner','manager','unit_manager','implementer'])) then raise exception 'Sem permissão.' using errcode='42501';end if;
 if r.status<>'pending' then return;end if;
 if p_unit is not null then
 select org_id into v_org from public.stockai_units where id=p_unit;
 if v_org is null or not stockai_private.can_access(v_org,p_unit,array['owner','manager','unit_manager','implementer']) then raise exception 'Sem permissão na empresa.' using errcode='42501';end if;
 end if;
 update public.stockai_xml_inbox set message=left(coalesce(p_message,'Aguardando identificação.'),1000),org_id=coalesce(v_org,org_id),unit_id=coalesce(p_unit,unit_id) where id=p_id;
end $$;
create function public.stockai_xml_pending(p_id uuid,p_message text,p_unit uuid default null) returns void language sql security invoker set search_path='' as $$select stockai_private.xml_pending(p_id,p_message,p_unit);$$;
-- Explicit item IDs allow supplier descriptions to map to the internal catalog.
create or replace function stockai_private.resolve_item(p_org uuid,p_name text,p_uom text,p_line jsonb) returns uuid language plpgsql set search_path='' as $$
declare v_id uuid;v_category uuid;v_cmv boolean;
begin
 if nullif(p_line->>'item_id','') is not null then
 select id into v_id from public.stockai_items where id=(p_line->>'item_id')::uuid and org_id=p_org and base_uom=p_uom and is_active;
 if v_id is null then raise exception 'Produto vinculado não pertence ao grupo ou à unidade de medida escolhida.' using errcode='22023';end if;return v_id;
 end if;
 v_category:=nullif(p_line->>'category_id','')::uuid;
 if p_line ? 'composes_cmv' and p_line->'composes_cmv'<>'null'::jsonb then
 if jsonb_typeof(p_line->'composes_cmv')<>'boolean' then raise exception 'CMV deve ser Sim ou Não.' using errcode='22023';end if;
 v_cmv:=(p_line->>'composes_cmv')::boolean;end if;
 if v_category is not null and not exists(select 1 from public.stockai_product_categories where id=v_category and org_id=p_org) then raise exception 'Categoria não pertence ao grupo.' using errcode='22023';end if;
 insert into public.stockai_items(org_id,name,base_uom,category_id,composes_cmv) values(p_org,trim(p_name),p_uom,v_category,v_cmv) on conflict(org_id,name,base_uom) do update set name=excluded.name returning id into v_id;return v_id;
end $$;
create function stockai_private.identify_xml(p_id uuid,p_unit uuid,p_invoice jsonb,p_lines jsonb,p_remember boolean) returns uuid language plpgsql security definer set search_path='' as $$
declare r public.stockai_xml_inbox;v_org uuid;v_receipt uuid;l jsonb;v_doc xml;code text;uom text;emit text;ns text[][]:=array[array['n','http://www.portalfiscal.inf.br/nfe']];
begin
 select * into r from public.stockai_xml_inbox where id=p_id for update;
 if r.id is null or not (r.uploaded_by=auth.uid() or stockai_private.can_access(r.org_id,r.unit_id,array['owner','manager','unit_manager','implementer'])) then raise exception 'Sem permissão.' using errcode='42501';end if;
 select org_id into v_org from public.stockai_units where id=p_unit;
 if v_org is null or not stockai_private.can_access(v_org,p_unit,array['owner','manager','unit_manager','implementer']) then raise exception 'Sem permissão na empresa.' using errcode='42501';end if;
 if r.receipt_id is not null then return r.receipt_id;end if;
 -- Serialize duplicate handling with the receiving import transaction.
 perform pg_advisory_xact_lock(hashtextextended(v_org::text,0));
 v_doc:=xmlparse(document r.raw_xml);
 if (xpath('/n:nfeProc/n:NFe/n:infNFe/n:dest/n:CNPJ/text()',v_doc,ns))[1]::text is distinct from (select tax_id from public.stockai_units where id=p_unit) then raise exception 'Selecione a empresa com o CNPJ destinatário do XML.' using errcode='22023';end if;
 select id into v_receipt from public.stockai_receipts where unit_id=p_unit and access_key=replace((xpath('/n:nfeProc/n:NFe/n:infNFe/@Id',v_doc,ns))[1]::text,'NFe','');
 if v_receipt is not null then
 update public.stockai_xml_inbox set org_id=v_org,unit_id=p_unit,receipt_id=v_receipt,status='duplicate',message='Nota já cadastrada. Nenhuma entrada duplicada.' where id=p_id;return v_receipt;
 end if;
 if exists(select 1 from jsonb_array_elements(p_lines) x where nullif(x->>'item_id','') is null) then raise exception 'Vincule todos os produtos ao seu catálogo.' using errcode='22023';end if;
 v_receipt:=stockai_private.import_nfe(p_unit,r.request_id,r.raw_xml,p_invoice,p_lines);
 if p_remember then
 if not stockai_private.can_manage_catalog(v_org) then raise exception 'Peça ao gestor do grupo para salvar os vínculos do catálogo.' using errcode='42501';end if;
 emit:=(xpath('/n:nfeProc/n:NFe/n:infNFe/n:emit/n:CNPJ/text()',v_doc,ns))[1]::text;
 for l in select value from jsonb_array_elements(p_lines) loop
 select x.code,upper(trim(x.uom)) into code,uom from xmltable(xmlnamespaces('http://www.portalfiscal.inf.br/nfe' as n),'/n:nfeProc/n:NFe/n:infNFe/n:det' passing v_doc columns number text path '@nItem',code text path 'n:prod/n:cProd',uom text path 'n:prod/n:uCom') x where x.number=l->>'number';
 insert into public.stockai_product_links(org_id,supplier_tax_id,supplier_code,source_unit,item_id,factor,updated_by) values(v_org,emit,code,uom,(l->>'item_id')::uuid,(l->'source'->>'factor')::numeric,auth.uid())
 on conflict(org_id,supplier_tax_id,supplier_code,source_unit) do update set item_id=excluded.item_id,factor=excluded.factor,updated_by=auth.uid(),updated_at=now();
 end loop;end if;
 update public.stockai_xml_inbox set org_id=v_org,unit_id=p_unit,receipt_id=v_receipt,status='imported',message='Identificada e enviada para conferência.' where id=p_id;return v_receipt;
end $$;
create function public.stockai_identify_xml(p_id uuid,p_unit uuid,p_invoice jsonb,p_lines jsonb,p_remember boolean default false) returns uuid language sql security invoker set search_path='' as $$select stockai_private.identify_xml(p_id,p_unit,p_invoice,p_lines,p_remember);$$;
revoke all on function stockai_private.save_product_code(uuid,text,text,text,uuid,boolean,uuid),stockai_private.queue_xml(text,text,uuid),stockai_private.xml_pending(uuid,text,uuid),stockai_private.identify_xml(uuid,uuid,jsonb,jsonb,boolean),public.stockai_save_product_code(uuid,text,text,text,uuid,boolean,uuid),public.stockai_queue_xml(text,text,uuid),public.stockai_xml_pending(uuid,text,uuid),public.stockai_identify_xml(uuid,uuid,jsonb,jsonb,boolean) from public,anon;
grant execute on function stockai_private.save_product_code(uuid,text,text,text,uuid,boolean,uuid),stockai_private.queue_xml(text,text,uuid),stockai_private.xml_pending(uuid,text,uuid),stockai_private.identify_xml(uuid,uuid,jsonb,jsonb,boolean),public.stockai_save_product_code(uuid,text,text,text,uuid,boolean,uuid),public.stockai_queue_xml(text,text,uuid),public.stockai_xml_pending(uuid,text,uuid),public.stockai_identify_xml(uuid,uuid,jsonb,jsonb,boolean) to authenticated;
