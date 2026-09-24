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

select set_config('test.xml',replace(current_setting('test.xml'),'</infNFe>','<cobr><dup><nDup>1</nDup><dVenc>2026-10-10</dVenc><vDup>90.00</vDup></dup><dup><nDup>2</nDup><dVenc>2026-11-10</dVenc><vDup>100.00</vDup></dup></cobr></infNFe>'),true);
select set_config('test.inbox',public.stockai_queue_xml('finance.xml',current_setting('test.xml'),gen_random_uuid())::text,true);
select public.stockai_xml_pending(current_setting('test.inbox')::uuid,'Mapear produtos',current_setting('test.company')::uuid);
set constraints all immediate;
select set_config('test.bill',(select id::text from public.stockai_payables where inbox_id=current_setting('test.inbox')::uuid),true);
do $$ begin
 if current_setting('test.bill')='' then raise exception 'Pending XML missing payable';end if;
 if (select count(*) from public.stockai_payable_installments where payable_id=current_setting('test.bill')::uuid)<>2 then raise exception 'XML installments lost';end if;
 if (select sum(amount_cents) from public.stockai_payable_installments where payable_id=current_setting('test.bill')::uuid)<>19000 then raise exception 'Invoice total mismatch';end if;
 if not exists(select 1 from public.stockai_payable_installments where payable_id=current_setting('test.bill')::uuid and due_on='2026-11-10') then raise exception 'Due date lost';end if;
end $$;
set constraints all deferred;
select set_config('test.receipt',public.stockai_import_nfe(current_setting('test.company')::uuid,gen_random_uuid(),current_setting('test.xml'),current_setting('test.invoice')::jsonb,current_setting('test.lines')::jsonb)::text,true);
set constraints all immediate;
do $$ begin
 if (select id from public.stockai_payables where receipt_id=current_setting('test.receipt')::uuid) is distinct from current_setting('test.bill')::uuid then raise exception 'Duplicate payable created by identification';end if;
end $$;
select set_config('test.finance_payload',jsonb_build_object('unit_id',current_setting('test.company'),'description','Nota teste','installments',jsonb_build_array(jsonb_build_object('amount_cents',9000,'due_on','2026-10-10','paid_on','2026-09-01'),jsonb_build_object('amount_cents',10000,'due_on','2026-11-10')))::text,true);
select public.stockai_save_payable(current_setting('test.bill')::uuid,(select revision from public.stockai_payables where id=current_setting('test.bill')::uuid),gen_random_uuid(),current_setting('test.finance_payload')::jsonb);
reset role;
update public.stockai_receipts set invoice_total_cents=20000 where id=current_setting('test.receipt')::uuid;
set local role authenticated;
do $$ begin
 if not exists(select 1 from public.stockai_payables where id=current_setting('test.bill')::uuid and total_cents=20000 and review_note is not null) then raise exception 'Changed note not flagged';end if;
 if not exists(select 1 from public.stockai_payable_installments where payable_id=current_setting('test.bill')::uuid and paid_on='2026-09-01' and amount_cents=9000) then raise exception 'Payment overwritten';end if;
 begin perform public.stockai_save_payable(current_setting('test.bill')::uuid,(select revision from public.stockai_payables where id=current_setting('test.bill')::uuid),gen_random_uuid(),current_setting('test.finance_payload')::jsonb);raise exception 'Unbalanced schedule allowed';exception when invalid_parameter_value then null;end;
 begin perform stockai_private.sync_payable(current_setting('test.receipt')::uuid);raise exception 'Sync exposed';exception when insufficient_privilege then null;end;
end $$;
select set_config('test.manual_request',gen_random_uuid()::text,true);
select set_config('test.manual_payload',jsonb_build_object('unit_id',current_setting('test.company'),'creditor_name','João sem CNPJ','description','Serviço de manutenção','installments',jsonb_build_array(jsonb_build_object('amount_cents',15000)))::text,true);
select set_config('test.manual_bill',public.stockai_save_payable(null,0,current_setting('test.manual_request')::uuid,current_setting('test.manual_payload')::jsonb)::text,true);
do $$ declare second uuid; begin
 second:=public.stockai_save_payable(null,0,current_setting('test.manual_request')::uuid,current_setting('test.manual_payload')::jsonb);
 if second is distinct from current_setting('test.manual_bill')::uuid then raise exception 'Manual retry duplicated';end if;
 if not exists(select 1 from public.stockai_payables where id=second and supplier_id is not null and total_cents=15000) then raise exception 'Expense without CNPJ failed';end if;
 if not exists(select 1 from public.stockai_payable_installments where payable_id=second and due_on is null) then raise exception 'Invented due date';end if;
 begin update public.stockai_payables set total_cents=1 where id=second;raise exception 'Direct mutation allowed';exception when insufficient_privilege then null;end;
end $$;
set constraints all deferred;
select set_config('test.manual_receipt',public.stockai_create_receipt(current_setting('test.company')::uuid,'Sem documento','manual-1','[{"name":"Arroz","uom":"KG","quantity":2,"price_cents":700}]',gen_random_uuid())::text,true);
set constraints all immediate;
do $$ begin
 if not exists(select 1 from public.stockai_payables where receipt_id=current_setting('test.manual_receipt')::uuid and total_cents=1400) then raise exception 'Manual receipt did not sync final lines';end if;
end $$;
reset role;
insert into public.stockai_memberships(org_id,unit_id,user_id,role) values(current_setting('test.org')::uuid,current_setting('test.company')::uuid,'42222222-aaaa-4aaa-8aaa-aaaaaaaaaaaa','operator');
set local role authenticated;
select set_config('request.jwt.claim.sub','42222222-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true);
do $$ begin
 if exists(select 1 from public.stockai_payables where id=current_setting('test.bill')::uuid) then raise exception 'Operator finance read';end if;
 if exists(select 1 from public.stockai_payable_installments where payable_id=current_setting('test.bill')::uuid) then raise exception 'Operator installments read';end if;
 begin perform public.stockai_save_payable(null,0,gen_random_uuid(),current_setting('test.manual_payload')::jsonb);raise exception 'Operator finance write';exception when insufficient_privilege then null;end;
end $$;
select set_config('test.foreign',public.stockai_register_company('Finance B','Finance B Ltda','55666777000188',null,null,true)::text,true);
do $$ begin
 begin perform public.stockai_save_payable(current_setting('test.bill')::uuid,1,gen_random_uuid(),jsonb_set(current_setting('test.manual_payload')::jsonb,'{unit_id}',to_jsonb(current_setting('test.foreign'))));raise exception 'Cross org mutation';exception when insufficient_privilege then null;end;
end $$;
set local role anon;
do $$ begin
 begin perform 1 from public.stockai_payables;raise exception 'Anon finance read';exception when insufficient_privilege then null;end;
end $$;
rollback;
