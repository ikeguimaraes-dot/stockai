create function stockai_private.rename_product(p_item uuid,p_name text,p_expected text)
returns void language plpgsql security definer set search_path='' as $$
declare r public.stockai_items;
begin
 select * into r from public.stockai_items where id=p_item for update;
 if auth.uid() is null or r.id is null or not stockai_private.can_manage_catalog(r.org_id) then raise exception 'Sem permissão para editar este produto.' using errcode='42501';end if;
 if r.name is distinct from p_expected then raise exception 'O nome mudou. Atualize a página.' using errcode='40001';end if;
 if length(trim(coalesce(p_name,''))) not between 1 and 120 then raise exception 'Informe um nome de até 120 caracteres.' using errcode='22023';end if;
 update public.stockai_items set name=trim(p_name) where id=r.id;
end $$;
create function public.stockai_rename_product(p_item uuid,p_name text,p_expected text)
returns void language sql security invoker set search_path='' as $$ select stockai_private.rename_product(p_item,p_name,p_expected); $$;
revoke all on function stockai_private.rename_product(uuid,text,text),public.stockai_rename_product(uuid,text,text) from public,anon;
grant execute on function stockai_private.rename_product(uuid,text,text),public.stockai_rename_product(uuid,text,text) to authenticated;

create function stockai_private.relink_product(p_link uuid,p_target uuid,p_factor numeric,p_expected timestamptz)
returns void language plpgsql security definer set search_path='' as $$
declare t public.stockai_items; l public.stockai_product_links;
begin
 select * into t from public.stockai_items where id=p_target;
 if auth.uid() is null or t.id is null or not stockai_private.can_manage_catalog(t.org_id) then raise exception 'Sem permissão para vincular este produto.' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended(t.org_id::text,0));
 select * into l from public.stockai_product_links where id=p_link for update;
 if l.id is null or l.org_id<>t.org_id then raise exception 'Vínculo não pertence a este grupo.' using errcode='42501';end if;
 if l.updated_at is distinct from p_expected then raise exception 'O vínculo mudou. Atualize a página.' using errcode='40001';end if;
 if not t.is_active or p_factor is null or p_factor<=0 or p_factor>=1000000000000 or p_factor::text in ('NaN','Infinity','-Infinity') or round(p_factor,6)<>p_factor then raise exception 'Informe uma conversão positiva com até 6 casas decimais para um produto ativo.' using errcode='22023';end if;
 update public.stockai_product_links set item_id=t.id,factor=p_factor,updated_by=auth.uid(),updated_at=clock_timestamp() where id=l.id;
end $$;
create function public.stockai_relink_product(p_link uuid,p_target uuid,p_factor numeric,p_expected timestamptz)
returns void language sql security invoker set search_path='' as $$ select stockai_private.relink_product(p_link,p_target,p_factor,p_expected); $$;
revoke all on function stockai_private.relink_product(uuid,uuid,numeric,timestamptz),public.stockai_relink_product(uuid,uuid,numeric,timestamptz) from public,anon;
grant execute on function stockai_private.relink_product(uuid,uuid,numeric,timestamptz),public.stockai_relink_product(uuid,uuid,numeric,timestamptz) to authenticated;
