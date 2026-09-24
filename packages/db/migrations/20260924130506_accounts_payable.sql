begin;
create table public.stockai_payables (
 id uuid primary key default gen_random_uuid(), org_id uuid not null references public.stockai_orgs(id), unit_id uuid not null,
 supplier_id uuid, creditor_name text not null check(length(trim(creditor_name)) between 1 and 200),
 source text not null check(source in ('xml','receipt','manual')), source_key text not null,
 receipt_id uuid unique, inbox_id uuid references public.stockai_xml_inbox(id),
 description text not null check(length(trim(description)) between 1 and 200), document_number text, issued_on date,
 total_cents bigint not null check(total_cents between 0 and 99999999999999),
 notes text not null default '' check(length(notes)<=4000), review_note text,
 cancelled boolean not null default false, revision integer not null default 1,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(org_id,source_key), unique(org_id,id),
 foreign key(org_id,unit_id) references public.stockai_units(org_id,id),
 foreign key(org_id,supplier_id) references public.stockai_suppliers(org_id,id),
 foreign key(org_id,receipt_id) references public.stockai_receipts(org_id,id)
);
create index stockai_payables_unit on public.stockai_payables(org_id,unit_id,created_at desc);
create index stockai_payables_supplier on public.stockai_payables(org_id,supplier_id);
create index stockai_payables_inbox on public.stockai_payables(inbox_id);
create table public.stockai_payable_installments (
 id uuid primary key default gen_random_uuid(), org_id uuid not null, payable_id uuid not null,
 sequence integer not null check(sequence between 1 and 120), amount_cents bigint not null check(amount_cents between 0 and 99999999999999),
 due_on date, paid_on date, unique(payable_id,sequence),
 foreign key(org_id,payable_id) references public.stockai_payables(org_id,id)
);
create index stockai_installments_org on public.stockai_payable_installments(org_id,payable_id);
create index stockai_installments_due on public.stockai_payable_installments(due_on) where paid_on is null;
create table public.stockai_payable_events (
 id uuid primary key default gen_random_uuid(), org_id uuid not null, payable_id uuid not null,
 actor_id uuid references auth.users(id), kind text not null, before_data jsonb, after_data jsonb not null,
 created_at timestamptz not null default now(), foreign key(org_id,payable_id) references public.stockai_payables(org_id,id)
);
create index stockai_payable_events_bill on public.stockai_payable_events(org_id,payable_id,created_at desc);
create index stockai_payable_events_actor on public.stockai_payable_events(actor_id);
alter table public.stockai_payables enable row level security;
alter table public.stockai_payable_installments enable row level security;
alter table public.stockai_payable_events enable row level security;
create policy payables_read on public.stockai_payables for select to authenticated using(stockai_private.can_access(org_id,unit_id,array['owner','manager','unit_manager','implementer']));
create policy installments_read on public.stockai_payable_installments for select to authenticated using(exists(select 1 from public.stockai_payables p where p.id=payable_id));
create policy payable_events_read on public.stockai_payable_events for select to authenticated using(exists(select 1 from public.stockai_payables p where p.id=payable_id));
revoke all on public.stockai_payables,public.stockai_payable_installments,public.stockai_payable_events from public,anon,authenticated;
grant select on public.stockai_payables,public.stockai_payable_installments,public.stockai_payable_events to authenticated;
create trigger payable_events_immutable before update or delete on public.stockai_payable_events for each row execute function stockai_private.immutable_record();

-- Internal transactional synchronization. No stock is posted by this function.
create function stockai_private.sync_payable(p_receipt uuid default null,p_inbox uuid default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare r public.stockai_receipts; e public.stockai_xml_inbox; b public.stockai_payables;
 v_org uuid;v_unit uuid;v_supplier uuid;v_name text;v_number text;v_total bigint;v_issued date;v_key text;v_source text;v_xml text;d xml;
 ns text[][]:=array[array['n','http://www.portalfiscal.inf.br/nfe']]; v_tax text;v_dest text;v_access text;v_plan jsonb:='[]';v_review text;v_id uuid;v_before jsonb;v_after jsonb; x record;
begin
 if p_inbox is not null then
 select * into e from public.stockai_xml_inbox where id=p_inbox;
 if e.id is null or e.unit_id is null then return null;end if;
 p_receipt:=coalesce(p_receipt,e.receipt_id);
 end if;
 if p_receipt is not null then
 select * into r from public.stockai_receipts where id=p_receipt;
 if r.id is null then return null;end if;
 v_org:=r.org_id;v_unit:=r.unit_id;v_supplier:=r.supplier_id;v_number:=r.invoice_number;
 select name into v_name from public.stockai_suppliers where id=r.supplier_id;
 v_total:=coalesce(r.invoice_total_cents,(select coalesce(sum(coalesce(fiscal_total_cents,round(invoiced_qty*unit_price_cents))),0)::bigint from public.stockai_receipt_lines where receipt_id=r.id and is_active));
 v_issued:=(coalesce(r.issued_at,r.created_at) at time zone 'America/Sao_Paulo')::date;
 v_source:=case when r.access_key is not null then 'xml' else 'receipt' end;
 v_key:=case when r.access_key is not null then 'xml:'||r.access_key else 'receipt:'||r.id end;
 select raw_xml into v_xml from public.stockai_nfe_documents where receipt_id=r.id;
 else
 v_org:=e.org_id;v_unit:=e.unit_id;v_source:='xml';
 end if;
 v_xml:=coalesce(v_xml,e.raw_xml);
 if v_xml is not null then
 begin
 d:=xmlparse(document v_xml);
 v_access:=replace((xpath('/n:nfeProc/n:NFe/n:infNFe/@Id',d,ns))[1]::text,'NFe','');
 v_dest:=(xpath('/n:nfeProc/n:NFe/n:infNFe/n:dest/n:CNPJ/text()',d,ns))[1]::text;
 if r.id is null then
 -- Pending product identification is allowed; unauthorised/mismatched XML is not.
 if v_access is null or v_access !~ '^[0-9]{44}$' or (xpath('/n:nfeProc/n:protNFe/n:infProt/n:chNFe/text()',d,ns))[1]::text is distinct from v_access or coalesce((xpath('/n:nfeProc/n:protNFe/n:infProt/n:cStat/text()',d,ns))[1]::text,'') not in ('100','150') or v_dest is distinct from (select tax_id from public.stockai_units where id=v_unit and org_id=v_org) then return null;end if;
 v_key:='xml:'||v_access;
 v_number:=(xpath('/n:nfeProc/n:NFe/n:infNFe/n:ide/n:nNF/text()',d,ns))[1]::text;
 v_total:=round(((xpath('/n:nfeProc/n:NFe/n:infNFe/n:total/n:ICMSTot/n:vNF/text()',d,ns))[1]::text)::numeric*100)::bigint;
 v_issued:=left((xpath('/n:nfeProc/n:NFe/n:infNFe/n:ide/n:dhEmi/text()',d,ns))[1]::text,10)::date;
 v_tax:=(xpath('/n:nfeProc/n:NFe/n:infNFe/n:emit/n:CNPJ/text()',d,ns))[1]::text;
 select id,name into v_supplier,v_name from public.stockai_suppliers where org_id=v_org and tax_id=v_tax;
 v_name:=coalesce(v_name,(xpath('/n:nfeProc/n:NFe/n:infNFe/n:emit/n:xNome/text()',d,ns))[1]::text);
 end if;
 for x in select * from xmltable(xmlnamespaces('http://www.portalfiscal.inf.br/nfe' as n),'/n:nfeProc/n:NFe/n:infNFe/n:cobr/n:dup' passing d columns due text path 'n:dVenc',amount text path 'n:vDup') loop
 v_plan:=v_plan||jsonb_build_array(jsonb_build_object('due_on',nullif(x.due,'')::date,'amount_cents',round(x.amount::numeric*100)::bigint));
 end loop;
 exception when invalid_xml_document or invalid_text_representation or invalid_datetime_format or datetime_field_overflow or numeric_value_out_of_range then
 v_plan:='[]';v_review:='Confira os dados de cobrança do XML.';
 end;
 end if;
 if v_total is null or v_total<0 or v_name is null or v_key is null then return null;end if;
 if r.id is null and v_supplier is null and v_tax ~ '^[A-Z0-9]{12}[0-9]{2}$' and length(trim(v_name)) between 1 and 120 then
 insert into public.stockai_suppliers(org_id,name,tax_id) values(v_org,trim(v_name),v_tax)
 on conflict(org_id,name) do update set tax_id=excluded.tax_id where stockai_suppliers.tax_id is null or stockai_suppliers.tax_id=excluded.tax_id returning id into v_supplier;
 if v_supplier is null then v_review:='Existe um fornecedor com esse nome e outro CNPJ. Revise o cadastro.';end if;
 end if;

 if jsonb_array_length(v_plan)=0 or jsonb_array_length(v_plan)>120 or exists(select 1 from jsonb_array_elements(v_plan) j(value) where (j.value->>'amount_cents') is null or (j.value->>'amount_cents')::bigint<0) or (select sum((j.value->>'amount_cents')::bigint) from jsonb_array_elements(v_plan) j(value)) is distinct from v_total then
 if jsonb_array_length(v_plan)>0 then v_review:='As parcelas do XML não correspondem ao total da nota. Revise a cobrança.';end if;
 v_plan:=jsonb_build_array(jsonb_build_object('due_on',null,'amount_cents',v_total));
 end if;
 perform pg_advisory_xact_lock(hashtextextended(v_org::text||v_key,0));
 select * into b from public.stockai_payables where org_id=v_org and (source_key=v_key or receipt_id=p_receipt) for update;
 if b.id is null then
 insert into public.stockai_payables(org_id,unit_id,supplier_id,creditor_name,source,source_key,receipt_id,inbox_id,description,document_number,issued_on,total_cents,review_note)
 values(v_org,v_unit,v_supplier,v_name,v_source,v_key,p_receipt,p_inbox,'Nota '||coalesce(v_number,'sem número'),v_number,v_issued,v_total,v_review) returning id into v_id;
 insert into public.stockai_payable_installments(org_id,payable_id,sequence,amount_cents,due_on)
 select v_org,v_id,ordinality,(value->>'amount_cents')::bigint,(value->>'due_on')::date from jsonb_array_elements(v_plan) with ordinality;
 insert into public.stockai_payable_events(org_id,payable_id,actor_id,kind,after_data) values(v_org,v_id,auth.uid(),'created_from_document',jsonb_build_object('total_cents',v_total,'installments',v_plan));
 else
 v_id:=b.id;
 if (b.unit_id,b.supplier_id,b.creditor_name,b.document_number,b.issued_on,b.total_cents,b.receipt_id) is distinct from (v_unit,v_supplier,v_name,v_number,v_issued,v_total,coalesce(p_receipt,b.receipt_id)) then
 v_before:=to_jsonb(b);
 update public.stockai_payables set unit_id=v_unit,supplier_id=v_supplier,creditor_name=v_name,document_number=v_number,issued_on=v_issued,total_cents=v_total,receipt_id=coalesce(p_receipt,receipt_id),inbox_id=coalesce(inbox_id,p_inbox),
 review_note=case when (b.total_cents,b.unit_id,b.supplier_id) is distinct from (v_total,v_unit,v_supplier) then 'A nota foi alterada. Revise as parcelas e os pagamentos registrados.' else review_note end,revision=revision+1,updated_at=now() where id=v_id returning to_jsonb(stockai_payables.*) into v_after;
 insert into public.stockai_payable_events(org_id,payable_id,actor_id,kind,before_data,after_data) values(v_org,v_id,auth.uid(),'document_updated',v_before,v_after);
 end if;
 end if;
 return v_id;
end $$;

-- Deferred triggers see all lines and the original XML after an import/edit finishes.
create function stockai_private.sync_payable_trigger() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_table_name='stockai_xml_inbox' then perform stockai_private.sync_payable(null,new.id);
 elsif tg_table_name='stockai_receipts' then perform stockai_private.sync_payable(new.id,null);
 else perform stockai_private.sync_payable(new.receipt_id,null);end if;
 return null;
end $$;
create constraint trigger receipts_payable after insert or update on public.stockai_receipts deferrable initially deferred for each row execute function stockai_private.sync_payable_trigger();
create constraint trigger lines_payable after insert or update on public.stockai_receipt_lines deferrable initially deferred for each row execute function stockai_private.sync_payable_trigger();
create constraint trigger xml_document_payable after insert on public.stockai_nfe_documents deferrable initially deferred for each row execute function stockai_private.sync_payable_trigger();
create constraint trigger inbox_payable after insert or update on public.stockai_xml_inbox deferrable initially deferred for each row execute function stockai_private.sync_payable_trigger();

create function stockai_private.save_payable(p_id uuid,p_revision integer,p_request uuid,p_data jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare b public.stockai_payables;v_org uuid;v_unit uuid;v_supplier uuid;v_name text;v_id uuid;v_total bigint;v_plan jsonb:=p_data->'installments';v_before jsonb;v_after jsonb;x jsonb;v_sequence integer:=0;v_cancel boolean:=coalesce((p_data->>'cancelled')::boolean,false);v_desc text:=trim(p_data->>'description');v_notes text:=coalesce(p_data->>'notes','');
begin
 if auth.uid() is null then raise exception 'Entre novamente.' using errcode='42501';end if;
 v_unit:=(p_data->>'unit_id')::uuid;
 select org_id into v_org from public.stockai_units where id=v_unit;
 if v_org is null or not stockai_private.can_access(v_org,v_unit,array['owner','manager','unit_manager','implementer']) then raise exception 'Sem permissão nesta empresa.' using errcode='42501';end if;
 if p_id is not null then
 select * into b from public.stockai_payables where id=p_id for update;
 if b.id is null or b.org_id<>v_org or not stockai_private.can_access(b.org_id,b.unit_id,array['owner','manager','unit_manager','implementer']) then raise exception 'Sem permissão nesta conta.' using errcode='42501';end if;
 if p_revision is distinct from b.revision then raise exception 'A conta foi alterada. Recarregue antes de salvar.' using errcode='40001';end if;
 if b.source<>'manual' and v_unit<>b.unit_id then raise exception 'Altere a empresa na nota de origem.' using errcode='22023';end if;
 else
 if p_request is null then raise exception 'Identificador obrigatório.' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended(v_org::text||p_request::text,0));
 select id into v_id from public.stockai_payables where org_id=v_org and source_key='manual:'||p_request;
 if v_id is not null then return v_id;end if;
 end if;
 if jsonb_typeof(v_plan) is distinct from 'array' or jsonb_array_length(v_plan) not between 1 and 120 or length(coalesce(v_desc,'')) not between 1 and 200 or length(v_notes)>4000 then raise exception 'Confira descrição e parcelas.' using errcode='22023';end if;
 v_total:=0;
 for x in select value from jsonb_array_elements(v_plan) loop
 if jsonb_typeof(x->'amount_cents') is distinct from 'number' or (x->>'amount_cents')::numeric<0 or (x->>'amount_cents')::numeric>99999999999999 or (x->>'amount_cents')::numeric<>trunc((x->>'amount_cents')::numeric) then raise exception 'Valor de parcela inválido.' using errcode='22023';end if;
 if nullif(x->>'paid_on','')::date>(now() at time zone 'America/Sao_Paulo')::date then raise exception 'Pagamento não pode estar no futuro.' using errcode='22023';end if;
 v_total:=v_total+(x->>'amount_cents')::bigint;
 end loop;
 if b.id is not null and b.source<>'manual' and v_total<>b.total_cents then raise exception 'A soma das parcelas deve ser igual ao total da nota.' using errcode='22023';end if;
 if v_cancel and length(trim(v_notes))<3 then raise exception 'Informe o motivo do cancelamento nas observações.' using errcode='22023';end if;
 if v_cancel and exists(select 1 from jsonb_array_elements(v_plan) j(value) where nullif(j.value->>'paid_on','') is not null) then raise exception 'Uma conta com pagamento registrado não pode ser cancelada. Revise a baixa primeiro.' using errcode='22023';end if;
 if b.id is not null and b.source<>'manual' then v_supplier:=b.supplier_id;v_name:=b.creditor_name;
 else
 v_supplier:=nullif(p_data->>'supplier_id','')::uuid;
 if v_supplier is not null then select name into v_name from public.stockai_suppliers where id=v_supplier and org_id=v_org;
 else v_name:=nullif(trim(p_data->>'creditor_name'),'');end if;
 if v_name is null or length(v_name)>120 then raise exception 'Informe o fornecedor ou favorecido com até 120 caracteres, mesmo sem CNPJ.' using errcode='22023';end if;
 if v_supplier is null then
 insert into public.stockai_suppliers(org_id,name) values(v_org,v_name) on conflict(org_id,name) do update set name=excluded.name returning id into v_supplier;
 end if;
 end if;
 if b.id is null then
 insert into public.stockai_payables(org_id,unit_id,supplier_id,creditor_name,source,source_key,description,issued_on,total_cents,notes,cancelled)
 values(v_org,v_unit,v_supplier,v_name,'manual','manual:'||p_request,v_desc,nullif(p_data->>'issued_on','')::date,v_total,v_notes,v_cancel) returning id into v_id;
 else
 v_id:=b.id;v_before:=jsonb_build_object('bill',to_jsonb(b),'installments',(select jsonb_agg(to_jsonb(i)) from public.stockai_payable_installments i where payable_id=b.id));
 update public.stockai_payables set unit_id=v_unit,supplier_id=v_supplier,creditor_name=v_name,description=v_desc,issued_on=case when source='manual' then nullif(p_data->>'issued_on','')::date else issued_on end,total_cents=v_total,notes=v_notes,cancelled=v_cancel,review_note=null,revision=revision+1,updated_at=now() where id=v_id;
 delete from public.stockai_payable_installments where payable_id=v_id;
 end if;
 for x in select value from jsonb_array_elements(v_plan) loop
 v_sequence:=v_sequence+1;
 insert into public.stockai_payable_installments(org_id,payable_id,sequence,amount_cents,due_on,paid_on) values(v_org,v_id,v_sequence,(x->>'amount_cents')::bigint,nullif(x->>'due_on','')::date,nullif(x->>'paid_on','')::date);
 end loop;
 v_after:=jsonb_build_object('bill',(select to_jsonb(p) from public.stockai_payables p where id=v_id),'installments',v_plan);
 insert into public.stockai_payable_events(org_id,payable_id,actor_id,kind,before_data,after_data) values(v_org,v_id,auth.uid(),case when b.id is null then 'manual_created' else 'edited' end,v_before,v_after);
 return v_id;
end $$;
create function public.stockai_save_payable(p_id uuid default null,p_revision integer default null,p_request uuid default null,p_data jsonb default '{}') returns uuid language sql security invoker set search_path='' as $$select stockai_private.save_payable(p_id,p_revision,p_request,p_data);$$;
revoke all on function stockai_private.sync_payable(uuid,uuid),stockai_private.sync_payable_trigger(),stockai_private.save_payable(uuid,integer,uuid,jsonb),public.stockai_save_payable(uuid,integer,uuid,jsonb) from public,anon,authenticated;
grant execute on function stockai_private.save_payable(uuid,integer,uuid,jsonb),public.stockai_save_payable(uuid,integer,uuid,jsonb) to authenticated;
-- Backfill known, valid documents. Existing records are idempotently reused.
select stockai_private.sync_payable(id,null) from public.stockai_receipts;
select stockai_private.sync_payable(null,id) from public.stockai_xml_inbox where unit_id is not null;
commit;
