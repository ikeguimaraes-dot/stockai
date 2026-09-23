import type { Database } from '../../../packages/db/types/database';
export type Order = Database['public']['Tables']['stockai_orders']['Row'] & {
  lines: Database['public']['Tables']['stockai_order_lines']['Row'][];
};
export type OrderUnit = {
  id: string;
  org_id: string;
  name: string;
  can_request: boolean;
  can_dispatch: boolean;
};
export type StockBalance =
  Database['public']['Functions']['stockai_stock_balances']['Returns'][number];
export type Signature = number[][][];
export const orderStatuses: Record<string, string> = {
  requested: 'Solicitado',
  dispatched: 'Em entrega',
  delivered: 'Entregue',
  cancelled: 'Cancelado',
};
export const orderDate = (date: string) =>
  new Date(date).toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    dateStyle: 'short',
    timeStyle: 'short',
  });
