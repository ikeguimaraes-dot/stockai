import 'server-only';
import { getStockBalances } from './stock-server';
import { serverClient } from './supabase-server';
import { getCatalog } from './catalog';
import type { Order, OrderUnit } from './orders';
export async function getOrders() {
  const client = await serverClient();
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw new Error('UNAUTHENTICATED');
  const [unitResult, catalog, balances] = await Promise.all([
    client.rpc('stockai_order_units'),
    getCatalog(),
    getStockBalances(),
  ]);
  if (unitResult.error) throw new Error('Não foi possível carregar pedidos e estoque.');
  const orders: Order[] = [];
  for (let start = 0; ; start += 500) {
    const result = await client
      .from('stockai_orders')
      .select('*,lines:stockai_order_lines(*)')
      .order('created_at', { ascending: false })
      .order('id')
      .range(start, start + 499);
    if (result.error) throw new Error('Não foi possível carregar os pedidos.');
    orders.push(...result.data);
    if (result.data.length < 500) break;
  }
  return {
    orders,
    units: unitResult.data as unknown as OrderUnit[],
    items: catalog.items,
    balances: balances,
  };
}
