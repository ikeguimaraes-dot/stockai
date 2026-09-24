create function public.stockai_update_internal_code(p_item uuid,p_code text,p_expected text)
returns void language plpgsql security definer set search_path='' as $$
declare r public.stockai_items;
begin
 select * into r from public.stockai_items where id=p_item for update;
 if auth.uid() is null or r.id is null or not stockai_private.can_manage_catalog(r.org_id) then
   raise exception 'Seu acesso não permite alterar este produto.' using errcode='42501';
 end if;
 if r.internal_code is distinct from p_expected then raise exception 'O código foi alterado por outra pessoa. Atualize a página.' using errcode='40001';end if;
 if length(trim(coalesce(p_code,''))) not between 1 and 60 then raise exception 'Informe um código de até 60 caracteres.' using errcode='22023';end if;
 update public.stockai_items set internal_code=trim(p_code) where id=r.id;
end $$;
revoke all on function public.stockai_update_internal_code(uuid,text,text) from public,anon;
grant execute on function public.stockai_update_internal_code(uuid,text,text) to authenticated;
