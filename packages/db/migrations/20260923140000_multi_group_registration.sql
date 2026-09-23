begin;

-- Same login may now own more than one group: register_company gains an explicit
-- "start a new, independent group" mode instead of only auto-creating a group the
-- first time a user with zero memberships registers a company.
drop function if exists public.stockai_register_company(text, text, text, uuid, uuid);
drop function if exists stockai_private.register_company(text, text, text, uuid, uuid);

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION stockai_private.register_company(p_name text, p_legal_name text, p_tax_id text, p_org uuid DEFAULT NULL::uuid, p_unit uuid DEFAULT NULL::uuid, p_new_org boolean DEFAULT false)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_org uuid; v_unit uuid; v_tax text; v_old_tax text;
begin
 if auth.uid() is null then raise exception 'Autenticação necessária.' using errcode='42501'; end if;
 v_tax := upper(regexp_replace(coalesce(p_tax_id,''),'[./\s-]','','g'));
 if length(trim(coalesce(p_name,''))) not between 2 and 80 or length(trim(coalesce(p_legal_name,''))) not between 2 and 160 or v_tax !~ '^[A-Z0-9]{12}[0-9]{2}$' then raise exception 'Confira nome, razão social e CNPJ.' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
 if p_unit is not null then
   select org_id,tax_id into v_org,v_old_tax from public.stockai_units where id=p_unit for update;
   if not found or not stockai_private.can_access(v_org,p_unit,array['owner','manager','unit_manager','implementer']) then raise exception 'Sem permissão.' using errcode='42501'; end if;
   if p_org is not null and p_org<>v_org then raise exception 'Empresa de outro grupo.' using errcode='42501'; end if;
   if v_old_tax is not null and v_old_tax<>v_tax and exists(select 1 from public.stockai_receipts where unit_id=p_unit) then raise exception 'CNPJ com notas vinculadas não pode ser alterado.' using errcode='22023'; end if;
   update public.stockai_units set name=trim(p_name),legal_name=trim(p_legal_name),tax_id=v_tax where id=p_unit;
   return p_unit;
 elsif p_new_org then
   -- Explicit request for a brand-new, independent group: a login may own several groups,
   -- each with its own companies, regardless of memberships it already holds elsewhere.
   insert into public.stockai_orgs(name) values(trim(p_name)) returning id into v_org;
   insert into public.stockai_memberships(org_id,user_id,role) values(v_org,auth.uid(),'owner');
 elsif p_org is not null then
   -- Creating companies requires a group-wide role, not a unit-scoped membership.
   if not exists(select 1 from public.stockai_memberships where org_id=p_org and user_id=auth.uid() and unit_id is null and role=any(array['owner','manager','implementer']) and revoked_at is null and (expires_at is null or expires_at>now())) then raise exception 'Sem permissão.' using errcode='42501'; end if;
   v_org:=p_org;
 else
   if exists(select 1 from public.stockai_memberships where user_id=auth.uid() and revoked_at is null and (expires_at is null or expires_at>now())) then raise exception 'Selecione seu grupo para cadastrar a empresa.' using errcode='42501'; end if;
   insert into public.stockai_orgs(name) values(trim(p_name)) returning id into v_org;
   insert into public.stockai_memberships(org_id,user_id,role) values(v_org,auth.uid(),'owner');
 end if;
 insert into public.stockai_units(org_id,name,legal_name,tax_id) values(v_org,trim(p_name),trim(p_legal_name),v_tax) returning id into v_unit;
 return v_unit;
end; $function$
;

CREATE OR REPLACE FUNCTION public.stockai_register_company(p_name text, p_legal_name text, p_tax_id text, p_org uuid DEFAULT NULL::uuid, p_unit uuid DEFAULT NULL::uuid, p_new_org boolean DEFAULT false)
 RETURNS uuid
 LANGUAGE sql
 SET search_path TO ''
AS $function$ select stockai_private.register_company(p_name,p_legal_name,p_tax_id,p_org,p_unit,p_new_org); $function$
;

-- Schema diff tools omit function grants; explicitly preserve the RPC boundary.
revoke all on function stockai_private.register_company(text,text,text,uuid,uuid,boolean),public.stockai_register_company(text,text,text,uuid,uuid,boolean) from public,anon;
grant execute on function stockai_private.register_company(text,text,text,uuid,uuid,boolean),public.stockai_register_company(text,text,text,uuid,uuid,boolean) to authenticated;

commit;
