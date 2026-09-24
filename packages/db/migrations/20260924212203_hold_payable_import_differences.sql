alter table public.stockai_payables add column on_hold boolean not null default false;
create or replace function stockai_private.resolve_payable_import(p_row uuid,p_data jsonb,p_existing uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare r public.stockai_payable_import_rows;v_org uuid;v_unit uuid;v_id uuid;b public.stockai_payables;
begin
 select * into r from public.stockai_payable_import_rows where id=p_row for update;
 if auth.uid() is null or r.id is null or not stockai_private.can_access(r.org_id,r.unit_id,array['owner','manager','unit_manager','implementer']) then raise exception 'Sem permissão para identificar esta despesa.' using errcode='42501';end if;
 if r.state<>'pending' then return r.payable_id;end if;
 v_unit:=nullif(p_data->>'unit_id','')::uuid;
 select org_id into v_org from public.stockai_units where id=v_unit;
 if v_org is distinct from r.org_id or not stockai_private.can_access(v_org,v_unit,array['owner','manager','unit_manager','implementer']) then raise exception 'Escolha uma empresa deste grupo.' using errcode='42501';end if;
 if p_existing is not null then
 select id into v_id from public.stockai_payables where id=p_existing and org_id=r.org_id and unit_id=v_unit and not cancelled and not on_hold and merged_into_id is null for update;
 if v_id is null then raise exception 'Escolha uma conta ativa da empresa selecionada.' using errcode='22023';end if;
 else
 if r.payable_id is not null then
 select * into b from public.stockai_payables where id=r.payable_id and org_id=r.org_id and on_hold and source='manual' for update;
 if b.id is null then raise exception 'A conta já foi identificada. Atualize a página.' using errcode='40001';end if;
 v_id:=stockai_private.save_payable(b.id,b.revision,r.id,p_data);
 else v_id:=stockai_private.save_payable(null,0,r.id,p_data);end if;
 end if;
 update public.stockai_payables set on_hold=false,import_references=import_references||jsonb_build_array(jsonb_build_object('file',r.file_name,'sheet',r.sheet_name,'row',r.row_number,'source',r.source_data)) where id=v_id;
 update public.stockai_payable_import_rows set state=case when p_existing is null then 'imported' else 'matched' end,unit_id=v_unit,payable_id=v_id,resolved_at=now(),resolved_by=auth.uid() where id=r.id;
 insert into public.stockai_payable_events(org_id,payable_id,actor_id,kind,after_data) values(r.org_id,v_id,auth.uid(),'spreadsheet_import',jsonb_build_object('file',r.file_name,'sheet',r.sheet_name,'row',r.row_number,'source',r.source_data,'bill',(select to_jsonb(b) from public.stockai_payables b where id=v_id)));
 return v_id;
end $$;
create or replace function stockai_private.link_payable(p_bill uuid,p_target uuid,p_revision integer,p_target_revision integer)
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
 if b.on_hold or t.on_hold or b.id=t.id or b.source<>'manual' or b.cancelled or b.merged_into_id is not null or t.receipt_id is null or t.source='manual' or t.cancelled or t.merged_into_id is not null then raise exception 'Selecione uma despesa ativa e uma conta de nota válida.' using errcode='22023';end if;
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
