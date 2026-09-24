import 'server-only';
import { serverClient } from './supabase-server';
export async function getSuppliers() {
  const c = await serverClient();
  const rows = [];
  for (let start = 0; ; start += 500) {
    const r = await c
      .from('stockai_suppliers')
      .select('id,org_id,name,tax_id,aliases,reference_labels,source_name,review_note')
      .order('id')
      .range(start, start + 499);
    if (r.error) throw new Error('Não foi possível carregar os fornecedores.');
    rows.push(...r.data);
    if (r.data.length < 500) break;
  }
  return rows.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
}
