create function stockai_private.assign_product_code(p_item uuid,p_code text,p_expected text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.stockai_items; t public.stockai_items; n integer;
begin
 select * into r from public.stockai_items where id=p_item;
 if auth.uid() is null or r.id is null or not stockai_private.can_manage_catalog(r.org_id) then
 raise exception 'Seu acesso não permite alterar este produto.' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended(r.org_id::text,0));
 select * into r from public.stockai_items where id=p_item for update;
 if r.internal_code is distinct from p_expected then raise exception 'O código mudou. Atualize a página.' using errcode='40001';end if;
 if length(trim(coalesce(p_code,''))) not between 1 and 60 then raise exception 'Informe um código de até 60 caracteres.' using errcode='22023';end if;
 select * into t from public.stockai_items where org_id=r.org_id and upper(trim(internal_code))=upper(trim(p_code)) for update;
 if t.id is null or t.id=r.id then
 update public.stockai_items set internal_code=trim(p_code) where id=r.id;
 return jsonb_build_object('linked',false,'item_id',r.id,'code',trim(p_code),'name',r.name);
 end if;
 if not t.is_active then raise exception 'O código pertence a um produto inativo.' using errcode='22023';end if;
 if r.base_uom<>t.base_uom then raise exception 'As unidades são diferentes. Use Vincular a existente para informar a conversão.' using errcode='22023';end if;
 update public.stockai_product_links set item_id=t.id,updated_at=clock_timestamp(),updated_by=auth.uid() where org_id=r.org_id and item_id=r.id;
 get diagnostics n=row_count;
 if n=0 then raise exception 'Este cadastro não possui vínculos de fornecedor para transferir. Abra o cadastro do produto para conferir.' using errcode='22023';end if;
 return jsonb_build_object('linked',true,'item_id',t.id,'code',t.internal_code,'name',t.name,'links',n);
end $$;
create function public.stockai_assign_product_code(p_item uuid,p_code text,p_expected text)
returns jsonb language sql security invoker set search_path='' as $$select stockai_private.assign_product_code(p_item,p_code,p_expected);$$;
create or replace function stockai_private.update_internal_code(p_item uuid,p_code text,p_expected text)
returns void language plpgsql security invoker set search_path='' as $$begin perform stockai_private.assign_product_code(p_item,p_code,p_expected);end$$;
revoke all on function stockai_private.assign_product_code(uuid,text,text),public.stockai_assign_product_code(uuid,text,text) from public,anon;
grant execute on function stockai_private.assign_product_code(uuid,text,text),public.stockai_assign_product_code(uuid,text,text) to authenticated;

create or replace function stockai_private.save_product_code(p_org uuid,p_name text,p_uom text,p_code text,p_category uuid,p_cmv boolean,p_id uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid; old_code text; assigned jsonb;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_org::text,0));
 v_id:=stockai_private.save_product(p_org,p_name,p_uom,p_category,p_cmv,p_id);
 if length(trim(coalesce(p_code,''))) not between 1 and 60 then raise exception 'Informe seu código interno do produto.' using errcode='22023';end if;
 if p_id is null then
 update public.stockai_items set internal_code=trim(p_code) where id=v_id;
 return v_id;
 end if;
 select internal_code into old_code from public.stockai_items where id=v_id;
 assigned:=stockai_private.assign_product_code(v_id,p_code,old_code);
 return (assigned->>'item_id')::uuid;
end $$;
