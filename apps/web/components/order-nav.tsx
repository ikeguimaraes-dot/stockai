import Link from 'next/link';
import { ClipboardList, Truck } from 'lucide-react';
export function OrderNav({ active }: { active?: 'orders' | 'deliveries' }) {
  return (
    <>
      <Link
        href="/pedidos"
        className={`nav-item ${active === 'orders' ? 'active' : ''}`}
        aria-current={active === 'orders' ? 'page' : undefined}
      >
        <ClipboardList size={19} />
        <span>Pedidos</span>
      </Link>
      <Link
        href="/entregas"
        className={`nav-item ${active === 'deliveries' ? 'active' : ''}`}
        aria-current={active === 'deliveries' ? 'page' : undefined}
      >
        <Truck size={19} />
        <span>Entregas</span>
      </Link>
    </>
  );
}
