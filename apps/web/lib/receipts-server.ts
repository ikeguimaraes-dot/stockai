import 'server-only';
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
  const [result, unitResult, orgResult, membershipResult, balanceResult] = await Promise.all([
    client
      .from('stockai_receipts')
      .select(
        '*,suppliers:stockai_suppliers(name),units:stockai_units(name,legal_name,tax_id),receipt_lines:stockai_receipt_lines(*,items:stockai_items(name,base_uom))',
      )
      .order('created_at', { ascending: false })
      .limit(500),
    client.from('stockai_units').select('id,name,org_id,legal_name,tax_id'),
    client.from('stockai_orgs').select('id,name'),
    client.from('stockai_memberships').select('org_id,unit_id,role'),
    getStockBalances(),
  ]);
  if (result.error || unitResult.error || orgResult.error || membershipResult.error)
    throw new Error('Não foi possível carregar a operação.');
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
    date: new Date(r.created_at).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }),
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
        name: l.items?.name ?? 'Insumo',
        uom: l.items?.base_uom as 'KG' | 'L' | 'UN',
        invoiced: l.invoiced_qty,
        counted: l.counted_qty,
        priceCents: l.unit_price_cents,
        fiscalTotalCents: l.fiscal_total_cents ?? undefined,
      })),
  }));
  return {
    receipts,
    stockBalances: balanceResult,
    units: unitResult.data ?? [],
    orgs: orgResult.data ?? [],
    memberships: membershipResult.data ?? [],
    email: user.email ?? '',
  };
}
