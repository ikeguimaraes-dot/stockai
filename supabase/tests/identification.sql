-- Synthetic NF-e fixture; every write rolls back.
begin;
insert into auth.users(id,email) values ('41111111-aaaa-4aaa-8aaa-aaaaaaaaaaaa','xml-owner@stockai.test'),('42222222-aaaa-4aaa-8aaa-aaaaaaaaaaaa','xml-operator@stockai.test');
set local role authenticated;
select set_config('request.jwt.claim.sub','41111111-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true);
select set_config('test.company',public.stockai_register_company('XML Company','XML Company Ltda','12345678000195')::text,true);
select set_config('test.org',(select org_id::text from public.stockai_units where id=current_setting('test.company')::uuid),true);
select set_config('test.other',public.stockai_register_company('Other Company','Other Ltda','11222333000181',current_setting('test.org')::uuid)::text,true);
select set_config('test.xml',$xml$<?xml version="1.0" encoding="UTF-8"?>
<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00">
<NFe><infNFe Id="NFe35260911222333000181550010000001231123456783" versao="4.00">
<ide><mod>55</mod><serie>1</serie><nNF>123</nNF><dhEmi>2026-09-18T10:00:00-03:00</dhEmi><tpNF>1</tpNF><tpAmb>1</tpAmb><finNFe>1</finNFe></ide>
<emit><CNPJ>11222333000181</CNPJ><xNome>Fornecedor XML Teste</xNome></emit>
<dest><CNPJ>12345678000195</CNPJ><xNome>Empresa XML Teste</xNome></dest>
<det nItem="1"><prod><cProd>A&amp;1</cProd><xProd>Arroz</xProd><uCom>KG</uCom><qCom>10.0000</qCom><vUnCom>12.3456</vUnCom><vProd>123.46</vProd><vDesc>3.46</vDesc><indTot>1</indTot></prod></det>
<det nItem="2"><prod><cProd>B2</cProd><xProd>Leite</xProd><uCom>CX</uCom><qCom>2.0000</qCom><vUnCom>30.0000</vUnCom><vProd>60.00</vProd><indTot>1</indTot></prod></det>
<total><ICMSTot><vProd>183.46</vProd><vDesc>3.46</vDesc><vFrete>10.00</vFrete><vNF>190.00</vNF></ICMSTot></total>
</infNFe></NFe><protNFe versao="4.00"><infProt><tpAmb>1</tpAmb><chNFe>35260911222333000181550010000001231123456783</chNFe><nProt>135260000000123</nProt><cStat>100</cStat></infProt></protNFe></nfeProc>
$xml$,true);
select set_config('test.invoice','{"key": "35260911222333000181550010000001231123456783", "supplierName": "Fornecedor XML Teste", "issuedAt": "2026-09-18T10:00:00-03:00"}',true);
select set_config('test.lines','[{"number": "1", "name": "Arroz", "uom": "KG", "quantity": 10, "fiscal_cents": 12000, "source": {"factor": "1"}}, {"number": "2", "name": "Leite", "uom": "UN", "quantity": 12, "fiscal_cents": 6000, "source": {"factor": "6"}}]',true);

select set_config('test.item1',public.stockai_save_product_code(current_setting('test.org')::uuid,'Meu arroz','KG','AR-01',null,true)::text,true);
select set_config('test.item2',public.stockai_save_product_code(current_setting('test.org')::uuid,'Meu leite','UN','LE-01',null,true)::text,true);
select set_config('test.lines',(select jsonb_agg(value||jsonb_build_object('item_id',case when value->>'number'='1' then current_setting('test.item1') else current_setting('test.item2') end))::text from jsonb_array_elements(current_setting('test.lines')::jsonb)),true);
select set_config('test.inbox',public.stockai_queue_xml('nota.xml',current_setting('test.xml'),gen_random_uuid())::text,true);
select set_config('test.receipt',public.stockai_identify_xml(current_setting('test.inbox')::uuid,current_setting('test.company')::uuid,current_setting('test.invoice')::jsonb,current_setting('test.lines')::jsonb,true)::text,true);
do $$ begin
 if not exists(select 1 from public.stockai_product_links where org_id=current_setting('test.org')::uuid and supplier_code='A&1') then raise exception 'XML escaped code decoded incorrectly';end if;
 if (select count(*) from public.stockai_product_links where org_id=current_setting('test.org')::uuid)<>2 then raise exception 'Mappings missing';end if;
 if public.stockai_queue_xml('duplicate.xml',current_setting('test.xml'),gen_random_uuid())<>current_setting('test.inbox')::uuid then raise exception 'Inbox duplicate';end if;
 if (select count(*) from public.stockai_items where org_id=current_setting('test.org')::uuid)<>2 then raise exception 'Supplier name created extra products';end if;
 perform public.stockai_queue_xml('broken.xml','<broken>',gen_random_uuid());
 begin perform public.stockai_save_product_code(current_setting('test.org')::uuid,'Duplicate','KG','ar-01',null,true);raise exception 'Duplicate code accepted';exception when unique_violation then null;end;
end $$;
select public.stockai_submit_receipt_count(current_setting('test.receipt')::uuid,(select jsonb_object_agg(id::text,invoiced_qty) from public.stockai_receipt_lines where receipt_id=current_setting('test.receipt')::uuid));
select set_config('test.header',jsonb_build_object('unit_id',current_setting('test.company'),'supplier','Fornecedor corrigido','invoice_number','123-A','invoice_series','1','issued_at','2026-09-18T12:00:00Z','invoice_total_cents',3000,'notes','Corrigida')::text,true);
select set_config('test.editlines',jsonb_build_array(jsonb_build_object('item_id',current_setting('test.item1'),'quantity',4,'counted',3,'price_cents',750))::text,true);
select set_config('test.editrequest',gen_random_uuid()::text,true);
select public.stockai_edit_receipt(current_setting('test.receipt')::uuid,0,current_setting('test.editrequest')::uuid,current_setting('test.header')::jsonb,current_setting('test.editlines')::jsonb,'Correção de entrada');
select public.stockai_edit_receipt(current_setting('test.receipt')::uuid,0,current_setting('test.editrequest')::uuid,current_setting('test.header')::jsonb,current_setting('test.editlines')::jsonb,'Retry idempotente');
do $$ begin
 if (select sum(qty_base) from public.stockai_stock_movements where item_id=current_setting('test.item1')::uuid)<>3 then raise exception 'Incorrect revised rice stock';end if;
 if (select sum(qty_base) from public.stockai_stock_movements where item_id=current_setting('test.item2')::uuid)<>0 then raise exception 'Removed item still in stock';end if;
 if (select revision from public.stockai_receipts where id=current_setting('test.receipt')::uuid)<>1 then raise exception 'Revision retry duplicated';end if;
 if (select count(*) from public.stockai_receipt_revisions where receipt_id=current_setting('test.receipt')::uuid)<>1 then raise exception 'Missing history';end if;
 if (select raw_xml from public.stockai_nfe_documents where receipt_id=current_setting('test.receipt')::uuid)<>current_setting('test.xml') then raise exception 'Original XML changed';end if;
 if not exists(select 1 from public.stockai_supplier_claims c join public.stockai_receipt_lines l on l.id=c.receipt_line_id where l.receipt_id=current_setting('test.receipt')::uuid and l.is_active and c.amount_cents=750) then raise exception 'Revised claim missing';end if;
 begin perform public.stockai_edit_receipt(current_setting('test.receipt')::uuid,0,gen_random_uuid(),current_setting('test.header')::jsonb,current_setting('test.editlines')::jsonb,'Stale revision');raise exception 'Stale edit accepted';exception when serialization_failure then null;end;
 begin update public.stockai_receipt_lines set is_active=true;raise exception 'Direct edit allowed';exception when insufficient_privilege then null;end;
end $$;
select public.stockai_edit_receipt(current_setting('test.receipt')::uuid,1,gen_random_uuid(),current_setting('test.header')::jsonb||jsonb_build_object('unit_id',current_setting('test.other')),current_setting('test.editlines')::jsonb,'Alterar destinatária');
do $$ begin
 if (select sum(qty_base) from public.stockai_stock_movements where unit_id=current_setting('test.company')::uuid)<>0 then raise exception 'Old company stock retained';end if;
 if (select sum(qty_base) from public.stockai_stock_movements where unit_id=current_setting('test.other')::uuid)<>3 then raise exception 'New company stock missing';end if;
 if (select count(*) from public.stockai_receipt_lines where receipt_id=current_setting('test.receipt')::uuid and is_active)<>1 then raise exception 'Archived lines active';end if;
end $$;
-- An edit before conference must hide archived lines and accept only the new count.
select set_config('test.open',public.stockai_create_receipt(current_setting('test.company')::uuid,'Fornecedor','manual-open','[{"name":"Meu arroz","uom":"KG","quantity":2,"price_cents":100}]',gen_random_uuid())::text,true);
select public.stockai_edit_receipt(current_setting('test.open')::uuid,0,gen_random_uuid(),current_setting('test.header')::jsonb,current_setting('test.editlines')::jsonb,'Antes da conferência');
do $$ begin
 if jsonb_array_length(public.stockai_get_blind_receipt(current_setting('test.open')::uuid)->'lines')<>1 then raise exception 'Blind count exposed archived lines';end if;
end $$;
select public.stockai_submit_receipt_count(current_setting('test.open')::uuid,(select jsonb_object_agg(id::text,invoiced_qty) from public.stockai_receipt_lines where receipt_id=current_setting('test.open')::uuid and is_active));
do $$ begin
 if (select status from public.stockai_receipts where id=current_setting('test.open')::uuid)<>'closed' then raise exception 'Count after edit did not close';end if;
end $$;
reset role;
insert into public.stockai_memberships(org_id,unit_id,user_id,role) values(current_setting('test.org')::uuid,current_setting('test.other')::uuid,'42222222-aaaa-4aaa-8aaa-aaaaaaaaaaaa','operator');
set local role authenticated;
select set_config('request.jwt.claim.sub','42222222-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true);
do $$ begin
 if exists(select 1 from public.stockai_xml_inbox) then raise exception 'Operator can read manager inbox';end if;
 begin perform public.stockai_edit_receipt(current_setting('test.receipt')::uuid,2,gen_random_uuid(),current_setting('test.header')::jsonb,current_setting('test.editlines')::jsonb,'Unauthorized edit');raise exception 'Operator edited';exception when insufficient_privilege then null;end;
 begin perform public.stockai_identify_xml(current_setting('test.inbox')::uuid,current_setting('test.other')::uuid,'{}','[]',false);raise exception 'Operator identified foreign inbox';exception when insufficient_privilege then null;end;
end $$;
rollback;
