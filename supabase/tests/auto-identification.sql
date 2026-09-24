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


-- Reuse an exact catalog item; the unknown box must be one purchase unit, not a guessed count.
select set_config('test.rice',public.stockai_save_product_code(current_setting('test.org')::uuid,'Arroz','KG','AR-01',null,true)::text,true);
select set_config('test.inbox',public.stockai_queue_xml('auto.xml',current_setting('test.xml'),gen_random_uuid())::text,true);
select set_config('test.result',public.stockai_auto_identify_xml(current_setting('test.inbox')::uuid,current_setting('test.company')::uuid)::text,true);
do $$ declare v_result jsonb:=current_setting('test.result')::jsonb; begin
 if v_result->>'created_products'<>'1' or v_result->>'saved_links'<>'2' then raise exception 'Incorrect creation count: %',v_result;end if;
 if not exists(select 1 from public.stockai_product_links where supplier_code='A&1' and item_id=current_setting('test.rice')::uuid and factor=1) then raise exception 'Existing product not reused';end if;
 if not exists(select 1 from public.stockai_items where org_id=current_setting('test.org')::uuid and name='Leite [CX de compra]' and base_uom='UN' and internal_code='AUTO-0001' and composes_cmv is null) then raise exception 'Purchase unit missing';end if;
 if not exists(select 1 from public.stockai_receipt_lines where receipt_id=(v_result->>'receipt_id')::uuid and source_item_number=2 and invoiced_qty=2 and source_data->>'commercialUnit'='CX') then raise exception 'Box quantity changed';end if;
 if exists(select 1 from public.stockai_stock_movements where org_id=current_setting('test.org')::uuid) then raise exception 'Auto import changed stock';end if;
 if not exists(select 1 from public.stockai_receipts where id=(v_result->>'receipt_id')::uuid and reference_date='2026-09-18' and reference_date_source='emission') then raise exception 'Missing emission fallback';end if;
 if public.stockai_auto_identify_xml(current_setting('test.inbox')::uuid,current_setting('test.company')::uuid)->>'created_products'<>'0' then raise exception 'Retry created products';end if;
end $$;
-- A second note must preserve a deliberately changed, saved conversion.
reset role;
update public.stockai_product_links set factor=6 where org_id=current_setting('test.org')::uuid and supplier_code='B2';
set local role authenticated;
select set_config('test.secondxml',replace(replace(current_setting('test.xml'),'35260911222333000181550010000001231123456783','35260911222333000181550010000001241123456780'),'<nNF>123</nNF>','<nNF>124</nNF>'),true);
select set_config('test.secondxml',replace(current_setting('test.secondxml'),'</ide>','<dhSaiEnt>2026-09-30T23:30:00-03:00</dhSaiEnt></ide>'),true);
select set_config('test.second',public.stockai_queue_xml('second.xml',current_setting('test.secondxml'),gen_random_uuid())::text,true);
select set_config('test.secondresult',public.stockai_auto_identify_xml(current_setting('test.second')::uuid,current_setting('test.company')::uuid)::text,true);
do $$ begin
 if current_setting('test.secondresult')::jsonb->>'created_products'<>'0' then raise exception 'Products recreated';end if;
 if not exists(select 1 from public.stockai_receipts where id=(current_setting('test.secondresult')::jsonb->>'receipt_id')::uuid and reference_date='2026-09-30' and reference_date_source='xml') then raise exception 'XML local departure date not preserved';end if;
 if not exists(select 1 from public.stockai_receipt_lines where receipt_id=(current_setting('test.secondresult')::jsonb->>'receipt_id')::uuid and source_item_number=2 and invoiced_qty=12) then raise exception 'Saved conversion overwritten';end if;
end $$;
-- An invalid authorization with a new product must roll back that product and link.
select set_config('test.bad',public.stockai_queue_xml('bad.xml',replace(replace(replace(current_setting('test.xml'),'B2','BAD-NEW'),'<cStat>100</cStat>','<cStat>999</cStat>'),'NFe35260911222333000181550010000001231123456783','NFe35260911222333000181550010000001251123456788'),gen_random_uuid())::text,true);
do $$ begin
 begin
 perform public.stockai_auto_identify_xml(current_setting('test.bad')::uuid,current_setting('test.company')::uuid);
 raise exception 'Invalid protocol accepted';
 exception when invalid_parameter_value then null;end;
 if (select count(*) from public.stockai_items where org_id=current_setting('test.org')::uuid)<>2 then raise exception 'Invalid invoice left products';end if;
 if exists(select 1 from public.stockai_product_links where supplier_code='BAD-NEW' and org_id=current_setting('test.org')::uuid) then raise exception 'Invalid invoice left mapping';end if;
 if exists(select 1 from public.stockai_xml_inbox where id=current_setting('test.bad')::uuid and receipt_id is not null) then raise exception 'Invalid invoice imported';end if;
end $$;
set constraints all immediate;
do $$ begin
 if (select count(*) from public.stockai_payables where org_id=current_setting('test.org')::uuid)<>2 then raise exception 'Payables duplicated or missing';end if;
end $$;
-- Devolutions stay readable in their own area, never becoming payables or receipts.
select set_config('test.return',public.stockai_queue_xml('return.xml',replace(replace(current_setting('test.xml'),'<finNFe>1</finNFe>','<finNFe>4</finNFe>'),'<tpNF>1</tpNF>','<tpNF>0</tpNF>'),gen_random_uuid())::text,true);
do $$ begin
 if not exists(select 1 from public.stockai_return_invoices() where id=current_setting('test.return')::uuid and invoice_number='123' and total_cents=19000) then raise exception 'Return not listed';end if;
 if (select count(*) from public.stockai_return_invoices())<>1 then raise exception 'Non-return listed';end if;
end $$;
-- Neither a different tenant nor an operator may create products through this endpoint.
reset role;
insert into public.stockai_memberships(org_id,unit_id,user_id,role) values(current_setting('test.org')::uuid,current_setting('test.company')::uuid,'42222222-aaaa-4aaa-8aaa-aaaaaaaaaaaa','operator');
set local role authenticated;
select set_config('request.jwt.claim.sub','42222222-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true);
do $$ begin
 if exists(select 1 from public.stockai_return_invoices()) then raise exception 'Operator accessed return inbox';end if;
 begin perform public.stockai_auto_identify_xml(current_setting('test.inbox')::uuid,current_setting('test.company')::uuid);raise exception 'Operator accessed manager XML';exception when insufficient_privilege then null;end;
end $$;
rollback;
