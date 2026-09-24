alter table public.stockai_receipts
 add column reference_date date,
 add column reference_date_source text check(reference_date_source in ('xml','emission','registration'));

create function stockai_private.receipt_reference_date() returns trigger
language plpgsql security definer set search_path='' as $$
declare v_raw text; v_date text;
begin
 select raw_xml into v_raw from public.stockai_nfe_documents where receipt_id=new.id;
 if v_raw is not null then
   select coalesce(nullif(x.departure,''),nullif(x.legacy_departure,'')) into v_date
   from xmltable(xmlnamespaces('http://www.portalfiscal.inf.br/nfe' as n),
   '/n:nfeProc/n:NFe/n:infNFe/n:ide' passing xmlparse(document v_raw)
   columns departure text path 'n:dhSaiEnt',legacy_departure text path 'n:dSaiEnt') x;
 end if;
 if v_date is not null then
   begin
     new.reference_date := left(v_date,10)::date;
     new.reference_date_source := 'xml';
   exception when invalid_datetime_format or datetime_field_overflow then
     v_date := null;
   end;
 end if;
 if v_date is null then
   new.reference_date := (coalesce(new.issued_at,new.created_at) at time zone 'America/Sao_Paulo')::date;
   new.reference_date_source := case when new.issued_at is not null then 'emission' else 'registration' end;
 end if;
 return new;
end $$;
create trigger receipt_reference_date before insert or update of issued_at,reference_date,reference_date_source
on public.stockai_receipts for each row execute function stockai_private.receipt_reference_date();

create function stockai_private.document_reference_date() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 -- Documents are stored after the receipt header; recompute when the XML is available.
 update public.stockai_receipts set reference_date=null where id=new.receipt_id;
 return new;
end $$;
create trigger document_reference_date after insert on public.stockai_nfe_documents
for each row execute function stockai_private.document_reference_date();
revoke all on function stockai_private.receipt_reference_date(),stockai_private.document_reference_date() from public,anon,authenticated;

-- Preserve emission, original XML, import timestamp and financial values.
update public.stockai_receipts set reference_date=null;
set constraints all immediate;
alter table public.stockai_receipts alter column reference_date set not null;
alter table public.stockai_receipts alter column reference_date_source set not null;
create index stockai_receipts_reference_date on public.stockai_receipts(org_id,reference_date desc,id);
