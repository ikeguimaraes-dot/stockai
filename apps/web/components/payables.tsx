'use client';
import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Boxes, ArrowLeft, Plus, Wallet, Search } from 'lucide-react';
import { OrderNav } from './order-nav';
import { savePayable } from '@/app/contas-a-pagar/actions';
import type { Database } from '../../../packages/db/types/database';
type Bill = Database['public']['Tables']['stockai_payables']['Row'] & {
  installments: Database['public']['Tables']['stockai_payable_installments']['Row'][];
};
type Unit = { id: string; org_id: string; name: string };
type Supplier = { id: string; org_id: string; name: string };
type Part = { amount: string; due: string; paid: string };
const money = (n: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n / 100);
const date = (s: string | null) => (s ? s.split('-').reverse().join('/') : 'Sem vencimento');
const cents = (s: string) => {
  const v = s.trim().replace(',', '.');
  if (!/^\d{1,12}(\.\d{1,2})?$/.test(v))
    throw new Error('Use valores como 150,00, sem separador de milhar.');
  const [a, b = ''] = v.split('.');
  return Number(a) * 100 + Number(b.padEnd(2, '0'));
};
const paid = (b: Bill) => b.installments.reduce((n, i) => n + (i.paid_on ? i.amount_cents : 0), 0);
const remaining = (b: Bill) => Math.max(0, b.total_cents - paid(b));
const status = (b: Bill, today: string) =>
  b.cancelled
    ? 'Cancelada'
    : b.review_note
      ? 'Revisar'
      : b.installments.every((i) => !!i.paid_on)
        ? 'Paga'
        : b.installments.some((i) => !i.paid_on && i.due_on && i.due_on < today)
          ? 'Vencida'
          : b.installments.some((i) => !i.due_on && !i.paid_on)
            ? 'Sem vencimento'
            : 'Em aberto';
export function Payables({
  bills,
  units,
  suppliers,
  today,
}: {
  bills: Bill[];
  units: Unit[];
  suppliers: Supplier[];
  today: string;
}) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [unit, setUnit] = useState('');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('open');
  const [editing, setEditing] = useState<Bill | 'new' | null>(null);
  const [editUnit, setEditUnit] = useState('');
  const [supplier, setSupplier] = useState('');
  const [parts, setParts] = useState<Part[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [request, setRequest] = useState('');
  const scoped = bills.filter((b) => !unit || b.unit_id === unit);
  const active = scoped.filter((b) => !b.cancelled);
  const org = units.find((u) => u.id === editUnit)?.org_id;
  const rows = scoped.filter(
    (b) =>
      `${b.creditor_name} ${b.description} ${b.document_number ?? ''}`
        .toLocaleLowerCase('pt-BR')
        .includes(search.trim().toLocaleLowerCase('pt-BR')) &&
      (filter === 'all' ||
        (filter === 'open'
          ? !b.cancelled && (remaining(b) > 0 || !!b.review_note)
          : filter === 'paid'
            ? !b.cancelled && status(b, today) === 'Paga'
            : filter === 'late'
              ? !b.cancelled &&
                b.installments.some((i) => !i.paid_on && i.due_on && i.due_on < today)
              : filter === 'review'
                ? !b.cancelled &&
                  (!!b.review_note || b.installments.some((i) => !i.due_on && !i.paid_on))
                : b.cancelled)),
  );
  function open(b: Bill | 'new') {
    setEditing(b);
    setEditUnit(b === 'new' ? unit || units[0]?.id || '' : b.unit_id);
    setSupplier(b === 'new' ? '' : (b.supplier_id ?? ''));
    setParts(
      b === 'new'
        ? [{ amount: '', due: '', paid: '' }]
        : [...b.installments]
            .sort((a, c) => a.sequence - c.sequence)
            .map((i) => ({
              amount: (i.amount_cents / 100).toFixed(2),
              due: i.due_on ?? '',
              paid: i.paid_on ?? '',
            })),
    );
    setError('');
    setMessage('');
    setRequest(crypto.randomUUID());
  }
  function change(i: number, key: keyof Part, value: string) {
    setParts((p) => p.map((v, n) => (n === i ? { ...v, [key]: value } : v)));
  }
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!editing) return;
    const form = new FormData(e.currentTarget);
    setError('');
    setBusy(true);
    try {
      const result = await savePayable({
        id: editing === 'new' ? null : editing.id,
        revision: editing === 'new' ? 0 : editing.revision,
        request,
        data: {
          unit_id: editUnit,
          supplier_id: supplier,
          creditor_name: String(form.get('creditor_name') ?? ''),
          description: String(form.get('description') ?? ''),
          issued_on: String(form.get('issued_on') ?? ''),
          notes: String(form.get('notes') ?? ''),
          cancelled: form.get('cancelled') === 'on',
          installments: parts.map((p) => ({
            amount_cents: cents(p.amount),
            due_on: p.due,
            paid_on: p.paid,
          })),
        },
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      setEditing(null);
      setMessage('Conta salva com sucesso.');
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível salvar.');
    } finally {
      setBusy(false);
    }
  }
  const manual = editing === 'new' || editing?.source === 'manual';
  useEffect(() => {
    if (editing) dialogRef.current?.showModal();
  }, [editing]);
  return (
    <div className="shell company-directory">
      <aside className="sidebar">
        <Link href="/operacao" className="brand">
          <span className="brand-icon">
            <Boxes size={25} />
          </span>
          stock<span>ai</span>
        </Link>
        <span className="nav-label">SUA OPERAÇÃO</span>
        <nav aria-label="Navegação principal">
          <Link className="nav-item" href="/operacao">
            <ArrowLeft size={18} />
            Visão geral
          </Link>
          <Link className="nav-item" href="/fornecedores">
            Fornecedores
          </Link>
          <OrderNav active="payables" />
        </nav>
      </aside>
      <div className="main-shell">
        <main className="payables-main">
          <Link href="/operacao" className="payables-back">
            ← Voltar à operação
          </Link>
          <header className="page-heading">
            <div>
              <p className="eyebrow">FINANCEIRO</p>
              <h1>Contas a pagar</h1>
              <p className="muted">Notas e despesas, com ou sem CNPJ, no mesmo lugar.</p>
            </div>
            <button className="primary" disabled={!units.length} onClick={() => open('new')}>
              <Plus size={17} />
              Nova despesa
            </button>
          </header>
          <div className="payable-stats">
            {[
              ['Em aberto', money(active.reduce((n, b) => n + remaining(b), 0))],
              [
                'Vencido',
                money(
                  active
                    .flatMap((b) => b.installments)
                    .filter((i) => !i.paid_on && i.due_on && i.due_on < today)
                    .reduce((n, i) => n + i.amount_cents, 0),
                ),
              ],
              ['Pagamentos registrados', money(active.reduce((n, b) => n + paid(b), 0))],
            ].map(([label, value]) => (
              <div className="panel" key={label}>
                <span className="muted">{label}</span>
                <strong>{value}</strong>
              </div>
            ))}
          </div>
          <p className="muted">
            As notas geram contas automaticamente, inclusive durante a identificação dos produtos.
            Registre a baixa somente depois de confirmar o pagamento.
          </p>
          <div className="company-toolbar payable-toolbar">
            <label className="xml-field">
              Empresa
              <select aria-label="Empresa" value={unit} onChange={(e) => setUnit(e.target.value)}>
                <option value="">Todas as empresas</option>
                {units.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="xml-field">
              Situação
              <select
                aria-label="Situação"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              >
                <option value="open">Em aberto</option>
                <option value="late">Vencidas</option>
                <option value="review">Revisar / sem vencimento</option>
                <option value="paid">Pagas</option>
                <option value="cancelled">Canceladas</option>
                <option value="all">Todas</option>
              </select>
            </label>
            <label className="search">
              <Search size={17} />
              <input
                aria-label="Buscar conta"
                placeholder="Fornecedor, descrição ou nota"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </label>
          </div>
          {message && <p role="status">{message}</p>}
          {!units.length && <p>Seu acesso não permite consultar o financeiro das empresas.</p>}
          <div className="payable-list">
            {rows.map((b) => (
              <article className="panel payable-card" key={b.id}>
                <div>
                  <span className="eyebrow">
                    {b.source === 'manual'
                      ? 'DESPESA MANUAL'
                      : b.source === 'xml'
                        ? 'NOTA XML'
                        : 'RECEBIMENTO'}
                  </span>
                  <h2>{b.creditor_name}</h2>
                  <p>
                    {b.description} · {units.find((u) => u.id === b.unit_id)?.name}
                  </p>
                  <p className="muted">
                    {b.installments.length} parcela(s) · {status(b, today)}
                  </p>
                  {b.review_note && <p className="supplier-review-note">{b.review_note}</p>}
                </div>
                <div className="payable-amount">
                  <strong>{money(b.total_cents)}</strong>
                  <span className="muted">Saldo: {money(remaining(b))}</span>
                  <button className="secondary" onClick={() => open(b)}>
                    Abrir conta
                  </button>
                </div>
                <details className="payable-wide">
                  <summary>Parcelas e vencimentos</summary>
                  {[...b.installments]
                    .sort((a, c) => a.sequence - c.sequence)
                    .map((i) => (
                      <p key={i.id}>
                        Parcela {i.sequence} · {money(i.amount_cents)} · {date(i.due_on)}
                        {i.paid_on ? ` · Paga em ${date(i.paid_on)}` : ' · Em aberto'}
                      </p>
                    ))}
                </details>
                {b.receipt_id ? (
                  <Link href={`/notas/${b.receipt_id}`}>Ver nota de origem →</Link>
                ) : b.inbox_id ? (
                  <Link href="/identificacao">Produtos aguardando identificação →</Link>
                ) : null}
              </article>
            ))}
          </div>
          {!rows.length && (
            <div className="catalog-empty">
              <Wallet size={28} />
              <p>Nenhuma conta nesta seleção.</p>
            </div>
          )}
          {editing && (
            <dialog
              ref={dialogRef}
              className="dialog payable-modal"
              aria-labelledby="payable-title"
              onCancel={(e) => {
                e.preventDefault();
                if (!busy) setEditing(null);
              }}
            >
              <section className="payable-modal-content">
                <header>
                  <h2 id="payable-title">{editing === 'new' ? 'Nova despesa' : 'Editar conta'}</h2>
                  <button className="secondary" disabled={busy} onClick={() => setEditing(null)}>
                    Fechar
                  </button>
                </header>
                <form onSubmit={submit}>
                  <fieldset disabled={busy} className="payable-form">
                    <label className="xml-field">
                      Empresa
                      <select
                        value={editUnit}
                        disabled={!manual}
                        onChange={(e) => {
                          setEditUnit(e.target.value);
                          setSupplier('');
                        }}
                        required
                      >
                        {units.map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="xml-field">
                      Fornecedor cadastrado
                      <select
                        value={supplier}
                        disabled={!manual}
                        onChange={(e) => setSupplier(e.target.value)}
                      >
                        <option value="">Informar favorecido sem cadastro</option>
                        {suppliers
                          .filter((s) => s.org_id === org)
                          .map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.name}
                            </option>
                          ))}
                      </select>
                    </label>
                    <label className="xml-field">
                      Favorecido (sem CNPJ obrigatório)
                      <input
                        key={supplier || 'free-creditor'}
                        name="creditor_name"
                        required={!supplier}
                        readOnly={!manual || !!supplier}
                        maxLength={120}
                        defaultValue={
                          supplier
                            ? (suppliers.find((s) => s.id === supplier)?.name ??
                              (editing === 'new' ? '' : editing.creditor_name))
                            : editing === 'new'
                              ? ''
                              : editing.creditor_name
                        }
                      />
                    </label>
                    <label className="xml-field">
                      Descrição
                      <input
                        name="description"
                        required
                        maxLength={200}
                        defaultValue={editing === 'new' ? '' : editing.description}
                      />
                    </label>
                    <label className="xml-field">
                      Data de emissão
                      <input
                        type="date"
                        name="issued_on"
                        readOnly={!manual}
                        defaultValue={editing === 'new' ? today : (editing.issued_on ?? '')}
                      />
                    </label>
                    <div className="payable-wide">
                      <h3>Parcelas e pagamentos</h3>
                      {!manual && (
                        <p>
                          Total da nota: <strong>{money(editing.total_cents)}</strong>. A soma das
                          parcelas deve corresponder a esse valor.
                        </p>
                      )}
                      <p className="muted">
                        Sem vencimento no documento? Deixe em branco para completar depois. Preencha
                        a data de pagamento apenas para valores já pagos.
                      </p>
                    </div>
                    {parts.map((p, i) => (
                      <div className="payable-part payable-wide" key={i}>
                        <strong>Parcela {i + 1}</strong>
                        <label className="xml-field">
                          Valor (R$)
                          <input
                            aria-label={`Valor da parcela ${i + 1}`}
                            inputMode="decimal"
                            required
                            value={p.amount}
                            onChange={(e) => change(i, 'amount', e.target.value)}
                          />
                        </label>
                        <label className="xml-field">
                          Vencimento
                          <input
                            aria-label={`Vencimento da parcela ${i + 1}`}
                            type="date"
                            value={p.due}
                            onChange={(e) => change(i, 'due', e.target.value)}
                          />
                        </label>
                        <label className="xml-field">
                          Data do pagamento
                          <input
                            aria-label={`Pagamento da parcela ${i + 1}`}
                            type="date"
                            max={today}
                            value={p.paid}
                            onChange={(e) => change(i, 'paid', e.target.value)}
                          />
                        </label>
                        <button
                          type="button"
                          className="secondary"
                          disabled={parts.length === 1}
                          onClick={() => setParts((v) => v.filter((_, n) => n !== i))}
                        >
                          Remover parcela {i + 1}
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      className="secondary payable-wide"
                      disabled={parts.length >= 120}
                      onClick={() => setParts((v) => [...v, { amount: '', due: '', paid: '' }])}
                    >
                      Adicionar parcela
                    </button>
                    <label className="xml-field payable-wide">
                      Observações / motivo de alteração
                      <textarea
                        name="notes"
                        rows={3}
                        maxLength={4000}
                        defaultValue={editing === 'new' ? '' : editing.notes}
                      />
                    </label>
                    <label className="payable-wide">
                      <input
                        type="checkbox"
                        name="cancelled"
                        defaultChecked={editing !== 'new' && editing.cancelled}
                      />{' '}
                      Conta cancelada (informe o motivo)
                    </label>
                    {editing !== 'new' && (
                      <Link href={`/contas-a-pagar/${editing.id}`} className="payable-wide">
                        Ver histórico de alterações →
                      </Link>
                    )}
                    {error && (
                      <p role="alert" className="payable-wide">
                        {error}
                      </p>
                    )}
                    <button className="primary payable-wide" disabled={busy}>
                      {busy ? 'Salvando…' : 'Salvar conta'}
                    </button>
                  </fieldset>
                </form>
              </section>
            </dialog>
          )}
        </main>
      </div>
    </div>
  );
}
