import { notFound, redirect } from 'next/navigation';
import { serverClient } from '@/lib/supabase-server';
import { getCatalog } from '@/lib/catalog';
import { getWorkspace } from '@/lib/receipts-server';
import { ProductProfile, type SupplierLink } from '@/components/product-profile';
export const dynamic = 'force-dynamic';
export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  let workspace;
  try {
    workspace = await getWorkspace();
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHENTICATED') redirect('/login');
    throw error;
  }
  const { items } = await getCatalog();
  const item = items.find((i) => i.id === id);
  if (!item) notFound();
  const editable = workspace.memberships.some(
    (m) =>
      m.org_id === item.org_id &&
      !m.unit_id &&
      ['owner', 'manager', 'implementer'].includes(m.role),
  );
  const c = await serverClient();
  const links: SupplierLink[] = [];
  for (let start = 0; ; start += 1000) {
    const { data, error } = await c
      .from('stockai_product_links')
      .select('*')
      .eq('org_id', item.org_id)
      .order('id')
      .range(start, start + 999);
    if (error) throw new Error('Não foi possível carregar os vínculos.');
    links.push(
      ...data.map((l) => ({ ...l, supplierName: l.supplier_tax_id, names: [] as string[] })),
    );
    if (data.length < 1000) break;
  }
  const suppliers = new Map<string, string>();
  for (let start = 0; ; start += 1000) {
    const { data, error } = await c
      .from('stockai_suppliers')
      .select('tax_id,name')
      .eq('org_id', item.org_id)
      .order('id')
      .range(start, start + 999);
    if (error) throw new Error('Não foi possível carregar os fornecedores.');
    for (const s of data) if (s.tax_id) suppliers.set(s.tax_id, s.name);
    if (data.length < 1000) break;
  }
  const byKey = new Map(
    links.map((l) => [JSON.stringify([l.supplier_tax_id, l.supplier_code, l.source_unit]), l]),
  );
  for (let start = 0; ; start += 1000) {
    const { data, error } = await c
      .from('stockai_receipt_lines')
      .select('source_data,receipt:stockai_receipts!inner(supplier:stockai_suppliers(tax_id))')
      .eq('org_id', item.org_id)
      .order('id')
      .range(start, start + 999);
    if (error) throw new Error('Não foi possível carregar os nomes das notas.');
    for (const row of data) {
      const s = row.source_data;
      if (!s || typeof s !== 'object' || Array.isArray(s)) continue;
      const l = byKey.get(
        JSON.stringify([row.receipt?.supplier?.tax_id, s.code, s.commercialUnit]),
      );
      if (l && typeof s.name === 'string' && !l.names.includes(s.name)) l.names.push(s.name);
    }
    if (data.length < 1000) break;
  }
  for (const l of links) l.supplierName = suppliers.get(l.supplier_tax_id) || l.supplier_tax_id;
  return (
    <ProductProfile
      item={item}
      items={items.filter((i) => i.org_id === item.org_id)}
      links={links}
      editable={editable}
    />
  );
}
