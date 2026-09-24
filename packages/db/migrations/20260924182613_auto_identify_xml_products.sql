-- Reprocessing is atomic: invalid invoices leave no products, links or receipts behind.
create function stockai_private.auto_identify_xml(p_id uuid, p_unit uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
 r public.stockai_xml_inbox; v_org uuid; v_doc xml; l record;
 v_invoice jsonb; v_lines jsonb := '[]'; v_source jsonb;
 v_emit text; v_item uuid; v_uom text; v_factor numeric; v_name text;
 v_code text; v_prefix text; v_next bigint; v_receipt uuid;
 v_created int := 0; v_linked int := 0; v_id uuid;
 ns text[][] := array[array['n','http://www.portalfiscal.inf.br/nfe']];
begin
 select * into r from public.stockai_xml_inbox where id=p_id for update;
 if auth.uid() is null or r.id is null or not
   (r.uploaded_by=auth.uid() or stockai_private.can_access(r.org_id,r.unit_id,array['owner','manager','unit_manager','implementer']))
 then raise exception 'Sem permissão no arquivo.' using errcode='42501'; end if;
 select org_id into v_org from public.stockai_units where id=p_unit;
 if v_org is null or not stockai_private.can_access(v_org,p_unit,array['owner','manager','unit_manager','implementer'])
 then raise exception 'Sem permissão na empresa.' using errcode='42501'; end if;
 if r.receipt_id is not null then
   return jsonb_build_object('receipt_id',r.receipt_id,'created_products',0,'saved_links',0);
 end if;
 -- Same lock and order as identify_xml; concurrent retries reuse the saved products.
 perform pg_advisory_xact_lock(hashtextextended(v_org::text,0));
 if r.raw_xml ~* '<!\s*(DOCTYPE|ENTITY)' then raise exception 'XML inválido.' using errcode='22023'; end if;
 v_doc := xmlparse(document r.raw_xml);
 select jsonb_build_object('key',replace(x.key,'NFe',''),'supplierName',x.supplier,'issuedAt',x.issued),x.emit
 into v_invoice,v_emit
 from xmltable(xmlnamespaces('http://www.portalfiscal.inf.br/nfe' as n),'/n:nfeProc/n:NFe/n:infNFe'
 passing v_doc columns key text path '@Id', supplier text path 'n:emit/n:xNome',
 issued text path 'n:ide/n:dhEmi', emit text path 'n:emit/n:CNPJ') x;
 if v_invoice is null or (xpath('/n:nfeProc/n:NFe/n:infNFe/n:dest/n:CNPJ/text()',v_doc,ns))[1]::text
 is distinct from (select tax_id from public.stockai_units where id=p_unit)
 then raise exception 'O CNPJ da nota não corresponde à empresa selecionada.' using errcode='22023'; end if;
 if exists(select 1 from public.stockai_receipts where unit_id=p_unit and access_key=v_invoice->>'key') then
   v_receipt := stockai_private.identify_xml(p_id,p_unit,v_invoice,'[]',false);
   return jsonb_build_object('receipt_id',v_receipt,'created_products',0,'saved_links',0);
 end if;
 v_prefix := case when exists(select 1 from public.stockai_items where org_id=v_org and internal_code ~ '^MAZA-[0-9]+$') then 'MAZA-' else 'AUTO-' end;
 select coalesce(max(substring(internal_code from length(v_prefix)+1)::bigint),0)
 into v_next from public.stockai_items where org_id=v_org
 and internal_code ~ ('^'||v_prefix||'[0-9]{1,12}$');
 for l in select * from xmltable(xmlnamespaces('http://www.portalfiscal.inf.br/nfe' as n),'/n:nfeProc/n:NFe/n:infNFe/n:det'
 passing v_doc columns number text path '@nItem', code text path 'n:prod/n:cProd',
 name text path 'n:prod/n:xProd', unit text path 'n:prod/n:uCom', qty numeric path 'n:prod/n:qCom',
 price numeric path 'n:prod/n:vUnCom', gross numeric path 'n:prod/n:vProd', discount numeric path 'n:prod/n:vDesc') loop
   l.unit := upper(trim(l.unit));
   v_item := null; v_uom := null; v_factor := null;
   select p.item_id,i.base_uom,p.factor into v_item,v_uom,v_factor
   from public.stockai_product_links p join public.stockai_items i on i.id=p.item_id and i.org_id=p.org_id
   where p.org_id=v_org and p.supplier_tax_id=v_emit and p.supplier_code=l.code and p.source_unit=l.unit;
   if v_item is not null and not exists(select 1 from public.stockai_items where id=v_item and is_active) then
     raise exception 'Produto vinculado está inativo. Revise o vínculo em Identificação.' using errcode='22023';
   end if;
   if v_item is null then
     if not stockai_private.can_manage_catalog(v_org) then
       raise exception 'Peça ao gestor para criar os códigos dos produtos ausentes.' using errcode='42501';
     end if;
     v_uom := case when l.unit in ('KG','KGS','G','GR') then 'KG'
                   when l.unit in ('L','LT','LITRO','ML') then 'L' else 'UN' end;
     v_factor := case when l.unit in ('G','GR','ML') then 0.001 else 1 end;
     -- PC can mean a pack, not a single piece. Never guess a pack's contents.
     v_name := case when l.unit in ('KG','KGS','G','GR','L','LT','LITRO','ML','UN','UND','UNID')
                    then left(trim(l.name),120)
                    else left(trim(l.name),90)||' ['||l.unit||' de compra]' end;
     -- Exact name AND base unit only for explicit measurement units; fuzzy matches need review.
     if l.unit in ('KG','KGS','G','GR','L','LT','LITRO','ML','UN','UND','UNID') then
       select id into v_item from public.stockai_items
       where org_id=v_org and name=v_name and base_uom=v_uom and is_active;
     end if;
     if v_item is null then
       v_id := gen_random_uuid();
       if exists(select 1 from public.stockai_items where org_id=v_org and name=v_name and base_uom=v_uom) then
         v_name := left(v_name,75)||' ['||v_id::text||']';
       end if;
       loop
         v_next := v_next+1;
         v_code := v_prefix||lpad(v_next::text,greatest(4,length(v_next::text)),'0');
         exit when not exists(select 1 from public.stockai_items where org_id=v_org and upper(trim(internal_code))=v_code);
       end loop;
       insert into public.stockai_items(id,org_id,name,base_uom,internal_code,source_references)
       values(v_id,v_org,v_name,v_uom,v_code,jsonb_build_object(
         'origin','xml_auto_reprocess','inbox_id',p_id,'original_name',l.name,'purchase_unit',l.unit,
         'classification_pending',true,
         'unit_definition',case when v_name like '%de compra]%' then '1 UN = 1 embalagem faturada em '||l.unit||'. Conteúdo interno não convertido.' else 'Conversão da unidade comercial do XML para '||v_uom end,
         'links',jsonb_build_array(jsonb_build_object('supplier_tax_id',v_emit,'supplier_code',l.code,'source_unit',l.unit,'factor',v_factor))))
       returning id into v_item;
       v_created := v_created+1;
     end if;
     insert into public.stockai_product_links(org_id,supplier_tax_id,supplier_code,source_unit,item_id,factor,updated_by)
     values(v_org,v_emit,l.code,l.unit,v_item,v_factor,auth.uid());
     v_linked := v_linked+1;
   end if;
   v_source := jsonb_build_object('number',l.number,'code',l.code,'name',l.name,'commercialUnit',l.unit,
     'quantity',l.qty::text,'unitPrice',l.price::text,'grossCents',round(l.gross*100),
     'discountCents',round(coalesce(l.discount,0)*100),'factor',v_factor::text);
   v_lines := v_lines||jsonb_build_array(jsonb_build_object('number',l.number,'name',l.name,
     'item_id',v_item,'uom',v_uom,'quantity',l.qty*v_factor,
     'fiscal_cents',round((l.gross-coalesce(l.discount,0))*100),'source',v_source));
 end loop;
 -- Full fiscal validation and all resulting writes share this transaction.
 v_receipt := stockai_private.identify_xml(p_id,p_unit,v_invoice,v_lines,false);
 return jsonb_build_object('receipt_id',v_receipt,'created_products',v_created,'saved_links',v_linked);
end $$;
create function public.stockai_auto_identify_xml(p_id uuid,p_unit uuid)
returns jsonb language sql security invoker set search_path = '' as $$
 select stockai_private.auto_identify_xml(p_id,p_unit);
$$;
revoke all on function stockai_private.auto_identify_xml(uuid,uuid),public.stockai_auto_identify_xml(uuid,uuid) from public,anon;
grant execute on function stockai_private.auto_identify_xml(uuid,uuid),public.stockai_auto_identify_xml(uuid,uuid) to authenticated;
