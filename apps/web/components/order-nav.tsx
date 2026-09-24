import Link from 'next/link';
import { ClipboardList, Truck, ScanLine, Wallet } from 'lucide-react';
export function OrderNav({
  active,
}: {
  active?: 'orders' | 'deliveries' | 'identification' | 'payables' | 'returns';
}) {
  return (
    <>
      <Link
        href="/devolucoes"
        className={`nav-item ${active === 'returns' ? 'active' : ''}`}
        aria-current={active === 'returns' ? 'page' : undefined}
      >
        <ClipboardList size={19} />
        <span>NF-e de devolução</span>
      </Link>
      <Link
        href="/contas-a-pagar"
        className={`nav-item ${active === 'payables' ? 'active' : ''}`}
        aria-current={active === 'payables' ? 'page' : undefined}
      >
        <Wallet size={19} />
        <span>Contas a pagar</span>
      </Link>
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
