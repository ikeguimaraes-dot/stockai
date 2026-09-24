import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Boxes } from 'lucide-react';
import { serverClient } from '@/lib/supabase-server';
import { OrderNav } from '@/components/order-nav';
export const dynamic = 'force-dynamic';
export default async function ReturnsPage() {
  const c = await serverClient();
  const {
    data: { user },
  } = await c.auth.getUser();
  if (!user) redirect('/login');
  const rows = [];
  for (let start = 0; ; start += 300) {
    const result = await c.rpc('stockai_return_invoices').range(start, start + 299);
    if (result.error) throw new Error('Não foi possível carregar as devoluções.');
    rows.push(...result.data);
    if (result.data.length < 300) break;
  }
  return (
    <div className="shell company-directory">
      <aside className="sidebar">
        <Link className="brand" href="/operacao">
          <Boxes /> stock<span>ai</span>
        </Link>
        <nav aria-label="Navegação principal">
          <OrderNav active="returns" />
        </nav>
      </aside>
      <div className="main-shell">
        <main className="payables-main">
          <Link className="payables-back" href="/operacao">
            ← Voltar à operação
          </Link>
          <header className="page-heading">
            <div>
              <p className="eyebrow">DOCUMENTOS FISCAIS</p>
              <h1>NF-e de devolução</h1>
              <p>{rows.length} nota(s) identificada(s) como devolução no XML.</p>
            </div>
          </header>
          <div className="catalog-filters">
            <Link className="secondary" href="/contas-a-pagar">
              Contas a pagar
            </Link>
            <Link className="primary" href="/devolucoes" aria-current="page">
              Devoluções ({rows.length})
            </Link>
            <Link className="secondary" href="/identificacao">
              Identificação
            </Link>
          </div>
          <p className="muted">
            Estas notas ficam separadas das compras. A listagem não gera estoque, nova conta a pagar
            ou baixa automática. O crédito ou abatimento deve ser conferido com o fornecedor.
          </p>
          <section className="company-grid" aria-label="Notas de devolução">
            {rows.map((r) => (
              <article className="panel" key={r.id} style={{ padding: 24 }}>
                <h2>
                  NF-e {r.invoice_number} · Série {r.invoice_series}
                </h2>
                <p>
                  <strong>{r.supplier}</strong>
                </p>
                <p>
                  Destinatário: {r.recipient} · CNPJ {r.recipient_tax_id}
                </p>
                <p>Emissão: {r.issued_on?.split('-').reverse().join('/') || 'Não informada'}</p>
                <p>
                  Valor:{' '}
                  {r.total_cents == null
                    ? 'Não informado'
                    : new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
                        r.total_cents / 100,
                      )}
                </p>
                <p>Natureza informada: {r.nature}</p>
                <p className="muted">Finalidade fiscal: devolução (código 4).</p>
                <a className="secondary" href={`/api/xml-inbox?id=${r.id}&download=1`}>
                  Baixar XML original
                </a>
              </article>
            ))}
            {rows.length === 0 && <p>Nenhuma NF-e de devolução enviada.</p>}
          </section>
        </main>
      </div>
    </div>
  );
}
