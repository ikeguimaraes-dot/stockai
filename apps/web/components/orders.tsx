'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Boxes,
  LayoutDashboard,
  Building2,
  Package,
  Plus,
  ArrowLeft,
  Truck,
  ClipboardList,
  Printer,
  Trash2,
  CheckCircle2,
} from 'lucide-react';
import { saveOrder } from '@/app/pedidos/actions';
import {
  orderDate,
  orderStatuses,
  type Order,
  type OrderUnit,
  type Signature,
  type StockBalance,
} from '@/lib/orders';
import type { Database } from '../../../packages/db/types/database';
import { OrderNav } from './order-nav';
import { SignatureDrawing } from './signature';
type Item = Database['public']['Tables']['stockai_items']['Row'];
const number = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 4 });
export function OrderDirectory({
  orders,
  units,
  items,
  balances,
  mode,
}: {
  orders: Order[];
  units: OrderUnit[];
  items: Item[];
  balances: StockBalance[];
  mode: 'orders' | 'deliveries';
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [filter, setFilter] = useState(mode === 'orders' ? 'all' : 'dispatched');
  const [company, setCompany] = useState('');
  const [search, setSearch] = useState('');
  const [destination, setDestination] = useState(units.find((u) => u.can_request)?.id ?? '');
  const [source, setSource] = useState('');
  const [request, setRequest] = useState('');
  const [lines, setLines] = useState([{ item_id: '', quantity: 1 }]);
  const [signature, setSignature] = useState<Signature>([]);
  const [cancelPrompt, setCancelPrompt] = useState(false);
  const order = orders.find((o) => o.id === selected);
  const dst = units.find((u) => u.id === destination);
  const requestUnits = units.filter((u) => u.can_request);
  const allowedSource = order && units.find((u) => u.id === order.source_id)?.can_dispatch;
  const allowedDestination = order && units.find((u) => u.id === order.destination_id)?.can_request;
  const list = orders.filter(
    (o) =>
      (filter === 'all' || o.status === filter) &&
      (!company || o.destination_id === company || o.source_id === company) &&
      `${o.id} ${o.kitchen} ${o.destination_name} ${o.source_name}`
        .toLocaleLowerCase('pt-BR')
        .includes(search.toLocaleLowerCase('pt-BR')),
  );
  async function submit(input: Parameters<typeof saveOrder>[0], message: string) {
    setBusy(true);
    setError('');
    setSuccess('');
    try {
      const result = await saveOrder(input);
      if (result.error) {
        setError(result.error);
        return;
      }
      setCreating(false);
      setCancelPrompt(false);
      setSuccess(message);
      router.refresh();
    } catch {
      setError('Não foi possível salvar. Tente novamente.');
    } finally {
      setBusy(false);
    }
  }
  function open(o: Order) {
    setSelected(o.id);
    setCreating(false);
    setSignature([]);
    setError('');
    setSuccess('');
    setCancelPrompt(false);
  }
  return (
    <div className="shell company-directory orders-directory">
      <aside className="sidebar">
        <Link href="/operacao" className="brand">
          <span className="brand-icon">
            <Boxes size={25} />
          </span>
          stock<span>ai</span>
          <i />
        </Link>
        <span className="nav-label">SUA OPERAÇÃO</span>
        <nav aria-label="Navegação principal">
          <Link href="/operacao" className="nav-item">
            <LayoutDashboard size={19} />
            Visão geral
          </Link>
          <OrderNav active={mode} />
          <Link href="/produtos" className="nav-item">
            <Package size={19} />
            Produtos
          </Link>
          <Link href="/empresas" className="nav-item">
            <Building2 size={19} />
            Empresas
          </Link>
        </nav>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <Link href="/operacao" className="text-button">
            <ArrowLeft size={16} />
            Voltar à operação
          </Link>
          <span>Cozinha / {mode === 'orders' ? 'Pedidos' : 'Entregas'}</span>
        </header>
        <main>
          <div className="page-heading">
            <div>
              <div className="eyebrow">DA COZINHA AO ESTOQUE</div>
              <h1>{mode === 'orders' ? 'Pedidos das cozinhas' : 'Entregas e assinaturas'}</h1>
              <p>
                {mode === 'orders'
                  ? 'Solicite produtos e acompanhe cada pedido até o recebimento.'
                  : 'Confira os produtos entregues e registre quem recebeu no restaurante.'}
              </p>
            </div>
            {requestUnits.length > 0 && (
              <button
                className="primary"
                disabled={busy}
                onClick={() => {
                  setCreating(true);
                  setSelected(null);
                  setError('');
                  setSuccess('');
                  setRequest(crypto.randomUUID());
                  setLines([{ item_id: '', quantity: 1 }]);
                }}
              >
                <Plus size={18} />
                Novo pedido
              </button>
            )}
          </div>
          <div className="order-mobile-nav">
            <OrderNav active={mode} />
          </div>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          {success && (
            <p className="catalog-success" role="status">
              {success}
            </p>
          )}
          {creating ? (
            <form
              className="catalog-editor order-create"
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                void submit(
                  {
                    kind: 'create',
                    source,
                    destination,
                    kitchen: f.get('kitchen'),
                    needed: f.get('needed'),
                    notes: f.get('notes'),
                    lines,
                    request,
                  },
                  'Pedido enviado ao estoque.',
                );
              }}
            >
              <h2>Novo pedido</h2>
              <label>
                Restaurante solicitante
                <select
                  required
                  value={destination}
                  onChange={(e) => {
                    setDestination(e.target.value);
                    setSource('');
                    setLines([{ item_id: '', quantity: 1 }]);
                  }}
                >
                  <option value="">Selecione</option>
                  {requestUnits.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Estoque de origem
                <select
                  aria-label="Estoque de origem"
                  required
                  value={source}
                  onChange={(e) => setSource(e.target.value)}
                >
                  <option value="">Selecione o estoque</option>
                  {units
                    .filter((u) => u.org_id === dst?.org_id && u.id !== destination)
                    .map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                Cozinha / setor
                <input
                  name="kitchen"
                  required
                  minLength={2}
                  maxLength={100}
                  placeholder="Ex.: Cozinha quente"
                />
              </label>
              <label>
                Data desejada
                <input
                  type="date"
                  required
                  name="needed"
                  defaultValue={new Date().toLocaleDateString('en-CA', {
                    timeZone: 'America/Sao_Paulo',
                  })}
                />
              </label>
              <div className="order-lines">
                <h3>Produtos solicitados</h3>
                {lines.map((l, i) => (
                  <div className="order-line-input" key={i}>
                    <label>
                      Produto {i + 1}
                      <select
                        required
                        aria-label={`Produto ${i + 1}`}
                        value={l.item_id}
                        onChange={(e) =>
                          setLines(
                            lines.map((x, j) => (j === i ? { ...x, item_id: e.target.value } : x)),
                          )
                        }
                      >
                        <option value="">Selecione um produto</option>
                        {items
                          .filter(
                            (x) =>
                              x.org_id === dst?.org_id &&
                              x.is_active &&
                              !lines.some((v, j) => j !== i && v.item_id === x.id),
                          )
                          .map((x) => (
                            <option key={x.id} value={x.id}>
                              {x.name} · {x.base_uom}
                            </option>
                          ))}
                      </select>
                    </label>
                    <label>
                      Quantidade {i + 1}
                      <input
                        type="number"
                        required
                        step="0.0001"
                        min="0.0001"
                        max="9999999999"
                        value={l.quantity || ''}
                        onChange={(e) =>
                          setLines(
                            lines.map((x, j) =>
                              j === i ? { ...x, quantity: Number(e.target.value) } : x,
                            ),
                          )
                        }
                      />
                    </label>
                    <button
                      type="button"
                      className="icon-button"
                      aria-label={`Remover produto ${i + 1}`}
                      disabled={lines.length === 1 || busy}
                      onClick={() => setLines(lines.filter((_, j) => i !== j))}
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  className="text-button"
                  disabled={lines.length >= 100 || busy}
                  onClick={() => setLines([...lines, { item_id: '', quantity: 1 }])}
                >
                  <Plus size={16} />
                  Adicionar produto
                </button>
                {!items.some((i) => i.org_id === dst?.org_id) && (
                  <p>
                    Cadastre os itens em <Link href="/produtos">Produtos</Link> antes de enviar.
                  </p>
                )}
              </div>
              <label className="order-wide">
                Observações
                <textarea
                  name="notes"
                  maxLength={1000}
                  rows={3}
                  placeholder="Orientações para a separação"
                />
              </label>
              <div className="heading-actions">
                <button
                  type="button"
                  className="secondary"
                  disabled={busy}
                  onClick={() => setCreating(false)}
                >
                  Cancelar
                </button>
                <button className="primary" disabled={busy}>
                  {busy ? 'Enviando…' : 'Enviar pedido'}
                </button>
              </div>
            </form>
          ) : order ? (
            <section className="panel order-detail" key={order.id + order.status}>
              <div className="order-detail-top">
                <button
                  className="text-button"
                  disabled={busy}
                  onClick={() => {
                    setSelected(null);
                    setError('');
                    setSuccess('');
                  }}
                >
                  <ArrowLeft size={16} />
                  Voltar à lista
                </button>
                <button className="secondary" onClick={() => window.print()}>
                  <Printer size={16} />
                  Imprimir comprovante
                </button>
              </div>
              <div className="order-proof-heading">
                <div className="eyebrow">STOCKAI · REQUISIÇÃO INTERNA</div>
                <h2>Pedido #{order.id.slice(0, 8).toUpperCase()}</h2>
                <span className={`order-status ${order.status}`}>
                  {orderStatuses[order.status]}
                </span>
              </div>
              <dl className="order-meta">
                <div>
                  <dt>Estoque de origem</dt>
                  <dd>{order.source_name}</dd>
                </div>
                <div>
                  <dt>Restaurante destinatário</dt>
                  <dd>{order.destination_name}</dd>
                </div>
                <div>
                  <dt>Cozinha / setor</dt>
                  <dd>{order.kitchen}</dd>
                </div>
                <div>
                  <dt>Data desejada</dt>
                  <dd>{order.needed_on.split('-').reverse().join('/')}</dd>
                </div>
              </dl>
              {order.notes && <p className="order-notes">{order.notes}</p>}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  void submit(
                    {
                      kind: 'dispatch',
                      order: order.id,
                      lines: order.lines.map((l) => ({ id: l.id, quantity: Number(f.get(l.id)) })),
                    },
                    'Pedido expedido. A entrega está disponível para assinatura.',
                  );
                }}
              >
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>PRODUTO</th>
                        <th>PEDIDO</th>
                        <th>{order.status === 'requested' ? 'SEPARAR' : 'EXPEDIDO'}</th>
                        {order.status === 'requested' && allowedSource && <th>SALDO NA ORIGEM</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {order.lines.map((l) => (
                        <tr key={l.id}>
                          <td>
                            <strong>{l.item_name}</strong>
                          </td>
                          <td>
                            {number(l.requested_qty)} {l.uom}
                          </td>
                          <td>
                            {order.status === 'requested' && allowedSource ? (
                              <input
                                className="dispatch-quantity"
                                aria-label={`Separar ${l.item_name}`}
                                name={l.id}
                                type="number"
                                min="0"
                                max={l.requested_qty}
                                step="0.0001"
                                defaultValue={l.requested_qty}
                                required
                              />
                            ) : (
                              `${number(l.dispatched_qty ?? 0)} ${l.uom}`
                            )}
                          </td>
                          {order.status === 'requested' && allowedSource && (
                            <td>
                              {number(
                                balances.find(
                                  (b) => b.unit_id === order.source_id && b.item_id === l.item_id,
                                )?.quantity ?? 0,
                              )}{' '}
                              {l.uom}
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {order.status === 'requested' && allowedSource && (
                  <div className="order-dispatch">
                    <p>
                      Confira as quantidades separadas. A expedição baixa o saldo da origem e libera
                      a assinatura na entrega. Itens não atendidos ficam registrados neste pedido;
                      solicite o restante em um novo pedido.
                    </p>
                    <button className="primary" disabled={busy}>
                      <Truck size={17} />
                      {busy ? 'Salvando…' : 'Expedir pedido'}
                    </button>
                  </div>
                )}
              </form>
              {order.status === 'requested' && (allowedDestination || allowedSource) && (
                <div className="order-cancel">
                  {cancelPrompt ? (
                    <>
                      <p>Cancelar este pedido? Ele não poderá ser expedido.</p>
                      <button
                        className="secondary"
                        disabled={busy}
                        onClick={() => setCancelPrompt(false)}
                      >
                        Manter pedido
                      </button>
                      <button
                        className="secondary"
                        disabled={busy}
                        onClick={() =>
                          void submit({ kind: 'cancel', order: order.id }, 'Pedido cancelado.')
                        }
                      >
                        Confirmar cancelamento
                      </button>
                    </>
                  ) : (
                    <button
                      className="text-button"
                      disabled={busy}
                      onClick={() => setCancelPrompt(true)}
                    >
                      Cancelar pedido
                    </button>
                  )}
                </div>
              )}
              {order.status === 'dispatched' && (allowedDestination || allowedSource) && (
                <form
                  className="order-receive"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const f = new FormData(e.currentTarget);
                    void submit(
                      {
                        kind: 'receive',
                        order: order.id,
                        name: f.get('receiver'),
                        signature,
                        notes: f.get('deliveryNotes'),
                        confirmed: f.get('confirmed') === 'on',
                      },
                      'Entrega assinada e entrada registrada no restaurante.',
                    );
                  }}
                >
                  <h3>Confirmação de recebimento</h3>
                  <p>
                    Quem recebe deve conferir os itens expedidos acima e assinar. Se houver
                    diferença, resolva com o estoque antes de confirmar.
                  </p>
                  <label>
                    Nome de quem recebeu
                    <input
                      name="receiver"
                      required
                      minLength={3}
                      maxLength={120}
                      autoComplete="name"
                    />
                  </label>
                  <label>
                    Observações da entrega
                    <textarea name="deliveryNotes" rows={2} maxLength={1000} />
                  </label>
                  <span className="signature-label">Assinatura de quem recebeu</span>
                  <SignatureDrawing value={signature} onChange={setSignature} disabled={busy} />
                  <label className="order-consent">
                    <input type="checkbox" required name="confirmed" />
                    Conferi e recebi as quantidades expedidas deste pedido.
                  </label>
                  <button className="primary" disabled={busy || signature.flat().length < 8}>
                    <CheckCircle2 size={17} />
                    {busy ? 'Salvando…' : 'Assinar e confirmar entrega'}
                  </button>
                </form>
              )}
              {order.status === 'delivered' && (
                <div className="order-signed">
                  <h3>Comprovante de recebimento</h3>
                  <p>
                    Recebido por <strong>{order.receiver_name}</strong> em{' '}
                    {orderDate(order.received_at!)}.
                  </p>
                  <SignatureDrawing value={order.signature as Signature} />
                  {order.delivery_notes && <p>{order.delivery_notes}</p>}
                  <p className="muted">
                    A assinatura confirma as quantidades expedidas, listadas acima. Registro:{' '}
                    {order.id}
                  </p>
                </div>
              )}
              <div className="order-timeline">
                <p>Solicitado em {orderDate(order.created_at)}</p>
                {order.dispatched_at && <p>Expedido em {orderDate(order.dispatched_at)}</p>}
                {order.received_at && <p>Entrega confirmada em {orderDate(order.received_at)}</p>}
                {order.cancelled_at && <p>Cancelado em {orderDate(order.cancelled_at)}</p>}
              </div>
            </section>
          ) : (
            <>
              <div className="order-overview">
                {(['requested', 'dispatched', 'delivered'] as const).map((s) => (
                  <button
                    className={`panel order-stat ${filter === s ? 'selected' : ''}`}
                    key={s}
                    onClick={() => setFilter(s)}
                  >
                    <span>{orderStatuses[s]}</span>
                    <strong>
                      {orders
                        .filter((o) => o.status === s)
                        .length.toString()
                        .padStart(2, '0')}
                    </strong>
                  </button>
                ))}
              </div>
              <div className="catalog-filters order-filters">
                <label>
                  Buscar pedido
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Restaurante, cozinha ou número"
                  />
                </label>
                <label>
                  Empresa
                  <select value={company} onChange={(e) => setCompany(e.target.value)}>
                    <option value="">Todas as empresas</option>
                    {units.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Situação
                  <select
                    aria-label="Situação"
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                  >
                    <option value="all">Todas as situações</option>
                    {Object.entries(orderStatuses).map(([v, n]) => (
                      <option value={v} key={v}>
                        {n}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="order-list">
                {list.map((o) => (
                  <button className="panel order-card" key={o.id} onClick={() => open(o)}>
                    <div className="order-card-top">
                      <span>#{o.id.slice(0, 8).toUpperCase()}</span>
                      <span className={`order-status ${o.status}`}>{orderStatuses[o.status]}</span>
                    </div>
                    <h2>{o.destination_name}</h2>
                    <p>
                      {o.kitchen} · {o.lines.length} produtos
                    </p>
                    <p className="order-route">
                      <Truck size={16} />
                      {o.source_name} → {o.destination_name}
                    </p>
                    <div className="order-card-foot">
                      <span>Para {o.needed_on.split('-').reverse().join('/')}</span>
                      <strong>
                        {o.status === 'delivered' ? 'Ver comprovante' : 'Abrir pedido'} →
                      </strong>
                    </div>
                  </button>
                ))}
              </div>
              {!list.length && (
                <div className="catalog-empty">
                  <ClipboardList size={36} />
                  <h2>
                    {mode === 'deliveries' && filter === 'dispatched'
                      ? 'Nenhuma entrega aguardando assinatura'
                      : 'Nenhum pedido encontrado'}
                  </h2>
                  <p>
                    {mode === 'deliveries'
                      ? 'Os pedidos expedidos pelo estoque aparecerão aqui. Consulte os comprovantes no filtro Entregue.'
                      : 'Crie um pedido ou ajuste os filtros para acompanhar as solicitações.'}
                  </p>
                  {units.length < 2 && (
                    <p>
                      Cadastre o estoque de origem e o restaurante no mesmo grupo em{' '}
                      <Link href="/empresas">Empresas</Link>.
                    </p>
                  )}
                </div>
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}
