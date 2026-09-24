begin;
-- Expected quantities are now visible in receiving, as requested. Prices remain restricted.
create function stockai_private.receipt_conference(p_receipt uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare r public.stockai_receipts;result jsonb;
begin
 select * into r from public.stockai_receipts where id=p_receipt;
 if r.id is null or not stockai_private.can_access(r.org_id,r.unit_id,array['owner','manager','unit_manager','operator','implementer']) then raise exception 'Sem permissão.' using errcode='42501';end if;
 select jsonb_build_object('id',r.id,'supplier',s.name,'unit',u.name,'status',r.status,'lines',
 (select jsonb_agg(jsonb_strip_nulls(jsonb_build_object('id',l.id,'name',i.name,'uom',i.base_uom,'invoiced',l.invoiced_qty,'sourceQuantity',l.source_data->>'quantity','sourceUnit',l.source_data->>'commercialUnit')) order by l.source_item_number nulls last,i.name,l.id)
 from public.stockai_receipt_lines l join public.stockai_items i on i.id=l.item_id where l.receipt_id=r.id and l.is_active)) into result
 from public.stockai_suppliers s,public.stockai_units u where s.id=r.supplier_id and u.id=r.unit_id;
 return result;
end $$;
create function public.stockai_get_receipt_conference(p_receipt uuid) returns jsonb language sql stable security invoker set search_path='' as $$select stockai_private.receipt_conference(p_receipt);$$;
revoke all on function stockai_private.receipt_conference(uuid),public.stockai_get_receipt_conference(uuid) from public,anon;
grant execute on function stockai_private.receipt_conference(uuid),public.stockai_get_receipt_conference(uuid) to authenticated;
commit;
