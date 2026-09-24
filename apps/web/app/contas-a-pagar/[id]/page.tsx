import Link from 'next/link';
import type { Json } from '../../../../../packages/db/types/database';
import { notFound, redirect } from 'next/navigation';
import { serverClient } from '@/lib/supabase-server';
function snapshot(value: Json | null) {
  const data = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const bill =
    data.bill && typeof data.bill === 'object' && !Array.isArray(data.bill) ? data.bill : data;
  const installments = Array.isArray(data.installments) ? data.installments : [];
  const currency = (v: Json | undefined) =>
    typeof v === 'number'
      ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v / 100)
      : '—';
  return (
    <div>
      <p>Total: {currency(bill.total_cents)}</p>
      {typeof bill.description === 'string' && <p>{bill.description}</p>}
      {typeof bill.notes === 'string' && bill.notes && <p>Observações: {bill.notes}</p>}
      {installments.map((part, i) => {
        if (!part || typeof part !== 'object' || Array.isArray(part)) return null;
        return (
          <p key={i}>
            Parcela {i + 1}: {currency(part.amount_cents)} · Vencimento:{' '}
            {typeof part.due_on === 'string'
              ? part.due_on.split('-').reverse().join('/')
              : 'Não informado'}{' '}
            ·{' '}
            {typeof part.paid_on === 'string' && part.paid_on
              ? `Paga em ${part.paid_on.split('-').reverse().join('/')}`
              : part.paid_without_date
                ? 'Paga (data não informada)'
                : 'Em aberto'}
          </p>
        );
      })}
    </div>
  );
}
export const dynamic = 'force-dynamic';
export default async function PayableHistory({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const c = await serverClient();
  const {
    data: { user },
  } = await c.auth.getUser();
  if (!user) redirect('/login');
  const { data: bill, error } = await c
    .from('stockai_payables')
    .select('id,description,creditor_name')
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error('Falha ao consultar a conta.');
  if (!bill) notFound();
  const { data: events, error: eventsError } = await c
    .from('stockai_payable_events')
    .select('*')
    .eq('payable_id', id)
    .order('created_at', { ascending: false })
    .limit(100);
  if (eventsError) throw new Error('Falha ao consultar o histórico.');
  return (
    <main className="payable-history">
      <Link href="/contas-a-pagar" className="secondary">
        ← Contas a pagar
      </Link>
      <h1>{bill.description}</h1>
      <p>{bill.creditor_name}</p>
      <h2>Histórico de alterações</h2>
      <p className="muted">
        Últimos 100 registros. As versões anteriores e os pagamentos ficam preservados.
      </p>
      {events.map((e) => (
        <article className="panel" key={e.id}>
          <strong>
            {{
              created_from_document: 'Conta gerada pela nota',
              document_updated: 'Dados da nota atualizados',
              manual_created: 'Despesa criada',
              edited: 'Conta / pagamentos atualizados',
              expense_linked: 'Despesa vinculada à nota',
              merged_into_invoice: 'Conta unificada com a nota',
              spreadsheet_import: 'Importação da planilha',
              spreadsheet_review_required: 'Despesa encaminhada para identificação',
            }[e.kind] ?? e.kind}
          </strong>
          <p>{new Date(e.created_at).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}</p>
          <details>
            <summary>Dados registrados</summary>
            {e.before_data && (
              <>
                <h3>Antes</h3>
                {snapshot(e.before_data)}
              </>
            )}
            <h3>Depois</h3>
            {snapshot(e.after_data)}
          </details>
        </article>
      ))}
    </main>
  );
}
