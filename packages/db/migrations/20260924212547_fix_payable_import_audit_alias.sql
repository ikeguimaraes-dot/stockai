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
 insert into public.stockai_payable_events(org_id,payable_id,actor_id,kind,after_data) values(r.org_id,v_id,auth.uid(),'spreadsheet_import',jsonb_build_object('file',r.file_name,'sheet',r.sheet_name,'row',r.row_number,'source',r.source_data,'bill',(select to_jsonb(saved_bill) from public.stockai_payables saved_bill where saved_bill.id=v_id)));
 return v_id;
end $$;
