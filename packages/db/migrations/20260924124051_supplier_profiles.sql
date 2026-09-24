begin;
alter table public.stockai_suppliers
 add column legal_name text,
 add column contact_name text,
 add column email text,
 add column phone text,
 add column address text,
 add column notes text,
 add column revision integer not null default 1;
create function stockai_private.save_supplier(p_org uuid, p_data jsonb, p_id uuid default null, p_revision integer default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid; v_name text:=nullif(trim(p_data->>'name'),''); v_tax text:=nullif(upper(regexp_replace(p_data->>'tax_id','[. /-]','','g')),''); v_key text;
begin
 if not stockai_private.can_manage_catalog(p_org) then raise exception 'Sem permissão para gerenciar fornecedores.' using errcode='42501'; end if;
 if v_name is null or length(v_name)>120 then raise exception 'Informe o nome do fornecedor (até 120 caracteres).' using errcode='22023'; end if;
 if v_tax is not null and v_tax !~ '^[A-Z0-9]{12}[0-9]{2}$' then raise exception 'Informe um CNPJ com 14 caracteres ou deixe em branco.' using errcode='22023'; end if;
 foreach v_key in array array['legal_name','contact_name','email','phone','address','notes'] loop
 if length(p_data->>v_key)>(case when v_key='notes' then 4000 when v_key='address' then 500 else 200 end) then raise exception 'Um dos campos ultrapassou o limite permitido.' using errcode='22023'; end if;
 end loop;
 if nullif(trim(p_data->>'email'),'') is not null and trim(p_data->>'email') !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' then raise exception 'Informe um e-mail válido.' using errcode='22023';end if;
 if p_id is null then
 insert into public.stockai_suppliers(org_id,name,tax_id,legal_name,contact_name,email,phone,address,notes)
 values(p_org,v_name,v_tax,nullif(trim(p_data->>'legal_name'),''),nullif(trim(p_data->>'contact_name'),''),nullif(trim(p_data->>'email'),''),nullif(trim(p_data->>'phone'),''),nullif(trim(p_data->>'address'),''),nullif(trim(p_data->>'notes'),'')) returning id into v_id;
 else
 if not exists(select 1 from public.stockai_suppliers where org_id=p_org and id=p_id) then raise exception 'Fornecedor não encontrado.' using errcode='42501';end if;
 update public.stockai_suppliers set name=v_name,tax_id=v_tax,
 legal_name=nullif(trim(p_data->>'legal_name'),''),contact_name=nullif(trim(p_data->>'contact_name'),''),email=nullif(trim(p_data->>'email'),''),phone=nullif(trim(p_data->>'phone'),''),address=nullif(trim(p_data->>'address'),''),notes=nullif(trim(p_data->>'notes'),''),
 aliases=case when name<>v_name and not(name=any(aliases)) then array_append(aliases,name) else aliases end,
 revision=revision+1 where org_id=p_org and id=p_id and revision=p_revision returning id into v_id;
 if v_id is null then raise exception 'Este cadastro foi alterado em outra sessão. Recarregue a página antes de editar.' using errcode='40001';end if;
 end if;
 return v_id;
end $$;
create function public.stockai_save_supplier(p_org uuid,p_data jsonb,p_id uuid default null,p_revision integer default null)
returns uuid language sql security invoker set search_path='' as $$select stockai_private.save_supplier(p_org,p_data,p_id,p_revision);$$;
revoke all on function stockai_private.save_supplier(uuid,jsonb,uuid,integer), public.stockai_save_supplier(uuid,jsonb,uuid,integer) from public,anon;
grant execute on function stockai_private.save_supplier(uuid,jsonb,uuid,integer), public.stockai_save_supplier(uuid,jsonb,uuid,integer) to authenticated;
commit;
