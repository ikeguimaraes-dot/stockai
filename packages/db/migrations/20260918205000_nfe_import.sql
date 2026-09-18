begin;
alter table "public"."stockai_receipt_lines" drop constraint "stockai_receipt_lines_receipt_id_item_id_key";

alter table "public"."stockai_receipts" drop constraint "stockai_receipts_unit_id_supplier_id_invoice_number_key";

alter table "public"."stockai_receipt_lines" drop constraint "stockai_receipt_lines_unit_price_cents_check";

drop index if exists "public"."stockai_receipt_lines_receipt_id_item_id_key";

drop index if exists "public"."stockai_receipts_unit_id_supplier_id_invoice_number_key";


  create table "public"."stockai_nfe_documents" (
    "receipt_id" uuid not null,
    "org_id" uuid not null,
    "unit_id" uuid not null,
    "raw_xml" text not null,
    "created_at" timestamp with time zone not null default now()
      );


alter table "public"."stockai_nfe_documents" enable row level security;

alter table "public"."stockai_receipt_lines" add column "fiscal_total_cents" bigint;

alter table "public"."stockai_receipt_lines" add column "source_data" jsonb;

alter table "public"."stockai_receipt_lines" add column "source_item_number" integer;

alter table "public"."stockai_receipt_lines" alter column "unit_price_cents" set data type numeric(20,8) using "unit_price_cents"::numeric(20,8);

alter table "public"."stockai_receipts" add column "access_key" text;

alter table "public"."stockai_receipts" add column "invoice_series" text;

alter table "public"."stockai_receipts" add column "invoice_total_cents" bigint;

alter table "public"."stockai_receipts" add column "issued_at" timestamp with time zone;

alter table "public"."stockai_stock_movements" alter column "unit_cost_cents" set data type numeric(20,8) using "unit_cost_cents"::numeric(20,8);

alter table "public"."stockai_suppliers" add column "tax_id" text;

CREATE UNIQUE INDEX stockai_manual_receipt_item ON public.stockai_receipt_lines USING btree (receipt_id, item_id) WHERE (source_item_number IS NULL);

CREATE UNIQUE INDEX stockai_nfe_documents_pkey ON public.stockai_nfe_documents USING btree (receipt_id);

CREATE UNIQUE INDEX stockai_receipt_access_key ON public.stockai_receipts USING btree (unit_id, access_key) WHERE (access_key IS NOT NULL);

CREATE UNIQUE INDEX stockai_receipt_number_series ON public.stockai_receipts USING btree (unit_id, supplier_id, invoice_number, COALESCE(invoice_series, ''::text));

CREATE UNIQUE INDEX stockai_supplier_tax ON public.stockai_suppliers USING btree (org_id, tax_id) WHERE (tax_id IS NOT NULL);

CREATE UNIQUE INDEX stockai_xml_receipt_item ON public.stockai_receipt_lines USING btree (receipt_id, source_item_number) WHERE (source_item_number IS NOT NULL);

alter table "public"."stockai_nfe_documents" add constraint "stockai_nfe_documents_pkey" PRIMARY KEY using index "stockai_nfe_documents_pkey";

alter table "public"."stockai_nfe_documents" add constraint "stockai_nfe_documents_org_id_unit_id_receipt_id_fkey" FOREIGN KEY (org_id, unit_id, receipt_id) REFERENCES public.stockai_receipts(org_id, unit_id, id) not valid;

alter table "public"."stockai_nfe_documents" validate constraint "stockai_nfe_documents_org_id_unit_id_receipt_id_fkey";

alter table "public"."stockai_nfe_documents" add constraint "stockai_nfe_documents_raw_xml_check" CHECK ((octet_length(raw_xml) <= 1048576)) not valid;

alter table "public"."stockai_nfe_documents" validate constraint "stockai_nfe_documents_raw_xml_check";

alter table "public"."stockai_receipt_lines" add constraint "stockai_receipt_lines_fiscal_total_cents_check" CHECK ((fiscal_total_cents >= 0)) not valid;

alter table "public"."stockai_receipt_lines" validate constraint "stockai_receipt_lines_fiscal_total_cents_check";

alter table "public"."stockai_receipt_lines" add constraint "stockai_receipt_lines_source_item_number_check" CHECK (((source_item_number >= 1) AND (source_item_number <= 990))) not valid;

alter table "public"."stockai_receipt_lines" validate constraint "stockai_receipt_lines_source_item_number_check";

alter table "public"."stockai_receipts" add constraint "stockai_receipts_access_key_check" CHECK ((access_key ~ '^[A-Z0-9]{44}$'::text)) not valid;

alter table "public"."stockai_receipts" validate constraint "stockai_receipts_access_key_check";

alter table "public"."stockai_receipts" add constraint "stockai_receipts_invoice_total_cents_check" CHECK ((invoice_total_cents >= 0)) not valid;

alter table "public"."stockai_receipts" validate constraint "stockai_receipts_invoice_total_cents_check";

alter table "public"."stockai_suppliers" add constraint "stockai_suppliers_tax_id_check" CHECK ((tax_id ~ '^[A-Z0-9]{12}[0-9]{2}$'::text)) not valid;

alter table "public"."stockai_suppliers" validate constraint "stockai_suppliers_tax_id_check";

alter table "public"."stockai_receipt_lines" add constraint "stockai_receipt_lines_unit_price_cents_check" CHECK (((unit_price_cents >= (0)::numeric) AND (unit_price_cents < ('100000000000'::bigint)::numeric))) not valid;

alter table "public"."stockai_receipt_lines" validate constraint "stockai_receipt_lines_unit_price_cents_check";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.stockai_import_nfe(p_unit uuid, p_request uuid, p_xml text, p_invoice jsonb, p_lines jsonb)
 RETURNS uuid
 LANGUAGE sql
 SET search_path TO ''
AS $function$select stockai_private.import_nfe(p_unit,p_request,p_xml,p_invoice,p_lines);$function$
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
   insert into public.stockai_items(org_id,name,base_uom) values(v_org,v_name,l->>'uom') on conflict(org_id,name,base_uom) do update set name=excluded.name returning id into v_item;
   insert into public.stockai_receipt_lines(org_id,unit_id,receipt_id,item_id,invoiced_qty,unit_price_cents,fiscal_total_cents,source_item_number,source_data)
   values(v_org,p_unit,v_receipt,v_item,v_quantity,v_fiscal::numeric/v_quantity,v_fiscal,v_number::int,l->'source');
 end loop;
 insert into public.stockai_nfe_documents(receipt_id,org_id,unit_id,raw_xml) values(v_receipt,v_org,p_unit,p_xml);
 insert into public.stockai_audit_events(org_id,unit_id,actor_id,receipt_id,kind,payload) values(v_org,p_unit,auth.uid(),v_receipt,'nfe_imported',jsonb_build_object('access_key',v_key));
 return v_receipt;
end $function$
;

CREATE OR REPLACE FUNCTION stockai_private.protect_fiscal()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
 if (new.org_id,new.unit_id,new.receipt_id,new.item_id,new.invoiced_qty,new.unit_price_cents,new.fiscal_total_cents,new.source_item_number,new.source_data) is distinct from
 (old.org_id,old.unit_id,old.receipt_id,old.item_id,old.invoiced_qty,old.unit_price_cents,old.fiscal_total_cents,old.source_item_number,old.source_data) then raise exception 'Documento fiscal imutável.'; end if;
 return new;
end; $function$
;

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
 if (select count(*) from jsonb_object_keys(p_counts))<>(select count(*) from stockai_receipt_lines where receipt_id=r.id) then raise exception 'Informe todos os itens, sem duplicações.'; end if;
 for l in select * from stockai_receipt_lines where receipt_id=r.id loop
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
end; $function$
;

grant select on table "public"."stockai_nfe_documents" to "authenticated";

grant delete on table "public"."stockai_nfe_documents" to "service_role";

grant insert on table "public"."stockai_nfe_documents" to "service_role";

grant references on table "public"."stockai_nfe_documents" to "service_role";

grant select on table "public"."stockai_nfe_documents" to "service_role";

grant trigger on table "public"."stockai_nfe_documents" to "service_role";

grant truncate on table "public"."stockai_nfe_documents" to "service_role";

grant update on table "public"."stockai_nfe_documents" to "service_role";


  create policy "stockai_nfe_read"
  on "public"."stockai_nfe_documents"
  as permissive
  for select
  to authenticated
using (stockai_private.can_access(org_id, unit_id, ARRAY['owner'::text, 'manager'::text, 'unit_manager'::text, 'implementer'::text]));


CREATE TRIGGER stockai_nfe_immutable BEFORE DELETE OR UPDATE ON public.stockai_nfe_documents FOR EACH ROW EXECUTE FUNCTION stockai_private.immutable_record();



-- Explicit privileges: shared projects may grant broad defaults on new public objects.
revoke all on public.stockai_nfe_documents from public, anon, authenticated;
grant select on public.stockai_nfe_documents to authenticated;
revoke all on function stockai_private.import_nfe(uuid,uuid,text,jsonb,jsonb),public.stockai_import_nfe(uuid,uuid,text,jsonb,jsonb) from public,anon;
grant execute on function stockai_private.import_nfe(uuid,uuid,text,jsonb,jsonb),public.stockai_import_nfe(uuid,uuid,text,jsonb,jsonb) to authenticated;
commit;
