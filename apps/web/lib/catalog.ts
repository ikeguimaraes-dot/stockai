import 'server-only';
import { serverClient } from './supabase-server';
import type { Database } from '../../../packages/db/types/database';
export async function getCatalog() {
  const client = await serverClient();
  const items: Database['public']['Tables']['stockai_items']['Row'][] = [];
  const categories: Database['public']['Tables']['stockai_product_categories']['Row'][] = [];
  for (let start = 0; ; start += 1000) {
    const { data, error } = await client
      .from('stockai_items')
      .select('*')
      .order('id')
      .range(start, start + 999);
    if (error) throw new Error('Não foi possível carregar os produtos.');
    items.push(...data);
    if (data.length < 1000) break;
  }
  for (let start = 0; ; start += 1000) {
    const { data, error } = await client
      .from('stockai_product_categories')
      .select('*')
      .order('id')
      .range(start, start + 999);
    if (error) throw new Error('Não foi possível carregar as categorias.');
    categories.push(...data);
    if (data.length < 1000) break;
  }
  return {
    items: items.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')),
    categories: categories.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')),
  };
}
