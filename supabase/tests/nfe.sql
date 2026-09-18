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
<det nItem="1"><prod><cProd>A1</cProd><xProd>Arroz</xProd><uCom>KG</uCom><qCom>10.0000</qCom><vUnCom>12.3456</vUnCom><vProd>123.46</vProd><vDesc>3.46</vDesc><indTot>1</indTot></prod></det>
<det nItem="2"><prod><cProd>B2</cProd><xProd>Leite</xProd><uCom>CX</uCom><qCom>2.0000</qCom><vUnCom>30.0000</vUnCom><vProd>60.00</vProd><indTot>1</indTot></prod></det>
<total><ICMSTot><vProd>183.46</vProd><vDesc>3.46</vDesc><vFrete>10.00</vFrete><vNF>190.00</vNF></ICMSTot></total>
</infNFe></NFe><protNFe versao="4.00"><infProt><tpAmb>1</tpAmb><chNFe>35260911222333000181550010000001231123456783</chNFe><nProt>135260000000123</nProt><cStat>100</cStat></infProt></protNFe></nfeProc>
$xml$,true);
select set_config('test.invoice','{"key": "35260911222333000181550010000001231123456783", "supplierName": "Fornecedor XML Teste", "issuedAt": "2026-09-18T10:00:00-03:00"}',true);
select set_config('test.lines','[{"number": "1", "name": "Arroz", "uom": "KG", "quantity": 10, "fiscal_cents": 12000, "source": {"factor": "1"}}, {"number": "2", "name": "Leite", "uom": "UN", "quantity": 12, "fiscal_cents": 6000, "source": {"factor": "6"}}]',true);
select set_config('test.request',gen_random_uuid()::text,true);
select set_config('test.receipt',public.stockai_import_nfe(current_setting('test.company')::uuid,current_setting('test.request')::uuid,current_setting('test.xml'),current_setting('test.invoice')::jsonb,current_setting('test.lines')::jsonb)::text,true);
do $$ declare r uuid; begin
 r:=public.stockai_import_nfe(current_setting('test.company')::uuid,current_setting('test.request')::uuid,current_setting('test.xml'),current_setting('test.invoice')::jsonb,current_setting('test.lines')::jsonb);
 if r::text<>current_setting('test.receipt') then raise exception 'Idempotency failed'; end if;
 if (select sum(fiscal_total_cents) from public.stockai_receipt_lines where receipt_id=r)<>18000 then raise exception 'Net goods mismatch'; end if;
 if (select invoice_total_cents from public.stockai_receipts where id=r)<>19000 then raise exception 'Source invoice total mismatch'; end if;
 if (select raw_xml from public.stockai_nfe_documents where receipt_id=r)<>current_setting('test.xml') then raise exception 'Original XML missing'; end if;
 begin perform public.stockai_import_nfe(current_setting('test.company')::uuid,gen_random_uuid(),current_setting('test.xml'),current_setting('test.invoice')::jsonb,current_setting('test.lines')::jsonb); raise exception 'Duplicate allowed'; exception when unique_violation then null; end;
 begin perform public.stockai_import_nfe(current_setting('test.other')::uuid,gen_random_uuid(),current_setting('test.xml'),current_setting('test.invoice')::jsonb,current_setting('test.lines')::jsonb); raise exception 'Wrong destination allowed'; exception when invalid_parameter_value then null; end;
 begin perform public.stockai_import_nfe(current_setting('test.company')::uuid,gen_random_uuid(),replace(current_setting('test.xml'),'<tpNF>1','<tpNF>0'),current_setting('test.invoice')::jsonb,current_setting('test.lines')::jsonb); raise exception 'Wrong type allowed'; exception when invalid_parameter_value then null; end;
end $$;
select public.stockai_submit_receipt_count(current_setting('test.receipt')::uuid,(select jsonb_object_agg(id::text,case when source_item_number=1 then 9 else 12 end) from public.stockai_receipt_lines where receipt_id=current_setting('test.receipt')::uuid));
do $$ begin
 if (select sum(credit_cents) from public.stockai_receipt_lines where receipt_id=current_setting('test.receipt')::uuid)<>1200 then raise exception 'Discounted shortage credit incorrect'; end if;
end $$;
select public.stockai_approve_receipt(current_setting('test.receipt')::uuid);
-- The same invoice number in another series is a different document.
select set_config('test.xml2',replace(replace(current_setting('test.xml'),'55001000000123','55002000000123'),'<serie>1','<serie>2'),true);
select set_config('test.invoice2',replace(current_setting('test.invoice'),'55001000000123','55002000000123'),true);
select public.stockai_import_nfe(current_setting('test.company')::uuid,gen_random_uuid(),current_setting('test.xml2'),current_setting('test.invoice2')::jsonb,current_setting('test.lines')::jsonb);
-- Repeated SKU lines remain independently countable and post separate stock entries.
do $$ declare d text; i jsonb; lines jsonb; r uuid; begin
 d:=replace(replace(replace(replace(current_setting('test.xml'),'55001000000123','55004000000123'),'<serie>1','<serie>4'),'<xProd>Leite','<xProd>Arroz'),'<uCom>CX','<uCom>KG');
 i:=replace(current_setting('test.invoice'),'55001000000123','55004000000123')::jsonb;
 lines:=jsonb_set(jsonb_set(jsonb_set(jsonb_set(current_setting('test.lines')::jsonb,'{1,name}','"Arroz"'),'{1,uom}','"KG"'),'{1,quantity}','2'),'{1,source,factor}','"1"');
 r:=public.stockai_import_nfe(current_setting('test.company')::uuid,gen_random_uuid(),d,i,lines);
 if (select count(distinct item_id) from public.stockai_receipt_lines where receipt_id=r)<>1 or (select count(*) from public.stockai_receipt_lines where receipt_id=r)<>2 then raise exception 'Repeated SKU lines lost'; end if;
 perform public.stockai_submit_receipt_count(r,(select jsonb_object_agg(id::text,invoiced_qty) from public.stockai_receipt_lines where receipt_id=r));
 if (select count(*) from public.stockai_stock_movements where receipt_line_id in (select id from public.stockai_receipt_lines where receipt_id=r))<>2 then raise exception 'Repeated SKU stock missing'; end if;
end $$;
-- A failed conversion cannot leave a supplier/receipt/document partially saved.
do $$ declare badxml text; badinvoice jsonb; begin
 badxml:=replace(replace(current_setting('test.xml'),'55001000000123','55003000000123'),'<serie>1','<serie>3');
 badinvoice:=replace(current_setting('test.invoice'),'55001000000123','55003000000123')::jsonb;
 begin perform public.stockai_import_nfe(current_setting('test.company')::uuid,gen_random_uuid(),badxml,badinvoice,jsonb_set(current_setting('test.lines')::jsonb,'{1,quantity}','13')); raise exception 'Bad conversion allowed'; exception when invalid_parameter_value then null; end;
 if (select count(*) from public.stockai_receipts where org_id=current_setting('test.org')::uuid)<>3 then raise exception 'Partial receipt persisted'; end if;
end $$;
reset role;
do $$ begin
 begin update public.stockai_nfe_documents set raw_xml='changed' where receipt_id=current_setting('test.receipt')::uuid; raise exception 'Document mutated'; exception when raise_exception then if sqlerrm='Document mutated' then raise; end if; end;
 begin update public.stockai_receipt_lines set fiscal_total_cents=0 where receipt_id=current_setting('test.receipt')::uuid; raise exception 'Fiscal mutated'; exception when raise_exception then if sqlerrm='Fiscal mutated' then raise; end if; end;
end $$;
insert into public.stockai_memberships(org_id,unit_id,user_id,role) values(current_setting('test.org')::uuid,current_setting('test.company')::uuid,'42222222-aaaa-4aaa-8aaa-aaaaaaaaaaaa','operator');
set local role authenticated;
select set_config('request.jwt.claim.sub','42222222-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true);
do $$ begin
 if exists(select 1 from public.stockai_nfe_documents where org_id=current_setting('test.org')::uuid) then raise exception 'Operator can read XML'; end if;
 begin perform public.stockai_import_nfe(current_setting('test.company')::uuid,gen_random_uuid(),current_setting('test.xml'),current_setting('test.invoice')::jsonb,current_setting('test.lines')::jsonb); raise exception 'Operator imported'; exception when insufficient_privilege then null; end;
 begin perform public.stockai_import_nfe(current_setting('test.other')::uuid,gen_random_uuid(),current_setting('test.xml'),current_setting('test.invoice')::jsonb,current_setting('test.lines')::jsonb); raise exception 'Cross-unit import'; exception when insufficient_privilege then null; end;
end $$;
set local role anon;
do $$ begin
 begin perform public.stockai_import_nfe(current_setting('test.company')::uuid,gen_random_uuid(),current_setting('test.xml'),current_setting('test.invoice')::jsonb,current_setting('test.lines')::jsonb); raise exception 'Anon imported'; exception when insufficient_privilege then null; end;
end $$;
rollback;
