begin;

  create table "public"."stockai_product_categories" (
    "id" uuid not null default gen_random_uuid(),
    "org_id" uuid not null,
    "name" text not null,
    "created_at" timestamp with time zone not null default now()
      );


alter table "public"."stockai_product_categories" enable row level security;

alter table "public"."stockai_items" add column "category_id" uuid;

alter table "public"."stockai_items" add column "composes_cmv" boolean;

CREATE UNIQUE INDEX stockai_category_name ON public.stockai_product_categories USING btree (org_id, lower(TRIM(BOTH FROM name)));

CREATE INDEX stockai_items_category ON public.stockai_items USING btree (org_id, category_id);

CREATE UNIQUE INDEX stockai_product_categories_org_id_id_key ON public.stockai_product_categories USING btree (org_id, id);

CREATE UNIQUE INDEX stockai_product_categories_pkey ON public.stockai_product_categories USING btree (id);

alter table "public"."stockai_product_categories" add constraint "stockai_product_categories_pkey" PRIMARY KEY using index "stockai_product_categories_pkey";

alter table "public"."stockai_items" add constraint "stockai_items_category_scope" FOREIGN KEY (org_id, category_id) REFERENCES public.stockai_product_categories(org_id, id) not valid;

alter table "public"."stockai_items" validate constraint "stockai_items_category_scope";

alter table "public"."stockai_product_categories" add constraint "stockai_product_categories_name_check" CHECK (((length(TRIM(BOTH FROM name)) >= 2) AND (length(TRIM(BOTH FROM name)) <= 80))) not valid;

alter table "public"."stockai_product_categories" validate constraint "stockai_product_categories_name_check";

alter table "public"."stockai_product_categories" add constraint "stockai_product_categories_org_id_fkey" FOREIGN KEY (org_id) REFERENCES public.stockai_orgs(id) not valid;

alter table "public"."stockai_product_categories" validate constraint "stockai_product_categories_org_id_fkey";

alter table "public"."stockai_product_categories" add constraint "stockai_product_categories_org_id_id_key" UNIQUE using index "stockai_product_categories_org_id_id_key";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.stockai_save_category(p_org uuid, p_name text, p_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE sql
 SET search_path TO ''
AS $function$select stockai_private.save_category(p_org,p_name,p_id);$function$
;

CREATE OR REPLACE FUNCTION public.stockai_save_product(p_org uuid, p_name text, p_uom text, p_category uuid DEFAULT NULL::uuid, p_cmv boolean DEFAULT NULL::boolean, p_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE sql
 SET search_path TO ''
AS $function$select stockai_private.save_product(p_org,p_name,p_uom,p_category,p_cmv,p_id);$function$
;

CREATE OR REPLACE FUNCTION stockai_private.can_manage_catalog(p_org uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select auth.uid() is not null and exists(select 1 from public.stockai_memberships where org_id=p_org and user_id=auth.uid() and unit_id is null and role in ('owner','manager','implementer') and revoked_at is null and (expires_at is null or expires_at>now()));
$function$
;

CREATE OR REPLACE FUNCTION stockai_private.resolve_item(p_org uuid, p_name text, p_uom text, p_line jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare v_id uuid; v_category uuid; v_cmv boolean;
begin
 v_category:=nullif(p_line->>'category_id','')::uuid;
 if p_line ? 'composes_cmv' and p_line->'composes_cmv'<>'null'::jsonb then
 if jsonb_typeof(p_line->'composes_cmv')<>'boolean' then raise exception 'CMV deve ser Sim ou Não.' using errcode='22023'; end if;
 v_cmv:=(p_line->>'composes_cmv')::boolean;
 end if;
 if v_category is not null and not exists(select 1 from public.stockai_product_categories where id=v_category and org_id=p_org) then raise exception 'Categoria não pertence a este grupo.' using errcode='22023'; end if;
 insert into public.stockai_items(org_id,name,base_uom,category_id,composes_cmv) values(p_org,trim(p_name),p_uom,v_category,v_cmv)
 on conflict(org_id,name,base_uom) do update set name=excluded.name returning id into v_id;
 return v_id;
end $function$
;

CREATE OR REPLACE FUNCTION stockai_private.save_category(p_org uuid, p_name text, p_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_id uuid;
begin
 if not stockai_private.can_manage_catalog(p_org) then raise exception 'Sem permissão para gerenciar categorias.' using errcode='42501'; end if;
 if p_name is null or length(trim(p_name)) not between 2 and 80 then raise exception 'Informe uma categoria com 2 a 80 caracteres.' using errcode='22023'; end if;
 if p_id is null then insert into public.stockai_product_categories(org_id,name) values(p_org,trim(p_name)) returning id into v_id;
 else update public.stockai_product_categories set name=trim(p_name) where id=p_id and org_id=p_org returning id into v_id;
 if v_id is null then raise exception 'Categoria não encontrada.' using errcode='42501'; end if; end if;
 return v_id;
end $function$
;

CREATE OR REPLACE FUNCTION stockai_private.save_product(p_org uuid, p_name text, p_uom text, p_category uuid DEFAULT NULL::uuid, p_cmv boolean DEFAULT NULL::boolean, p_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_id uuid;
begin
 if not stockai_private.can_manage_catalog(p_org) then raise exception 'Sem permissão para gerenciar produtos.' using errcode='42501'; end if;
 if p_name is null or length(trim(p_name)) not between 1 and 120 or p_uom is null or p_uom not in ('KG','L','UN') or p_cmv is null then raise exception 'Informe nome, unidade e se o produto compõe CMV.' using errcode='22023'; end if;
 if p_category is not null and not exists(select 1 from public.stockai_product_categories where id=p_category and org_id=p_org) then raise exception 'Categoria não pertence a este grupo.' using errcode='22023'; end if;
 if p_id is null then insert into public.stockai_items(org_id,name,base_uom,category_id,composes_cmv) values(p_org,trim(p_name),p_uom,p_category,p_cmv) returning id into v_id;
 else update public.stockai_items set category_id=p_category,composes_cmv=p_cmv where id=p_id and org_id=p_org and name=trim(p_name) and base_uom=p_uom returning id into v_id;
 if v_id is null then raise exception 'Produto não encontrado ou identificação alterada.' using errcode='22023'; end if; end if;
 return v_id;
end $function$
;

CREATE OR REPLACE FUNCTION stockai_private.import_nfe(p_unit uuid, p_request uuid, p_xml text, p_invoice jsonb, p_lines jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_org uuid; v_tax text; v_key text; v_emit text; v_receipt uuid; v_supplier uuid; v_item uuid; v_doc xml; l jsonb; v_count int; v_quantity numeric; v_fiscal bigint; v_source_qty numeric; v_name text; v_number text; v_invoice_number text; v_series text; v_total bigint; v_path text;
ns text[][]:=array[array['n','http://www.portalfiscal.inf.br/nfe']];
begin
 select org_id,tax_id into v_org,v_tax from public.stockai_units where id=p_unit for share;
 if auth.uid() is null or v_org is null or not stockai_private.can_access(v_org,p_unit,array['owner','manager','unit_manager','implementer']) then raise exception 'Sem permissão.' using errcode='42501'; end if;
 if p_request is null or p_xml is null or octet_length(p_xml)>1048576 or p_xml ~* '<!\s*(DOCTYPE|ENTITY)' or jsonb_typeof(p_lines) is distinct from 'array' or jsonb_typeof(p_invoice) is distinct from 'object' then raise exception 'XML inválido.' using errcode='22023'; end if;
 v_doc:=xmlparse(document p_xml);
 if cardinality(xpath('/n:nfeProc/n:NFe/n:infNFe',v_doc,ns))<>1 then raise exception 'Envie uma NF-e completa.' using errcode='22023'; end if;
 v_key:=replace((xpath('/n:nfeProc/n:NFe/n:infNFe/@Id',v_doc,ns))[1]::text,'NFe','');
 if v_key is null or v_key !~ '^[A-Z0-9]{44}$' or v_key is distinct from p_invoice->>'key' or (xpath('/n:nfeProc/n:NFe/n:infNFe/n:dest/n:CNPJ/text()',v_doc,ns))[1]::text is distinct from v_tax or v_tax is null then raise exception 'O CNPJ da nota não corresponde à empresa selecionada.' using errcode='22023'; end if;
 if coalesce((xpath('/n:nfeProc/n:protNFe/n:infProt/n:cStat/text()',v_doc,ns))[1]::text,'') not in ('100','150') or (xpath('/n:nfeProc/n:protNFe/n:infProt/n:chNFe/text()',v_doc,ns))[1]::text is distinct from v_key or (xpath('/n:nfeProc/n:NFe/n:infNFe/n:ide/n:tpAmb/text()',v_doc,ns))[1]::text is distinct from '1' or (xpath('/n:nfeProc/n:NFe/n:infNFe/n:ide/n:mod/text()',v_doc,ns))[1]::text is distinct from '55' or (xpath('/n:nfeProc/n:protNFe/n:infProt/n:tpAmb/text()',v_doc,ns))[1]::text is distinct from '1' or (xpath('/n:nfeProc/n:NFe/n:infNFe/@versao',v_doc,ns))[1]::text is distinct from '4.00' or (xpath('/n:nfeProc/n:NFe/n:infNFe/n:ide/n:tpNF/text()',v_doc,ns))[1]::text is distinct from '1' or (xpath('/n:nfeProc/n:NFe/n:infNFe/n:ide/n:finNFe/text()',v_doc,ns))[1]::text is distinct from '1' then raise exception 'NF-e incompatível com recebimento.' using errcode='22023'; end if;
 v_emit:=(xpath('/n:nfeProc/n:NFe/n:infNFe/n:emit/n:CNPJ/text()',v_doc,ns))[1]::text;
 v_invoice_number:=(xpath('/n:nfeProc/n:NFe/n:infNFe/n:ide/n:nNF/text()',v_doc,ns))[1]::text;
 v_series:=(xpath('/n:nfeProc/n:NFe/n:infNFe/n:ide/n:serie/text()',v_doc,ns))[1]::text;
 v_total:=round(((xpath('/n:nfeProc/n:NFe/n:infNFe/n:total/n:ICMSTot/n:vNF/text()',v_doc,ns))[1]::text)::numeric*100);
 if v_total is null or v_invoice_number is null or v_series is null or v_emit is null then raise exception 'Dados fiscais incompletos.' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended(v_org::text,0));
 select id into v_receipt from public.stockai_receipts where org_id=v_org and request_id=p_request;
 if found then
   if not exists(select 1 from public.stockai_receipts where id=v_receipt and unit_id=p_unit and access_key=v_key) then raise exception 'Solicitação já usada para outro recebimento.' using errcode='22023'; end if;
   return v_receipt;
 end if;
 if exists(select 1 from public.stockai_receipts where unit_id=p_unit and access_key=v_key) then raise exception 'Esta NF-e já foi importada para a empresa.' using errcode='23505'; end if;
 select id into v_supplier from public.stockai_suppliers where org_id=v_org and tax_id=v_emit;
 if v_supplier is null then
   insert into public.stockai_suppliers(org_id,name,tax_id) values(v_org,trim(p_invoice->>'supplierName'),v_emit)
   on conflict(org_id,name) do update set tax_id=excluded.tax_id where stockai_suppliers.tax_id is null or stockai_suppliers.tax_id=excluded.tax_id returning id into v_supplier;
   if v_supplier is null then raise exception 'Já existe fornecedor com esse nome e outro CNPJ. Revise o cadastro.' using errcode='22023'; end if;
 end if;
 insert into public.stockai_receipts(org_id,unit_id,supplier_id,invoice_number,invoice_series,access_key,issued_at,invoice_total_cents,request_id,created_by)
 values(v_org,p_unit,v_supplier,v_invoice_number,v_series,v_key,(p_invoice->>'issuedAt')::timestamptz,v_total,p_request,auth.uid()) returning id into v_receipt;
 v_count:=cardinality(xpath('/n:nfeProc/n:NFe/n:infNFe/n:det',v_doc,ns));
 if v_count not between 1 and 990 or jsonb_array_length(p_lines)<>v_count then raise exception 'Itens da nota incompletos.' using errcode='22023'; end if;
 for l in select value from jsonb_array_elements(p_lines) loop
   v_number:=l->>'number';
   if v_number is null or v_number !~ '^[0-9]{1,3}$' then raise exception 'Item inválido.' using errcode='22023'; end if;
   v_path:='/n:nfeProc/n:NFe/n:infNFe/n:det[@nItem="'||v_number||'"]/n:prod';
   if cardinality(xpath(v_path,v_doc,ns))<>1 then raise exception 'Item não encontrado no XML.' using errcode='22023'; end if;
   v_source_qty:=((xpath(v_path||'/n:qCom/text()',v_doc,ns))[1]::text)::numeric;
   v_fiscal:=round((((xpath(v_path||'/n:vProd/text()',v_doc,ns))[1]::text)::numeric - coalesce(((xpath(v_path||'/n:vDesc/text()',v_doc,ns))[1]::text)::numeric,0))*100);
   v_quantity:=(l->>'quantity')::numeric;
   if v_quantity is null or v_quantity<=0 or v_quantity>=1e9 or v_quantity<>round(v_quantity,4) or v_quantity is distinct from v_source_qty*(l->'source'->>'factor')::numeric or v_fiscal is null or v_fiscal<0 or v_fiscal is distinct from (l->>'fiscal_cents')::bigint or coalesce(l->>'uom','') not in ('KG','L','UN') then raise exception 'Conversão ou valor de item inválido.' using errcode='22023'; end if;
   v_name:=l->>'name';
   v_item:=stockai_private.resolve_item(v_org,v_name,l->>'uom',l);
   insert into public.stockai_receipt_lines(org_id,unit_id,receipt_id,item_id,invoiced_qty,unit_price_cents,fiscal_total_cents,source_item_number,source_data)
   values(v_org,p_unit,v_receipt,v_item,v_quantity,v_fiscal::numeric/v_quantity,v_fiscal,v_number::int,l->'source');
 end loop;
 insert into public.stockai_nfe_documents(receipt_id,org_id,unit_id,raw_xml) values(v_receipt,v_org,p_unit,p_xml);
 insert into public.stockai_audit_events(org_id,unit_id,actor_id,receipt_id,kind,payload) values(v_org,p_unit,auth.uid(),v_receipt,'nfe_imported',jsonb_build_object('access_key',v_key));
 return v_receipt;
end $function$
;

CREATE OR REPLACE FUNCTION stockai_private.stockai_create_receipt(p_unit uuid, p_supplier text, p_invoice text, p_lines jsonb, p_request uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_org uuid; v_supplier uuid; v_receipt uuid; v_item uuid; l jsonb;
begin
 select org_id into v_org from stockai_units where id=p_unit;
 if v_org is null or not stockai_private.can_access(v_org,p_unit,array['owner','manager','unit_manager','implementer']) then raise exception 'Sem permissão.' using errcode='42501'; end if;
 if p_request is null or p_lines is null or jsonb_typeof(p_lines)<>'array' or jsonb_array_length(p_lines) not between 1 and 100 then raise exception 'Informe entre 1 e 100 itens.'; end if;
 perform pg_advisory_xact_lock(hashtextextended(v_org::text||p_request::text,0));
 select id into v_receipt from stockai_receipts where org_id=v_org and request_id=p_request;
 if found then return v_receipt; end if;
 insert into stockai_suppliers(org_id,name) values(v_org,trim(p_supplier)) on conflict(org_id,name) do update set name=excluded.name returning id into v_supplier;
 insert into stockai_receipts(org_id,unit_id,supplier_id,invoice_number,request_id,created_by) values(v_org,p_unit,v_supplier,trim(p_invoice),p_request,auth.uid()) returning id into v_receipt;
 for l in select value from jsonb_array_elements(p_lines) loop
   if jsonb_typeof(l->'quantity')<>'number' or jsonb_typeof(l->'price_cents')<>'number' or (l->>'price_cents')::numeric<>trunc((l->>'price_cents')::numeric) then raise exception 'Quantidade ou preço inválido.'; end if;
   v_item:=stockai_private.resolve_item(v_org,trim(l->>'name'),l->>'uom',l);
   insert into stockai_receipt_lines(org_id,unit_id,receipt_id,item_id,invoiced_qty,unit_price_cents)
   values(v_org,p_unit,v_receipt,v_item,(l->>'quantity')::numeric,(l->>'price_cents')::bigint);
 end loop;
 insert into stockai_audit_events(org_id,unit_id,actor_id,receipt_id,kind) values(v_org,p_unit,auth.uid(),v_receipt,'receipt_created');
 return v_receipt;
end; $function$
;

grant select on table "public"."stockai_product_categories" to "authenticated";

grant delete on table "public"."stockai_product_categories" to "service_role";

grant insert on table "public"."stockai_product_categories" to "service_role";

grant references on table "public"."stockai_product_categories" to "service_role";

grant select on table "public"."stockai_product_categories" to "service_role";

grant trigger on table "public"."stockai_product_categories" to "service_role";

grant truncate on table "public"."stockai_product_categories" to "service_role";

grant update on table "public"."stockai_product_categories" to "service_role";


  create policy "stockai_categories_read"
  on "public"."stockai_product_categories"
  as permissive
  for select
  to authenticated
using (stockai_private.can_access(org_id));




revoke all on public.stockai_product_categories from public,anon,authenticated;
grant select on public.stockai_product_categories to authenticated;
revoke all on function stockai_private.resolve_item(uuid,text,text,jsonb) from public,anon,authenticated;
revoke all on function stockai_private.can_manage_catalog(uuid),stockai_private.save_category(uuid,text,uuid),public.stockai_save_category(uuid,text,uuid),stockai_private.save_product(uuid,text,text,uuid,boolean,uuid),public.stockai_save_product(uuid,text,text,uuid,boolean,uuid) from public,anon;
grant execute on function stockai_private.can_manage_catalog(uuid),stockai_private.save_category(uuid,text,uuid),public.stockai_save_category(uuid,text,uuid),stockai_private.save_product(uuid,text,text,uuid,boolean,uuid),public.stockai_save_product(uuid,text,text,uuid,boolean,uuid) to authenticated;

commit;
