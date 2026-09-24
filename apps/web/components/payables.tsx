'use client';
import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Boxes, ArrowLeft, Plus, Wallet, Search } from 'lucide-react';
import { OrderNav } from './order-nav';
import { savePayable, linkPayable, resolvePayableImport } from '@/app/contas-a-pagar/actions';
import type { Database } from '../../../packages/db/types/database';
type Bill = Database['public']['Tables']['stockai_payables']['Row'] & {
  installments: Database['public']['Tables']['stockai_payable_installments']['Row'][];
};
type ImportRow = Database['public']['Tables']['stockai_payable_import_rows']['Row'];
type Unit = { id: string; org_id: string; name: string };
type Supplier = { id: string; org_id: string; name: string };
type Part = { amount: string; due: string; paid: string; paidWithoutDate: boolean };
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
const paid = (b: Bill) =>
  b.installments.reduce((n, i) => n + (i.paid_on || i.paid_without_date ? i.amount_cents : 0), 0);
const remaining = (b: Bill) => Math.max(0, b.total_cents - paid(b));
const status = (b: Bill, today: string) =>
  b.cancelled
    ? 'Cancelada'
    : b.review_note
      ? 'Revisar'
      : b.installments.every((i) => !!i.paid_on || i.paid_without_date)
        ? 'Paga'
        : b.installments.some(
              (i) => !i.paid_on && !i.paid_without_date && i.due_on && i.due_on < today,
            )
          ? 'Vencida'
          : b.installments.some((i) => !i.due_on && !i.paid_on && !i.paid_without_date)
            ? 'Sem vencimento'
            : 'Em aberto';
export function Payables({
  bills,
  pendingImports,
  units,
  suppliers,
  today,
}: {
  bills: Bill[];
  pendingImports: ImportRow[];
  units: Unit[];
  suppliers: Supplier[];
  today: string;
}) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [unit, setUnit] = useState('');
  const [search, setSearch] = useState('');
  const [month, setMonth] = useState('');
  const [dateKind, setDateKind] = useState('due');
  const [tab, setTab] = useState('accounts');
  const [pendingId, setPendingId] = useState('');
  const [target, setTarget] = useState('');
  const [filter, setFilter] = useState('open');
  const [editing, setEditing] = useState<Bill | 'new' | null>(null);
  const [editUnit, setEditUnit] = useState('');
  const [supplier, setSupplier] = useState('');
  const [parts, setParts] = useState<Part[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [request, setRequest] = useState('');
  const dateValues = (b: Bill) =>
    dateKind === 'issued'
      ? [b.issued_on || (b.reference_month ? b.reference_month + '-01' : '')]
      : b.installments.map((i) => i.due_on || (b.reference_month ? b.reference_month + '-01' : ''));
  const inMonth = (b: Bill) =>
    !month ||
    (month === 'missing'
      ? dateValues(b).some((d) => !d)
      : dateValues(b).some((d) => d.startsWith(month)));
  const scoped = bills.filter(
    (b) => !b.merged_into_id && (!unit || b.unit_id === unit) && inMonth(b),
  );
  const pendingDates = (r: ImportRow) => {
    const d =
      r.proposed_data && typeof r.proposed_data === 'object' && !Array.isArray(r.proposed_data)
        ? r.proposed_data
        : {};
    const fallback =
      typeof d.reference_month === 'string' && d.reference_month ? d.reference_month + '-01' : '';
    if (dateKind === 'issued')
      return [typeof d.issued_on === 'string' && d.issued_on ? d.issued_on : fallback];
    return Array.isArray(d.installments)
      ? d.installments.map((p) =>
          p &&
          typeof p === 'object' &&
          !Array.isArray(p) &&
          typeof p.due_on === 'string' &&
          p.due_on
            ? p.due_on
            : fallback,
        )
      : [fallback];
  };
  const months = [
    ...new Set(
      (tab === 'pending'
        ? pendingImports
            .filter((r) => !unit || !r.unit_id || r.unit_id === unit)
            .flatMap(pendingDates)
        : bills
            .filter((b) => !b.merged_into_id && (!unit || b.unit_id === unit))
            .flatMap(dateValues)
      )
        .filter(Boolean)
        .map((d) => d.slice(0, 7)),
    ),
  ]
    .sort()
    .reverse();
  const periodParts = (b: Bill) =>
    dateKind === 'due' && month
      ? b.installments.filter((i) =>
          month === 'missing'
            ? !i.due_on && !b.reference_month
            : (i.due_on || (b.reference_month ? b.reference_month + '-01' : '')).startsWith(month),
        )
      : b.installments;
  const periodPaid = (b: Bill) =>
    periodParts(b).reduce((n, i) => n + (i.paid_on || i.paid_without_date ? i.amount_cents : 0), 0);
  const periodOpen = (b: Bill) =>
    periodParts(b).reduce(
      (n, i) => n + (!i.paid_on && !i.paid_without_date ? i.amount_cents : 0),
      0,
    );
  const billDate = (b: Bill) => {
    const ds = dateValues(b)
      .filter((d) => d && (!month || month === 'missing' || d.startsWith(month)))
      .sort();
    return ds[0] || '9999';
  };
  const active = scoped.filter((b) => !b.cancelled);
  const org = units.find((u) => u.id === editUnit)?.org_id;
  const rows = scoped.filter(
    (b) =>
      `${b.creditor_name} ${b.description} ${b.document_number ?? ''}`
        .toLocaleLowerCase('pt-BR')
        .includes(search.trim().toLocaleLowerCase('pt-BR')) &&
      (filter === 'all' ||
        (filter === 'open'
          ? !b.cancelled && (periodOpen(b) > 0 || !!b.review_note)
          : filter === 'paid'
            ? !b.cancelled &&
              !b.review_note &&
              periodParts(b).every((i) => !!i.paid_on || i.paid_without_date)
            : filter === 'late'
              ? !b.cancelled &&
                b.installments.some(
                  (i) => !i.paid_on && !i.paid_without_date && i.due_on && i.due_on < today,
                )
              : filter === 'review'
                ? !b.cancelled &&
                  (!!b.review_note ||
                    b.installments.some((i) => !i.due_on && !i.paid_on && !i.paid_without_date))
                : b.cancelled)),
  );
  rows.sort(
    (a, b) =>
      billDate(a).localeCompare(billDate(b)) ||
      a.creditor_name.localeCompare(b.creditor_name, 'pt-BR'),
  );
  function open(b: Bill | 'new') {
    setPendingId('');
    setTarget('');
    setEditing(b);
    setEditUnit(b === 'new' ? unit || units[0]?.id || '' : b.unit_id);
    setSupplier(b === 'new' ? '' : (b.supplier_id ?? ''));
    setParts(
      b === 'new'
        ? [{ amount: '', due: '', paid: '', paidWithoutDate: false }]
        : [...b.installments]
            .sort((a, c) => a.sequence - c.sequence)
            .map((i) => ({
              amount: (i.amount_cents / 100).toFixed(2),
              due: i.due_on ?? '',
              paid: i.paid_on ?? '',
              paidWithoutDate: i.paid_without_date,
            })),
    );
    setError('');
    setMessage('');
    setRequest(crypto.randomUUID());
  }
  function change(i: number, key: keyof Part, value: string | boolean) {
    setParts((p) => p.map((v, n) => (n === i ? { ...v, [key]: value } : v)));
  }
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!editing) return;
    const form = new FormData(e.currentTarget);
    setError('');
    setBusy(true);
    try {
      const payload = {
        id: editing === 'new' || pendingId ? null : editing.id,
        revision: editing === 'new' ? 0 : editing.revision,
        request,
        data: {
          unit_id: editUnit,
          supplier_id: supplier,
          creditor_name: String(form.get('creditor_name') ?? ''),
          description: String(form.get('description') ?? ''),
          issued_on: String(form.get('issued_on') ?? ''),
          document_number: String(form.get('document_number') ?? ''),
          reference_month: String(form.get('reference_month') ?? ''),
          notes: String(form.get('notes') ?? ''),
          cancelled: form.get('cancelled') === 'on',
          installments: parts.map((p) => ({
            amount_cents: cents(p.amount),
            due_on: p.due,
            paid_on: p.paid,
            paid_without_date: p.paidWithoutDate && !p.paid,
          })),
        },
      };
      const result = pendingId
        ? await resolvePayableImport(pendingId, payload)
        : await savePayable(payload);
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
  function identify(r: ImportRow) {
    const d =
      r.proposed_data && typeof r.proposed_data === 'object' && !Array.isArray(r.proposed_data)
        ? r.proposed_data
        : {};
    const text = (key: string) => (typeof d[key] === 'string' ? String(d[key]) : '');
    open('new');
    setPendingId(r.id);
    setEditUnit(r.unit_id || '');
    setSupplier(text('supplier_id'));
    setEditing({
      id: r.id,
      org_id: r.org_id,
      unit_id: r.unit_id || '',
      source: 'manual',
      on_hold: false,
      source_key: '',
      description: text('description'),
      creditor_name: text('creditor_name'),
      supplier_id: text('supplier_id') || null,
      issued_on: text('issued_on') || null,
      document_number: text('document_number') || null,
      reference_month: text('reference_month') || null,
      notes: text('notes'),
      total_cents: 0,
      revision: 0,
      cancelled: false,
      receipt_id: null,
      inbox_id: null,
      review_note: r.reason,
      created_at: r.created_at,
      updated_at: r.created_at,
      merged_into_id: null,
      import_references: [],
      installments: [],
    });
    const parts = Array.isArray(d.installments) ? d.installments : [];
    setParts(
      parts.length
        ? parts.map((v) => {
            const p = v && typeof v === 'object' && !Array.isArray(v) ? v : {};
            return {
              amount: typeof p.amount_cents === 'number' ? (p.amount_cents / 100).toFixed(2) : '',
              due: typeof p.due_on === 'string' ? p.due_on : '',
              paid: typeof p.paid_on === 'string' ? p.paid_on : '',
              paidWithoutDate: p.paid_without_date === true,
            };
          })
        : [{ amount: '', due: '', paid: '', paidWithoutDate: false }],
    );
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
            <div className="panel">
              <span className="muted">NF-e no Contas a pagar</span>
              <strong>{scoped.filter((b) => b.source === 'xml').length}</strong>
              <small>
                {scoped.filter((b) => b.source === 'xml' && b.receipt_id).length} com recebimento ·{' '}
                {scoped.filter((b) => b.source === 'xml' && !b.receipt_id).length} aguardando
                identificação
              </small>
            </div>
            {[
              ['Em aberto', money(active.reduce((n, b) => n + periodOpen(b), 0))],
              [
                'Vencido',
                money(
                  active
                    .flatMap(periodParts)
                    .filter(
                      (i) => !i.paid_on && !i.paid_without_date && i.due_on && i.due_on < today,
                    )
                    .reduce((n, i) => n + i.amount_cents, 0),
                ),
              ],
              ['Pagamentos registrados', money(active.reduce((n, b) => n + periodPaid(b), 0))],
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
          <div className="catalog-filters">
            <button
              className={tab === 'accounts' ? 'primary' : 'secondary'}
              onClick={() => setTab('accounts')}
            >
              Contas a pagar
            </button>
            <button
              className={tab === 'pending' ? 'primary' : 'secondary'}
              onClick={() => setTab('pending')}
            >
              Despesas sem identificação ({pendingImports.length})
            </button>
            <Link className="secondary" href="/devolucoes">
              NF-e de devolução
            </Link>
          </div>
          <div className="company-toolbar payable-toolbar">
            <label className="xml-field">
              Empresa
              <select
                aria-label="Empresa"
                value={unit}
                onChange={(e) => {
                  setUnit(e.target.value);
                  setMonth('');
                }}
              >
                <option value="">Todas as empresas</option>
                {units.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="xml-field">
              Data para filtrar
              <select
                aria-label="Data para filtrar"
                value={dateKind}
                onChange={(e) => {
                  setDateKind(e.target.value);
                  setMonth('');
                }}
              >
                <option value="due">Vencimento</option>
                <option value="issued">Emissão / referência</option>
              </select>
            </label>
            <label className="xml-field">
              Mês
              <select
                aria-label="Mês das contas"
                value={month}
                onChange={(e) => setMonth(e.target.value)}
              >
                <option value="">Todos os meses</option>
                {months.map((m) => (
                  <option key={m} value={m}>
                    {m.slice(5)}/{m.slice(0, 4)}
                  </option>
                ))}
                <option value="missing">Sem data</option>
              </select>
            </label>
            {tab === 'accounts' && (
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
            )}
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
          <p className="muted">
            Sem uma data de vencimento, o filtro usa o mês de referência informado. Os totais por
            mês consideram apenas as parcelas daquele período.
          </p>
          {message && <p role="status">{message}</p>}
          {!units.length && <p>Seu acesso não permite consultar o financeiro das empresas.</p>}
          <div className="payable-list">
            {tab === 'pending' &&
              pendingImports
                .filter(
                  (r) =>
                    (!unit || !r.unit_id || r.unit_id === unit) &&
                    (!month ||
                      (month === 'missing'
                        ? pendingDates(r).some((d) => !d)
                        : pendingDates(r).some((d) => d.startsWith(month)))) &&
                    JSON.stringify(r.proposed_data)
                      .toLocaleLowerCase('pt-BR')
                      .includes(search.trim().toLocaleLowerCase('pt-BR')),
                )
                .map((r) => {
                  const d =
                    r.proposed_data &&
                    typeof r.proposed_data === 'object' &&
                    !Array.isArray(r.proposed_data)
                      ? r.proposed_data
                      : {};
                  return (
                    <article className="panel payable-card" key={r.id}>
                      <div>
                        <h2>{String(d.creditor_name || 'Favorecido não identificado')}</h2>
                        <p>{String(d.description || 'Despesa da planilha')}</p>
                        <p>{r.reason}</p>
                        <p className="muted">
                          {r.file_name} · {r.sheet_name} · Linha {r.row_number}
                        </p>
                        <details>
                          <summary>Dados originais da planilha</summary>
                          <dl>
                            {r.source_data &&
                              typeof r.source_data === 'object' &&
                              !Array.isArray(r.source_data) &&
                              Object.entries(r.source_data).map(([label, value]) => (
                                <div key={label}>
                                  <dt>{label}</dt>
                                  <dd style={{ overflowWrap: 'anywhere' }}>
                                    {value === null
                                      ? 'Não informado'
                                      : typeof value === 'object'
                                        ? JSON.stringify(value)
                                        : String(value)}
                                  </dd>
                                </div>
                              ))}
                          </dl>
                        </details>
                      </div>
                      <button className="secondary" onClick={() => identify(r)}>
                        Identificar despesa
                      </button>
                    </article>
                  );
                })}
            {tab === 'accounts' &&
              rows.map((b) => (
                <article className="panel payable-card" key={b.id}>
                  <div>
                    <span className="eyebrow">
                      {b.source === 'manual'
                        ? Array.isArray(b.import_references) && b.import_references.length
                          ? 'DESPESA DA PLANILHA'
                          : 'DESPESA MANUAL'
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
                      {b.source === 'manual' &&
                        b.document_number &&
                        ` · Documento: ${b.document_number}`}
                      {b.installments.some((i) => i.due_on) &&
                        ` · Vencimento: ${date(
                          b.installments
                            .map((i) => i.due_on)
                            .filter((d): d is string => !!d)
                            .sort()[0],
                        )}`}
                      {b.issued_on && ` · Emissão: ${date(b.issued_on)}`}
                      {b.reference_month &&
                        ` · Referência da planilha: ${b.reference_month.slice(5)}/${b.reference_month.slice(0, 4)}`}
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
                  {month && (
                    <p className="payable-wide muted">
                      No período: {money(periodParts(b).reduce((n, i) => n + i.amount_cents, 0))}
                    </p>
                  )}
                  <details className="payable-wide">
                    <summary>Parcelas e vencimentos</summary>
                    {[...b.installments]
                      .sort((a, c) => a.sequence - c.sequence)
                      .map((i) => (
                        <p key={i.id}>
                          Parcela {i.sequence} · {money(i.amount_cents)} · {date(i.due_on)}
                          {i.paid_on
                            ? ` · Paga em ${date(i.paid_on)}`
                            : i.paid_without_date
                              ? ' · Paga (data não informada)'
                              : ' · Em aberto'}
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
          {tab === 'accounts' && !rows.length && (
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
                  <h2 id="payable-title">
                    {pendingId
                      ? 'Identificar despesa'
                      : editing === 'new'
                        ? 'Nova despesa'
                        : 'Editar conta'}
                  </h2>
                  <button className="secondary" disabled={busy} onClick={() => setEditing(null)}>
                    Fechar
                  </button>
                </header>
                {!pendingId &&
                  editing !== 'new' &&
                  editing.source === 'manual' &&
                  !editing.cancelled && (
                    <section className="panel">
                      <h3>Vincular a uma nota</h3>
                      <p>
                        Escolha a nota da mesma empresa. As parcelas desta despesa serão
                        transferidas para a conta da nota, sem duplicar o saldo. O fornecedor da
                        nota será mantido. Os totais precisam ser iguais.
                      </p>
                      <label className="xml-field">
                        Nota para vincular
                        <select
                          aria-label="Nota para vincular"
                          value={target}
                          onChange={(e) => setTarget(e.target.value)}
                        >
                          <option value="">Sem nota vinculada</option>
                          {bills
                            .filter(
                              (b) =>
                                b.unit_id === editing.unit_id &&
                                b.receipt_id &&
                                !b.cancelled &&
                                !b.merged_into_id,
                            )
                            .map((b) => (
                              <option key={b.id} value={b.id}>
                                NF {b.document_number} · {b.creditor_name} · {money(b.total_cents)}{' '}
                                · {date(b.issued_on)}
                              </option>
                            ))}
                        </select>
                      </label>
                      <button
                        type="button"
                        className="secondary"
                        disabled={!target || busy}
                        onClick={async () => {
                          const t = bills.find((b) => b.id === target);
                          if (!t) return;
                          setBusy(true);
                          setError('');
                          try {
                            const r = await linkPayable(
                              editing.id,
                              t.id,
                              editing.revision,
                              t.revision,
                            );
                            if (r.error) setError(r.error);
                            else {
                              setEditing(null);
                              setMessage(
                                'Despesa vinculada à nota. Conta unificada sem duplicar o saldo.',
                              );
                              router.refresh();
                            }
                          } catch {
                            setError('Não foi possível vincular. Tente novamente.');
                          } finally {
                            setBusy(false);
                          }
                        }}
                      >
                        Vincular e unificar conta
                      </button>
                    </section>
                  )}
                {pendingId && (
                  <section className="panel">
                    <p>
                      Complete os dados para lançar ou selecione uma conta já existente para evitar
                      duplicação.
                    </p>
                    <label className="xml-field">
                      Conta já existente
                      <select value={target} onChange={(e) => setTarget(e.target.value)}>
                        <option value="">Criar uma nova conta</option>
                        {bills
                          .filter(
                            (b) => b.unit_id === editUnit && !b.cancelled && !b.merged_into_id,
                          )
                          .map((b) => (
                            <option value={b.id} key={b.id}>
                              {b.creditor_name} · {b.description} · {money(b.total_cents)}
                            </option>
                          ))}
                      </select>
                    </label>
                    <button
                      type="button"
                      className="secondary"
                      disabled={!target || busy || !editUnit}
                      onClick={async () => {
                        setBusy(true);
                        try {
                          const r = await resolvePayableImport(
                            pendingId,
                            { data: { unit_id: editUnit } },
                            target,
                          );
                          if (r.error) setError(r.error);
                          else {
                            setEditing(null);
                            setMessage('Despesa identificada na conta existente, sem duplicar.');
                            router.refresh();
                          }
                        } catch {
                          setError('Não foi possível identificar.');
                        } finally {
                          setBusy(false);
                        }
                      }}
                    >
                      Vincular à conta existente
                    </button>
                  </section>
                )}
                <form onSubmit={submit}>
                  <fieldset disabled={busy} className="payable-form">
                    <label className="xml-field">
                      Empresa
                      <select
                        aria-label="Empresa"
                        value={editUnit}
                        disabled={!manual}
                        onChange={(e) => {
                          setEditUnit(e.target.value);
                          setSupplier('');
                        }}
                        required
                      >
                        {pendingId && <option value="">Selecione a empresa</option>}
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
                      Data de emissão / entrada
                      <input
                        type="date"
                        name="issued_on"
                        readOnly={!manual}
                        defaultValue={editing === 'new' ? today : (editing.issued_on ?? '')}
                      />
                    </label>
                    {manual && (
                      <>
                        <label className="xml-field">
                          Número da nota / documento
                          <input
                            name="document_number"
                            maxLength={60}
                            defaultValue={editing === 'new' ? '' : (editing.document_number ?? '')}
                          />
                        </label>
                        <label className="xml-field">
                          Mês de referência (quando não houver data)
                          <input
                            type="month"
                            name="reference_month"
                            defaultValue={editing === 'new' ? '' : (editing.reference_month ?? '')}
                          />
                        </label>
                      </>
                    )}
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
                            disabled={p.paidWithoutDate}
                            onChange={(e) => change(i, 'paid', e.target.value)}
                          />
                        </label>
                        <label className="xml-field">
                          <span>Pago sem data informada</span>
                          <input
                            type="checkbox"
                            aria-label={`Parcela ${i + 1} paga sem data`}
                            checked={p.paidWithoutDate}
                            onChange={(e) => {
                              change(i, 'paidWithoutDate', e.target.checked);
                              if (e.target.checked) change(i, 'paid', '');
                            }}
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
                      onClick={() =>
                        setParts((v) => [
                          ...v,
                          { amount: '', due: '', paid: '', paidWithoutDate: false },
                        ])
                      }
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
                    {!pendingId && editing !== 'new' && (
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
                      {busy ? 'Salvando…' : pendingId ? 'Identificar e lançar' : 'Salvar conta'}
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
