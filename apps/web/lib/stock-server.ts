import 'server-only';
import { serverClient } from './supabase-server';
import type { StockBalance } from './orders';
export async function getStockBalances() {
  const client = await serverClient();
  const balances: StockBalance[] = [];
  for (let start = 0; ; start += 1000) {
    const { data, error } = await client
      .rpc('stockai_stock_balances')
      .order('unit_id')
      .order('item_id')
      .range(start, start + 999);
    if (error) throw new Error('Não foi possível carregar os saldos do estoque.');
    balances.push(...data);
    if (data.length < 1000) break;
  }
  return balances;
}
