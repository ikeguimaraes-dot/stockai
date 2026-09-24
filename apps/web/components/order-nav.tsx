import Link from 'next/link';
import { ClipboardList, Truck, ScanLine } from 'lucide-react';
export function OrderNav({ active }: { active?: 'orders' | 'deliveries' | 'identification' }) {
  return (
    <>
      <Link
        href="/identificacao"
        aria-current={active === 'identification' ? 'page' : undefined}
        className={`nav-item ${active === 'identification' ? 'active' : ''}`}
      >
        <ScanLine size={19} />
        <span>Identificação</span>
      </Link>
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
