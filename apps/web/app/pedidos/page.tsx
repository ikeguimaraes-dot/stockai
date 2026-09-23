import { redirect } from 'next/navigation';
import { getOrders } from '@/lib/orders-server';
import { OrderDirectory } from '@/components/orders';
export const dynamic = 'force-dynamic';
export default async function Orders() {
  try {
    return <OrderDirectory {...await getOrders()} mode="orders" />;
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHENTICATED') redirect('/login');
    throw error;
  }
}
