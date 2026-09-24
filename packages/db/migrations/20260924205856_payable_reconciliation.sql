alter table public.stockai_payables add column merged_into_id uuid,add column import_references jsonb not null default '[]',add column reference_month text check(reference_month ~ '^20[0-9]{2}-(0[1-9]|1[0-2])$');
alter table public.stockai_payables add constraint stockai_payables_merged_fk foreign key(org_id,merged_into_id) references public.stockai_payables(org_id,id);
create index stockai_payables_merged on public.stockai_payables(org_id,merged_into_id) where merged_into_id is not null;
alter table public.stockai_payable_installments add column paid_without_date boolean not null default false;
create or replace function stockai_private.save_payable(p_id uuid,p_revision integer,p_request uuid,p_data jsonb)
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
 if b.merged_into_id is not null then raise exception 'Esta conta foi unificada com outra. Edite a conta de destino.' using errcode='22023';end if;
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
 if v_cancel and exists(select 1 from jsonb_array_elements(v_plan) j(value) where (nullif(j.value->>'paid_on','') is not null or coalesce((j.value->>'paid_without_date')::boolean,false))) then raise exception 'Uma conta com pagamento registrado não pode ser cancelada. Revise a baixa primeiro.' using errcode='22023';end if;
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
 insert into public.stockai_payable_installments(org_id,payable_id,sequence,amount_cents,due_on,paid_on,paid_without_date) values(v_org,v_id,v_sequence,(x->>'amount_cents')::bigint,nullif(x->>'due_on','')::date,nullif(x->>'paid_on','')::date,coalesce((x->>'paid_without_date')::boolean,false) and nullif(x->>'paid_on','') is null);
 end loop;
 if b.id is null or b.source='manual' then
 update public.stockai_payables set document_number=nullif(trim(p_data->>'document_number'),''),reference_month=nullif(p_data->>'reference_month','') where id=v_id;
 end if;
 v_after:=jsonb_build_object('bill',(select to_jsonb(p) from public.stockai_payables p where id=v_id),'installments',v_plan);
 insert into public.stockai_payable_events(org_id,payable_id,actor_id,kind,before_data,after_data) values(v_org,v_id,auth.uid(),case when b.id is null then 'manual_created' else 'edited' end,v_before,v_after);
 return v_id;
end $$;
create function stockai_private.link_payable(p_bill uuid,p_target uuid,p_revision integer,p_target_revision integer)
returns uuid language plpgsql security definer set search_path='' as $$
declare b public.stockai_payables;t public.stockai_payables;v_before jsonb;
begin
 if auth.uid() is null then raise exception 'Entre novamente.' using errcode='42501';end if;
 -- Deterministic lock order prevents competing links from deadlocking.
 perform 1 from public.stockai_payables where id in(p_bill,p_target) order by id for update;
 select * into b from public.stockai_payables where id=p_bill;
 select * into t from public.stockai_payables where id=p_target;
 if b.id is null or t.id is null or b.org_id<>t.org_id or b.unit_id<>t.unit_id or not stockai_private.can_access(b.org_id,b.unit_id,array['owner','manager','unit_manager','implementer']) then raise exception 'Escolha uma nota da mesma empresa com acesso permitido.' using errcode='42501';end if;
 if b.revision is distinct from p_revision or t.revision is distinct from p_target_revision then raise exception 'Uma das contas mudou. Recarregue antes de vincular.' using errcode='40001';end if;
 if b.id=t.id or b.source<>'manual' or b.cancelled or b.merged_into_id is not null or t.receipt_id is null or t.source='manual' or t.cancelled or t.merged_into_id is not null then raise exception 'Selecione uma despesa ativa e uma conta de nota válida.' using errcode='22023';end if;
 if b.total_cents<>t.total_cents then raise exception 'Os valores da despesa e da nota são diferentes. Confira as parcelas antes de vincular.' using errcode='22023';end if;
 if exists(select 1 from public.stockai_payable_installments where payable_id=t.id and (paid_on is not null or paid_without_date)) then raise exception 'A conta da nota já possui pagamentos. Confira a conciliação antes de unificar.' using errcode='22023';end if;
 if (select sum(amount_cents) from public.stockai_payable_installments where payable_id=b.id) is distinct from t.total_cents then raise exception 'Confira a soma das parcelas da despesa.' using errcode='22023';end if;
 v_before:=jsonb_build_object('bill',to_jsonb(t),'installments',(select jsonb_agg(to_jsonb(i)) from public.stockai_payable_installments i where payable_id=t.id));
 delete from public.stockai_payable_installments where payable_id=t.id;
 insert into public.stockai_payable_installments(org_id,payable_id,sequence,amount_cents,due_on,paid_on,paid_without_date)
 select org_id,t.id,sequence,amount_cents,due_on,paid_on,paid_without_date from public.stockai_payable_installments where payable_id=b.id;
 update public.stockai_payables set notes=left(concat_ws(E'\n',nullif(t.notes,''),'Despesa vinculada: '||b.description,nullif(b.notes,'')),4000),import_references=t.import_references||b.import_references,revision=revision+1,updated_at=now() where id=t.id;
 update public.stockai_payables set cancelled=true,merged_into_id=t.id,revision=revision+1,updated_at=now() where id=b.id;
 insert into public.stockai_payable_events(org_id,payable_id,actor_id,kind,before_data,after_data)
 values(t.org_id,t.id,auth.uid(),'expense_linked',v_before,jsonb_build_object('bill',(select to_jsonb(p) from public.stockai_payables p where id=t.id),'installments',(select jsonb_agg(to_jsonb(i)) from public.stockai_payable_installments i where payable_id=t.id),'source_bill',b.id)),
 (b.org_id,b.id,auth.uid(),'merged_into_invoice',to_jsonb(b),jsonb_build_object('target_bill',t.id,'receipt_id',t.receipt_id));
 return t.id;
end $$;
create function public.stockai_link_payable(p_bill uuid,p_target uuid,p_revision integer,p_target_revision integer)
returns uuid language sql security invoker set search_path='' as $$ select stockai_private.link_payable(p_bill,p_target,p_revision,p_target_revision); $$;
revoke all on function stockai_private.link_payable(uuid,uuid,integer,integer),public.stockai_link_payable(uuid,uuid,integer,integer) from public,anon;
grant execute on function stockai_private.link_payable(uuid,uuid,integer,integer),public.stockai_link_payable(uuid,uuid,integer,integer) to authenticated;

create table public.stockai_payable_import_rows(
 id uuid primary key default gen_random_uuid(),org_id uuid not null references public.stockai_orgs(id),unit_id uuid,
 source_fingerprint text not null, file_name text not null,sheet_name text not null,row_number integer not null,
 source_data jsonb not null, proposed_data jsonb not null default '{}',reason text,
 state text not null default 'pending' check(state in ('pending','matched','imported','ignored')),
 payable_id uuid,created_at timestamptz not null default now(),resolved_at timestamptz,resolved_by uuid references auth.users(id),
 unique(org_id,source_fingerprint),foreign key(org_id,unit_id) references public.stockai_units(org_id,id),foreign key(org_id,payable_id) references public.stockai_payables(org_id,id)
);
create index stockai_payable_import_state on public.stockai_payable_import_rows(org_id,unit_id,state);
create index stockai_payable_import_bill on public.stockai_payable_import_rows(org_id,payable_id);
create index stockai_payable_import_actor on public.stockai_payable_import_rows(resolved_by);
alter table public.stockai_payable_import_rows enable row level security;
create policy payable_import_read on public.stockai_payable_import_rows for select to authenticated using(stockai_private.can_access(org_id,unit_id,array['owner','manager','unit_manager','implementer']));
revoke all on public.stockai_payable_import_rows from public,anon,authenticated;
grant select on public.stockai_payable_import_rows to authenticated;
create function stockai_private.resolve_payable_import(p_row uuid,p_data jsonb,p_existing uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare r public.stockai_payable_import_rows;v_org uuid;v_unit uuid;v_id uuid;
begin
 select * into r from public.stockai_payable_import_rows where id=p_row for update;
 if auth.uid() is null or r.id is null or not stockai_private.can_access(r.org_id,r.unit_id,array['owner','manager','unit_manager','implementer']) then raise exception 'Sem permissão para identificar esta despesa.' using errcode='42501';end if;
 if r.state<>'pending' then return r.payable_id;end if;
 v_unit:=nullif(p_data->>'unit_id','')::uuid;
 select org_id into v_org from public.stockai_units where id=v_unit;
 if v_org is distinct from r.org_id or not stockai_private.can_access(v_org,v_unit,array['owner','manager','unit_manager','implementer']) then raise exception 'Escolha uma empresa deste grupo.' using errcode='42501';end if;
 if p_existing is not null then
 select id into v_id from public.stockai_payables where id=p_existing and org_id=r.org_id and unit_id=v_unit and not cancelled and merged_into_id is null for update;
 if v_id is null then raise exception 'Escolha uma conta ativa da empresa selecionada.' using errcode='22023';end if;
 else v_id:=stockai_private.save_payable(null,0,r.id,p_data);end if;
 update public.stockai_payables set import_references=import_references||jsonb_build_array(jsonb_build_object('file',r.file_name,'sheet',r.sheet_name,'row',r.row_number,'source',r.source_data)) where id=v_id;
 update public.stockai_payable_import_rows set state=case when p_existing is null then 'imported' else 'matched' end,unit_id=v_unit,payable_id=v_id,resolved_at=now(),resolved_by=auth.uid() where id=r.id;
 insert into public.stockai_payable_events(org_id,payable_id,actor_id,kind,after_data) values(r.org_id,v_id,auth.uid(),'spreadsheet_import',jsonb_build_object('file',r.file_name,'sheet',r.sheet_name,'row',r.row_number,'source',r.source_data,'bill',(select to_jsonb(b) from public.stockai_payables b where id=v_id)));
 return v_id;
end $$;
create function public.stockai_resolve_payable_import(p_row uuid,p_data jsonb,p_existing uuid default null)
returns uuid language sql security invoker set search_path='' as $$ select stockai_private.resolve_payable_import(p_row,p_data,p_existing); $$;
revoke all on function stockai_private.resolve_payable_import(uuid,jsonb,uuid),public.stockai_resolve_payable_import(uuid,jsonb,uuid) from public,anon;
grant execute on function stockai_private.resolve_payable_import(uuid,jsonb,uuid),public.stockai_resolve_payable_import(uuid,jsonb,uuid) to authenticated;
