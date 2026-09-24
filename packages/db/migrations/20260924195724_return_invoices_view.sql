-- Invoker security preserves the inbox RLS, including uploader-only unassigned files.
create function public.stockai_return_invoices()
returns table(id uuid,filename text,invoice_number text,invoice_series text,supplier text,
 recipient text,recipient_tax_id text,issued_on text,total_cents numeric,nature text,access_key text)
language sql stable security invoker set search_path='' as $$
 select i.id,i.filename,x.number,x.series,x.supplier,x.recipient,x.recipient_tax,
 left(x.issued,10),case when x.total ~ '^[0-9]+([.][0-9]+)?$' then round(x.total::numeric*100) end,
 x.nature,replace(x.key,'NFe','')
 from public.stockai_xml_inbox i
 cross join lateral xmltable(xmlnamespaces('http://www.portalfiscal.inf.br/nfe' as n),
 '/n:nfeProc/n:NFe/n:infNFe' passing
 case when i.raw_xml !~* '<!\s*(DOCTYPE|ENTITY)' and xml_is_well_formed_document(i.raw_xml)
 then xmlparse(document i.raw_xml) else null::xml end
 columns number text path 'n:ide/n:nNF',series text path 'n:ide/n:serie',
 supplier text path 'n:emit/n:xNome',recipient text path 'n:dest/n:xNome',
 recipient_tax text path 'n:dest/n:CNPJ',issued text path 'n:ide/n:dhEmi',
 total text path 'n:total/n:ICMSTot/n:vNF',nature text path 'n:ide/n:natOp',
 key text path '@Id',purpose text path 'n:ide/n:finNFe') x
 where x.purpose='4'
 order by left(x.issued,10) desc,i.id;
$$;
revoke all on function public.stockai_return_invoices() from public,anon;
grant execute on function public.stockai_return_invoices() to authenticated;
