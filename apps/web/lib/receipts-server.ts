import 'server-only';
import { z } from 'zod';
const sourceSchema = z.object({
  quantity: z.string(),
  commercialUnit: z.string(),
  code: z.string().optional(),
  name: z.string().optional(),
});
import { getStockBalances } from './stock-server';
import { serverClient } from './supabase-server';
import type { Receipt } from '@stockai/core';
export async function getWorkspace() {
  const client = await serverClient();
  const {
    data: { user },
    error: authError,
  } = await client.auth.getUser();
  if (authError || !user) throw new Error('UNAUTHENTICATED');
  async function allReceipts() {
    const page = (start: number) =>
      client
        .from('stockai_receipts')
        .select(
          '*,suppliers:stockai_suppliers(name),units:stockai_units(name,legal_name,tax_id),receipt_lines:stockai_receipt_lines(*,items:stockai_items(name,base_uom,internal_code))',
        )
        .order('reference_date', { ascending: false })
        .order('id')
        .range(start, start + 499);
    const first = await page(0);
    if (first.error) return first;
    let count = first.data.length;
    for (let start = 500; count === 500; start += 500) {
      const next = await page(start);
      if (next.error) return next;
      count = next.data.length;
      first.data.push(...next.data);
    }
    return first;
  }
  const [result, unitResult, orgResult, membershipResult, balanceResult] = await Promise.all([
    allReceipts(),
    client.from('stockai_units').select('id,name,org_id,legal_name,tax_id'),
    client.from('stockai_orgs').select('id,name'),
    client.from('stockai_memberships').select('org_id,unit_id,role,revoked_at,expires_at'),
    getStockBalances(),
  ]);
  if (result.error || unitResult.error || orgResult.error || membershipResult.error)
    throw new Error('Não foi possível carregar a operação.');
  const xmlInbox = [];
  for (let start = 0; ; start += 500) {
    const inbox = await client
      .from('stockai_xml_inbox')
      .select('id,status,unit_id')
      .order('id')
      .range(start, start + 499);
    if (inbox.error) throw new Error('Não foi possível carregar o resumo dos XMLs.');
    xmlInbox.push(...inbox.data);
    if (inbox.data.length < 500) break;
  }
  const receipts: Receipt[] = (result.data ?? []).map((r) => ({
    id: r.id,
    supplier: r.suppliers?.name ?? 'Fornecedor',
    category: r.access_key ? 'XML NF-e' : 'Cadastro manual',
    accessKey: r.access_key ?? undefined,
    invoiceSeries: r.invoice_series ?? undefined,
    invoiceTotalCents: r.invoice_total_cents ?? undefined,
    invoice: r.invoice_number,
    unit: r.units?.name ?? '',
    unitId: r.unit_id,
    companyLegalName: r.units?.legal_name ?? undefined,
    companyTaxId: r.units?.tax_id ?? undefined,
    date: r.reference_date,
    dateSource: r.reference_date_source as Receipt['dateSource'],
    time: new Date(r.created_at).toLocaleTimeString('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      hour: '2-digit',
      minute: '2-digit',
    }),
    status: r.status as Receipt['status'],
    lines: r.receipt_lines
      .filter((l) => l.is_active)
      .map((l) => ({
        id: l.id,
        itemId: l.item_id,
        internalCode: l.items?.internal_code,
        canEditCode: (membershipResult.data ?? []).some(
          (m) =>
            m.org_id === r.org_id &&
            !m.unit_id &&
            !m.revoked_at &&
            (!m.expires_at || Date.parse(m.expires_at) > Date.now()) &&
            ['owner', 'manager', 'implementer'].includes(m.role),
        ),
        supplierProductCode: sourceSchema.safeParse(l.source_data).data?.code,
        supplierProductName: sourceSchema.safeParse(l.source_data).data?.name,
        name: l.items?.name ?? 'Insumo',
        uom: l.items?.base_uom as 'KG' | 'L' | 'UN',
        invoiced: l.invoiced_qty,
        counted: l.counted_qty,
        priceCents: l.unit_price_cents,
        fiscalTotalCents: l.fiscal_total_cents ?? undefined,
        sourceQuantity: sourceSchema.safeParse(l.source_data).data?.quantity,
        sourceUnit: sourceSchema.safeParse(l.source_data).data?.commercialUnit,
      })),
  }));
  return {
    receipts,
    xmlInbox,
    stockBalances: balanceResult,
    units: unitResult.data ?? [],
    orgs: orgResult.data ?? [],
    memberships: membershipResult.data ?? [],
    email: user.email ?? '',
  };
}
