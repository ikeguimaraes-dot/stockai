'use client';
import { useRouter } from 'next/navigation';
import type { StockBalance } from '@/lib/orders';
import { OrderNav } from './order-nav';
import Link from 'next/link';
import { formatCnpj, type Company } from '@/lib/company';
import { XmlImport } from './xml-import';
import { signOut } from '@/app/actions';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  ArrowDownLeft,
  ArrowDownToLine,
  ArrowRight,
  Bell,
  Boxes,
  Building2,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  ClipboardCheck,
  Clock3,
  FileText,
  Inbox,
  LayoutDashboard,
  Leaf,
  Menu,
  PackageCheck,
  Plus,
  Search,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Truck,
  Wallet,
  X,
} from 'lucide-react';
import { approveReceipt, receiptTotals, submitCount, type Receipt } from '@stockai/core';
import { z } from 'zod';
import { demoReceipts, money, qty } from '@/lib/demo';

type Page = 'overview' | 'receipts' | 'stock' | 'suppliers' | 'inbox' | 'settings';
const pages = {
  overview: 'Visão geral',
  receipts: 'Recebimentos',
  stock: 'Estoque',
  suppliers: 'Fornecedores',
  inbox: 'Inbox',
  settings: 'Configurações',
};
const statuses = {
  counting: 'Em conferência',
  pending_approval: 'Aguardando aprovação',
  closed: 'Concluído',
};
const receiptSchema = z.object({
  id: z.string(),
  supplier: z.string().min(1),
  category: z.string(),
  invoice: z.string().min(1),
  unit: z.string(),
  unitId: z.string().optional(),
  companyLegalName: z.string().optional(),
  companyTaxId: z.string().optional(),
  accessKey: z.string().optional(),
  invoiceSeries: z.string().optional(),
  invoiceTotalCents: z.number().int().nonnegative().optional(),
  date: z.string(),
  time: z.string(),
  status: z.enum(['counting', 'pending_approval', 'closed']),
  lines: z
    .array(
      z.object({
        id: z.string(),
        name: z.string().min(1),
        uom: z.enum(['KG', 'L', 'UN']),
        invoiced: z.number().positive().finite(),
        counted: z.number().nonnegative().finite().nullable(),
        priceCents: z.number().finite().nonnegative(),
        fiscalTotalCents: z.number().int().nonnegative().optional(),
      }),
    )
    .min(1),
});
function Badge({ status }: { status: Receipt['status'] }) {
  return (
    <span className={`badge ${status}`}>
      <span />
      {statuses[status]}
    </span>
  );
}

type LiveWorkspace = {
  initialReceipts: Receipt[];
  stockBalances: StockBalance[];
  units: Company[];
  orgName: string;
  email: string;
};
export function Stockai({ live }: { live?: LiveWorkspace }) {
  const router = useRouter();
  const [page, setPage] = useState<Page>('overview');
  const [receipts, setReceipts] = useState<Receipt[]>(live?.initialReceipts ?? demoReceipts);
  const [ready, setReady] = useState(false);
  const [unit, setUnit] = useState('Todas as empresas');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [selected, setSelected] = useState<string | null>(null);
  const [create, setCreate] = useState(false);
  const [importXml, setImportXml] = useState(false);
  const [mobile, setMobile] = useState(false);
  const [toast, setToast] = useState('');
  const [period, setPeriod] = useState('week');
  useEffect(() => {
    if (live) {
      setReady(true);
      return;
    }
    try {
      const raw = localStorage.getItem('stockai-demo-v1');
      if (raw) setReceipts(z.array(receiptSchema).parse(JSON.parse(raw)));
    } catch {
      setToast('Não foi possível recuperar a demonstração salva. Os exemplos foram carregados.');
    }
    setReady(true);
  }, [live]);
  useEffect(() => {
    if (ready && !live)
      try {
        localStorage.setItem('stockai-demo-v1', JSON.stringify(receipts));
      } catch {
        setToast('Armazenamento indisponível. Suas alterações não serão mantidas ao sair.');
      }
  }, [receipts, ready, live]);
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(''), 5000);
      return () => clearTimeout(timer);
    }
  }, [toast]);
  const navigate = (next: Page) => {
    setPage(next);
    setSearch('');
    setFilter('all');
    setMobile(false);
  };
  const scoped = receipts.filter(
    (r) => unit === 'Todas as empresas' || (r.unitId ?? r.unit) === unit,
  );
  const filtered = scoped.filter(
    (r) =>
      `${r.supplier} ${r.invoice} ${r.category}`.toLowerCase().includes(search.toLowerCase()) &&
      (filter === 'all' || r.status === filter),
  );
  const pending = scoped.filter((r) => r.status === 'pending_approval');
  const total = scoped.reduce((n, r) => n + receiptTotals(r).fiscal, 0);
  const credits = scoped.reduce((n, r) => n + receiptTotals(r).credit, 0);
  const done = scoped.filter((r) => r.status === 'closed').length;
  const active = receipts.find((r) => r.id === selected);
  const mutate = async (body: unknown) => {
    const response = await fetch('/api/receipts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? 'Não foi possível salvar.');
    const updated = z.array(receiptSchema).parse(data.receipts);
    setReceipts(updated);
    router.refresh();
    return data as { receipts: Receipt[]; createdId: string | null };
  };
  const save = async (receipt: Receipt) => {
    if (live) {
      const previous = receipts.find((r) => r.id === receipt.id);
      await mutate(
        previous?.status === 'counting'
          ? {
              action: 'count',
              id: receipt.id,
              counts: Object.fromEntries(receipt.lines.map((l) => [l.id, l.counted])),
            }
          : { action: 'approve', id: receipt.id },
      );
    } else {
      setReceipts((old) => old.map((r) => (r.id === receipt.id ? receipt : r)));
    }
    setToast(
      receipt.status === 'closed'
        ? 'Recebimento concluído. Estoque e valores atualizados.'
        : 'Conferência registrada. Divergências enviadas para aprovação.',
    );
  };
  const createReceipt = async (receipt: Receipt) => {
    let id = receipt.id;
    if (live) {
      const unitId = live.units.find(
        (u) => u.id === receipt.unitId && u.tax_id && u.legal_name,
      )?.id;
      if (!unitId) throw new Error('Selecione uma empresa cadastrada.');
      const result = await mutate({
        action: 'create',
        requestId: receipt.id,
        unit: unitId,
        supplier: receipt.supplier,
        invoice: receipt.invoice,
        lines: receipt.lines.map((l) => ({
          name: l.name,
          uom: l.uom,
          quantity: l.invoiced,
          price_cents: l.priceCents,
        })),
      });
      id = result.createdId ?? id;
    } else setReceipts((old) => [receipt, ...old]);
    setCreate(false);
    setSelected(id);
    setToast('Recebimento criado. Comece a conferência cega.');
  };
  const exportData = () => {
    const rows = [
      ['Fornecedor', 'Nota', 'Empresa', 'Status', 'Fiscal (R$)', 'A pagar (R$)', 'Crédito (R$)'],
      ...filtered.map((r) => {
        const t = receiptTotals(r);
        return [
          r.supplier,
          r.invoice,
          r.unit,
          statuses[r.status],
          (t.fiscal / 100).toFixed(2),
          t.payable === null ? '' : (t.payable / 100).toFixed(2),
          (t.credit / 100).toFixed(2),
        ];
      }),
    ];
    const csv =
      '\uFEFF' +
      rows
        .map((row) =>
          row
            .map(
              (c) =>
                '"' +
                String(c)
                  .replace(/^[=+@\-]/, "'$&")
                  .replaceAll('"', '""') +
                '"',
            )
            .join(';'),
        )
        .join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'stockai-recebimentos.csv';
    a.click();
    URL.revokeObjectURL(url);
    setToast('Relatório exportado.');
  };
  const navigation = [
    { id: 'overview' as const, icon: LayoutDashboard },
    { id: 'receipts' as const, icon: PackageCheck },
    { id: 'stock' as const, icon: Boxes },
    { id: 'suppliers' as const, icon: Truck },
    { id: 'inbox' as const, icon: Inbox },
  ];
  return (
    <div className="shell">
      {mobile && (
        <button
          className="mobile-backdrop"
          aria-label="Fechar menu"
          onClick={() => setMobile(false)}
        />
      )}
      <aside className={`sidebar ${mobile ? 'mobile-open' : ''}`}>
        <Link className="brand" href="/" aria-label="Stockai início">
          <span className="brand-icon">
            <Boxes size={25} />
          </span>
          stock<span>ai</span>
          <i />
        </Link>
        <div className="workspace">
          <span className="workspace-icon">
            <Building2 size={19} />
          </span>
          <div>
            <strong>{live?.orgName ?? 'Grupo demonstração'}</strong>
            <small>{live ? 'Workspace da operação' : 'Workspace de exemplo'}</small>
          </div>
        </div>
        <span className="nav-label">OPERAÇÃO</span>
        <nav>
          {navigation.map(({ id, icon: Icon }) => (
            <button
              key={id}
              className={`nav-item ${page === id ? 'active' : ''}`}
              onClick={() => navigate(id)}
            >
              <Icon size={19} />
              <span>{pages[id]}</span>
              {id === 'inbox' && pending.length > 0 && <b>{pending.length}</b>}
            </button>
          ))}
          {live && <OrderNav />}
          {live && (
            <Link href="/produtos" className="nav-item">
              <Boxes size={19} />
              <span>Produtos</span>
            </Link>
          )}
          {live && (
            <Link href="/empresas" className="nav-item">
              <Building2 size={19} />
              <span>Empresas</span>
            </Link>
          )}
        </nav>
        <div className="sidebar-bottom">
          <div className="side-note">
            <span>
              <Sparkles size={17} /> Menos ruído. Mais controle.
            </span>
            <p>Cada recebimento certo é um resultado melhor na sua cozinha.</p>
            <div className="note-line" />
          </div>
          <button
            className={`nav-item ${page === 'settings' ? 'active' : ''}`}
            onClick={() => navigate('settings')}
          >
            <Settings2 size={19} />
            Configurações
          </button>
          <button
            className="nav-item"
            onClick={() => {
              navigate('settings');
              setToast('Confira o status das integrações e o escopo disponível.');
            }}
          >
            <CircleHelp size={19} />
            Central de ajuda
          </button>
          <div className="profile">
            <span className="avatar">DM</span>
            <div>
              <strong>{live?.email ?? 'Gestor demonstração'}</strong>
              <small>{live ? 'Sessão autenticada' : 'Administrador'}</small>
            </div>
            <ShieldCheck size={17} />
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="icon-button menu-toggle"
              aria-label="Abrir menu"
              onClick={() => setMobile(true)}
            >
              <Menu size={20} />
            </button>
            <span>Workspace</span>
            <ChevronRight size={14} />
            <strong>{pages[page]}</strong>
          </div>
          <div className="top-actions">
            <span className="demo-label">
              <span /> {live ? 'Operação conectada' : 'Ambiente de demonstração'}
            </span>
            <button
              className="bell icon-button"
              aria-label="Abrir notificações"
              onClick={() => navigate('inbox')}
            >
              <Bell size={19} />
              {pending.length > 0 && <i />}
            </button>
            <span className="avatar small">DM</span>
          </div>
        </header>
        <main>
          <div className="page-heading">
            <div>
              <div className="eyebrow">SUA OPERAÇÃO, EM DIA</div>
              <h1>{page === 'overview' ? 'Tudo sob controle.' : pages[page]}</h1>
              <p>
                {page === 'overview'
                  ? 'Uma visão clara do que entra, do que fica e do que precisa de você.'
                  : page === 'receipts'
                    ? 'Da chegada da mercadoria à conferência. Cada detalhe no lugar.'
                    : page === 'stock'
                      ? 'O estoque começa pelo que realmente chegou à sua cozinha.'
                      : page === 'suppliers'
                        ? 'Dados de cada entrega para construir parcerias melhores.'
                        : page === 'inbox'
                          ? 'As decisões que precisam de você, em um só lugar.'
                          : 'Prepare sua operação para conectar pessoas, dados e canais.'}
              </p>
            </div>
            <div className="heading-actions">
              <button className={live ? 'secondary' : 'primary'} onClick={() => setCreate(true)}>
                <Plus size={18} />
                Novo recebimento
              </button>
              {live && (
                <button className="primary" onClick={() => setImportXml(true)}>
                  <FileText size={18} />
                  Importar XML
                </button>
              )}
            </div>
          </div>
          <div className="toolbar">
            <label className="select-wrap">
              <Building2 size={16} />
              <select aria-label="Empresa" value={unit} onChange={(e) => setUnit(e.target.value)}>
                <option>Todas as empresas</option>
                {(
                  live?.units ?? [
                    { id: 'j', name: 'Jardins' },
                    { id: 'i', name: 'Itaim' },
                  ]
                ).map((u) => (
                  <option key={u.id} value={live ? u.id : u.name}>
                    {u.name}
                  </option>
                ))}
              </select>
              <ChevronDown size={14} />
            </label>
            <span className="date-label">
              <span />
              {live ? 'Dados da sua operação' : 'Dados de exemplo · setembro de 2026'}
            </span>
          </div>
          {page === 'overview' && (
            <>
              <div className="metrics">
                <Metric
                  label="Mercadorias recebidas"
                  value={money(total)}
                  icon={<ArrowDownLeft size={18} />}
                  detail={`${scoped.length} notas registradas no período`}
                  accent="brand-accent"
                />
                <Metric
                  label="Recebimentos concluídos"
                  value={String(done).padStart(2, '0')}
                  icon={<PackageCheck size={18} />}
                  detail={`${scoped.filter((r) => r.status === 'counting').length} em conferência agora`}
                  accent="blue"
                />
                <Metric
                  label="Precisam de aprovação"
                  value={String(pending.length).padStart(2, '0')}
                  icon={<Clock3 size={18} />}
                  detail="Sua decisão mantém a operação fluindo"
                  accent="amber"
                />
                <Metric
                  label="Créditos identificados"
                  value={money(credits)}
                  icon={<Wallet size={18} />}
                  detail="Valores de faltas a cobrar dos fornecedores"
                  accent="violet"
                />
              </div>
              <div className="overview-grid">
                <section className="panel chart-panel">
                  <div className="panel-heading">
                    <div>
                      <h2>O ritmo da sua operação</h2>
                      <p>Valor fiscal das mercadorias recebidas</p>
                    </div>
                    <select
                      className="compact-select"
                      aria-label="Período do gráfico"
                      value={period}
                      onChange={(e) => setPeriod(e.target.value)}
                    >
                      <option value="week">Últimos 7 dias</option>
                      <option value="month">Últimos 30 dias</option>
                    </select>
                  </div>
                  <ReceiptChart receipts={scoped} period={period} live={Boolean(live)} />
                  <div className="chart-foot">
                    <span>
                      <i /> Entradas em mercadorias
                    </span>
                    <strong>Valores em R$</strong>
                  </div>
                </section>
                <section className="panel attention">
                  <div className="panel-heading">
                    <h2>Seu próximo passo</h2>
                    <span className="count-pill">{pending.length}</span>
                  </div>
                  <div className="attention-icon">
                    <ClipboardCheck size={26} />
                    <span />
                  </div>
                  <h3>
                    {pending.length ? 'Um olhar seu faz diferença.' : 'Tudo resolvido por aqui.'}
                  </h3>
                  <p>
                    {pending.length
                      ? `${pending.length} recebimentos têm diferenças entre a nota e a quantidade conferida.`
                      : 'Não há recebimentos aguardando aprovação nesta unidade.'}
                  </p>
                  <div className="attention-value">
                    <span>Crédito identificado</span>
                    <strong>{money(credits)}</strong>
                  </div>
                  <button className="secondary full" onClick={() => navigate('inbox')}>
                    Revisar pendências
                    <ArrowRight size={16} />
                  </button>
                </section>
              </div>
            </>
          )}
          {(page === 'overview' || page === 'receipts') && (
            <section className="panel receipts-panel">
              <div className="panel-heading">
                <div className="title-with-count">
                  <h2>{page === 'overview' ? 'Últimos recebimentos' : 'Todos os recebimentos'}</h2>
                  <span className="count-pill">{scoped.length}</span>
                </div>
                {page === 'overview' ? (
                  <button className="text-button" onClick={() => navigate('receipts')}>
                    Ver todos
                    <ArrowRight size={15} />
                  </button>
                ) : (
                  <button className="secondary" onClick={exportData}>
                    <ArrowDownToLine size={16} />
                    Exportar CSV
                  </button>
                )}
              </div>
              <div className="table-toolbar">
                <div className="tabs">
                  {[
                    ['all', 'Todos'],
                    ['counting', 'Em conferência'],
                    ['pending_approval', 'Pendentes'],
                    ['closed', 'Concluídos'],
                  ].map(([id, label]) => (
                    <button
                      key={id}
                      className={filter === id ? 'selected' : ''}
                      onClick={() => setFilter(id)}
                    >
                      {label}
                      {id === 'pending_approval' && pending.length > 0 && (
                        <span>{pending.length}</span>
                      )}
                    </button>
                  ))}
                </div>
                <label className="search">
                  <Search size={16} />
                  <input
                    aria-label="Buscar recebimentos"
                    placeholder="Buscar fornecedor ou nota..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </label>
              </div>
              <ReceiptTable
                receipts={page === 'overview' ? filtered.slice(0, 5) : filtered}
                onSelect={setSelected}
              />
              <div className="table-footer">
                <span>
                  {Math.min(filtered.length, page === 'overview' ? 5 : filtered.length)} de{' '}
                  {filtered.length} recebimentos
                </span>
                <span>
                  <ShieldCheck size={14} /> Fiscal, físico e financeiro separados
                </span>
              </div>
            </section>
          )}
          {page === 'stock' && (
            <StockTable
              receipts={scoped}
              balances={live?.stockBalances.filter(
                (b) =>
                  unit === 'Todas as empresas' ||
                  live.units.find((u) => u.id === b.unit_id)?.name === unit,
              )}
            />
          )}
          {page === 'suppliers' && (
            <div className="supplier-grid">
              {Array.from(new Set(scoped.map((r) => r.supplier))).map((name) => {
                const list = scoped.filter((r) => r.supplier === name);
                const divergent = list.filter((r) => receiptTotals(r).divergences > 0);
                return (
                  <section className="panel supplier-card" key={name}>
                    <span
                      className={`supplier-icon ${list[0].category === 'Proteínas' ? 'rose' : ''}`}
                    >
                      <Truck size={22} />
                    </span>
                    <h2>{name}</h2>
                    <p>{list[0].category}</p>
                    <div>
                      <span>Recebimentos</span>
                      <strong>{list.length}</strong>
                    </div>
                    <div>
                      <span>Com divergência</span>
                      <strong>{Math.round((divergent.length / list.length) * 100)}%</strong>
                    </div>
                    <div>
                      <span>Crédito identificado</span>
                      <strong className="accent-text">
                        {money(list.reduce((n, r) => n + receiptTotals(r).credit, 0))}
                      </strong>
                    </div>
                    <button
                      className="secondary full"
                      onClick={() => {
                        navigate('receipts');
                        setSearch(name);
                      }}
                    >
                      Ver recebimentos
                      <ArrowRight size={15} />
                    </button>
                  </section>
                );
              })}
            </div>
          )}
          {page === 'inbox' && (
            <section className="panel">
              <div className="panel-heading">
                <div>
                  <h2>Aguardando sua decisão</h2>
                  <p>Aprovar registra o físico contado e mantém o documento fiscal original.</p>
                </div>
                <span className="count-pill">{pending.length}</span>
              </div>
              {pending.length === 0 ? (
                <Empty
                  title="Nenhuma aprovação pendente"
                  text="Os novos recebimentos com divergência aparecerão aqui."
                />
              ) : (
                pending.map((r) => (
                  <button className="inbox-row" key={r.id} onClick={() => setSelected(r.id)}>
                    <span className="alert-icon">
                      <SlidersHorizontal size={21} />
                    </span>
                    <div>
                      <strong>{r.supplier}</strong>
                      <p>
                        {receiptTotals(r).divergences} item(ns) com divergência · NF {r.invoice} ·{' '}
                        {r.unit}
                      </p>
                    </div>
                    <span className="accent-text">{money(receiptTotals(r).credit)} em crédito</span>
                    <ChevronRight size={19} />
                  </button>
                ))
              )}
            </section>
          )}
          {page === 'settings' && (
            <section className="panel settings">
              <h2>Um sistema, toda a operação</h2>
              <p>
                {live
                  ? 'Dados persistidos no Supabase com acesso individual e isolamento entre organizações.'
                  : 'Esta área demonstra o fluxo de recebimento com dados salvos neste navegador. Nenhuma mensagem ou documento é enviado a serviços externos.'}
              </p>
              {[
                ['Banco e autenticação', 'Supabase · organizações, unidades e permissões'],
                ['WhatsApp', 'Número do cliente · entrada de mensagens'],
                ['Notas fiscais', 'Certificado A1 · XML oficial da NF-e'],
                ['Inteligência artificial', 'Transcrição, extração e associação de insumos'],
              ].map(([title, description]) => (
                <div className="integration" key={title}>
                  <span className="workspace-icon">
                    <Activity size={20} />
                  </span>
                  <div>
                    <strong>{title}</strong>
                    <p>{description}</p>
                  </div>
                  <span className="neutral-badge">
                    {live && title === 'Banco e autenticação' ? 'Conectado' : 'Não conectado'}
                  </span>
                </div>
              ))}
              {live && (
                <form action={signOut}>
                  <button className="secondary">Sair da conta</button>
                </form>
              )}
              <div className="settings-note">
                <ShieldCheck size={22} />
                <p>
                  As integrações de produção serão habilitadas por ambiente. Dados de demonstração
                  ficam separados dos dados reais.
                </p>
              </div>
            </section>
          )}
          <footer className="page-footer">
            <span>
              stockai <i /> Inteligência em cada entrada.
            </span>
            <span>Feito para o ritmo da sua cozinha.</span>
          </footer>
        </main>
      </div>
      {active && (
        <ReceiptDialog
          receipt={active}
          onClose={() => setSelected(null)}
          onSave={save}
          operatorHref={live ? `/conferencia/${active.id}` : undefined}
        />
      )}
      {importXml && live && (
        <Modal title="Importar XML da NF-e" onClose={() => setImportXml(false)}>
          <XmlImport
            onImported={(result) => {
              setReceipts(z.array(receiptSchema).parse(result.receipts));
              setImportXml(false);
              setSelected(result.createdId);
              setToast('NF-e importada. Comece a conferência cega.');
            }}
          />
        </Modal>
      )}
      {create && (
        <NewReceipt
          units={live?.units.filter((u) => u.tax_id && u.legal_name)}
          onClose={() => setCreate(false)}
          onCreate={createReceipt}
        />
      )}
      {toast && (
        <div role="status" className="toast">
          <CheckCheck size={18} />
          {toast}
          <button aria-label="Fechar aviso" onClick={() => setToast('')}>
            <X size={15} />
          </button>
        </div>
      )}
    </div>
  );
}

function Metric({
  label,
  value,
  icon,
  detail,
  accent,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  detail: string;
  accent: string;
}) {
  return (
    <section className={`metric metric-${accent}`}>
      <div>
        <span>{label}</span>
        <i className={accent}>{icon}</i>
      </div>
      <strong>{value}</strong>
      <p>
        <span className={accent} />
        {detail}
      </p>
    </section>
  );
}
function Empty({ title, text }: { title: string; text: string }) {
  return (
    <div className="empty">
      <PackageCheck size={35} />
      <h3>{title}</h3>
      <p>{text}</p>
    </div>
  );
}
function ReceiptTable({
  receipts,
  onSelect,
}: {
  receipts: Receipt[];
  onSelect: (id: string) => void;
}) {
  return receipts.length === 0 ? (
    <Empty
      title="Nenhum recebimento encontrado"
      text="Ajuste a busca ou o filtro para ver outros resultados."
    />
  ) : (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th>FORNECEDOR / NOTA</th>
            <th>EMPRESA</th>
            <th>RECEBIDO EM</th>
            <th>VALOR DA NOTA</th>
            <th>STATUS</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {receipts.map((r) => (
            <tr key={r.id} onClick={() => onSelect(r.id)}>
              <td>
                <div className="supplier-cell">
                  <span
                    className={`supplier-icon ${r.category === 'Proteínas' ? 'rose' : r.category === 'Pescados' ? 'blue' : r.category === 'Laticínios' ? 'amber' : ''}`}
                  >
                    {r.category === 'Hortifruti' ? (
                      <Leaf size={19} />
                    ) : r.category === 'Mercearia' ? (
                      <Boxes size={19} />
                    ) : (
                      <Truck size={19} />
                    )}
                  </span>
                  <div>
                    <strong>{r.supplier}</strong>
                    <small>
                      NF {r.invoice} <span>·</span> {r.category}
                    </small>
                  </div>
                </div>
              </td>
              <td>
                <span className="unit-name">
                  <Building2 size={13} />
                  {r.unit}
                </span>
                {r.companyTaxId && <small>{formatCnpj(r.companyTaxId)}</small>}
              </td>
              <td>
                <span>
                  {new Date(r.date + 'T12:00:00')
                    .toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
                    .replace('.', '')}
                </span>
                <small>{r.time}</small>
              </td>
              <td className="amount">{money(r.invoiceTotalCents ?? receiptTotals(r).fiscal)}</td>
              <td>
                <Badge status={r.status} />
              </td>
              <td>
                <button
                  className="icon-button"
                  aria-label={`Abrir recebimento de ${r.supplier}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelect(r.id);
                  }}
                >
                  <ChevronRight size={17} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
function ReceiptChart({
  receipts,
  period,
  live,
}: {
  receipts: Receipt[];
  period: string;
  live: boolean;
}) {
  const n = period === 'week' ? 7 : 30;
  const end = live ? new Date() : new Date('2026-09-18T12:00:00');
  const dates = Array.from({ length: n }, (_, i) => {
    const d = new Date(end);
    d.setDate(end.getDate() - n + 1 + i);
    return d.toLocaleDateString('en-CA');
  });
  const labels = dates.map((d) =>
    new Date(d + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }),
  );
  const values = dates.map((date) =>
    receipts
      .filter((r) => r.date === date)
      .reduce((sum, r) => sum + receiptTotals(r).fiscal / 100, 0),
  );
  const max = Math.max(1000, Math.ceil(Math.max(...values) / 1000) * 1000);
  const points = values.map((v, i) => `${55 + (i * 625) / (n - 1)},${165 - (v / max) * 135}`);
  const path = `M ${points.join(' L ')}`;
  return (
    <div className="chart">
      <svg
        viewBox="0 0 715 207"
        role="img"
        aria-label={`Entradas diárias: ${values.map((v, i) => `${labels[i]}: ${money(v * 100)}`).join('; ')}`}
      >
        <defs>
          <linearGradient id="chartFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity=".17" />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity=".015" />
          </linearGradient>
        </defs>
        {[0, 1, 2, 3].map((i) => (
          <g key={i}>
            <line
              x1="55"
              x2="680"
              y1={30 + i * 45}
              y2={30 + i * 45}
              stroke="var(--line)"
              strokeDasharray="3 5"
            />
            <text x="0" y={34 + i * 45}>
              {((max * (1 - i / 3)) / 1000).toFixed(1).replace('.', ',')} mil
            </text>
          </g>
        ))}
        <path d={`${path} L 680,165 L 55,165 Z`} fill="url(#chartFill)" />
        <path
          d={path}
          fill="none"
          stroke="var(--accent)"
          strokeWidth="2.5"
          strokeLinejoin="round"
        />
        {values.map((v, i) => (
          <g key={i}>
            <circle
              cx={55 + (i * 625) / (n - 1)}
              cy={165 - (v / max) * 135}
              r="3.5"
              fill="var(--accent)"
              stroke="white"
              strokeWidth="2"
            >
              <title>{`${labels[i]}: ${money(v * 100)}`}</title>
            </circle>
            {(n === 7 || i % 3 === 0 || i === n - 1) && (
              <text x={55 + (i * 625) / (n - 1)} y="194" textAnchor="middle">
                {labels[i]}
              </text>
            )}
          </g>
        ))}
      </svg>
    </div>
  );
}
function StockTable({ receipts, balances }: { receipts: Receipt[]; balances?: StockBalance[] }) {
  const items = useMemo(() => {
    const map = new Map<string, { name: string; uom: string; quantity: number; value: number }>();
    if (balances) {
      for (const b of balances) {
        const row = map.get(b.item_id) ?? { name: b.name, uom: b.uom, quantity: 0, value: 0 };
        row.quantity += b.quantity;
        row.value += b.value_cents;
        map.set(b.item_id, row);
      }
      return [...map.entries()].map(([id, row]) => ({ ...row, id }));
    }
    for (const r of receipts.filter((r) => r.status === 'closed'))
      for (const line of r.lines) {
        const key = `${line.name}:${line.uom}`;
        const row = map.get(key) ?? { name: line.name, uom: line.uom, quantity: 0, value: 0 };
        row.quantity += line.counted ?? 0;
        row.value += Math.round((line.counted ?? 0) * line.priceCents);
        map.set(key, row);
      }
    return [...map.entries()].map(([id, row]) => ({ ...row, id }));
  }, [receipts, balances]);
  return (
    <section className="panel">
      <div className="panel-heading">
        <div>
          <h2>{balances ? 'Saldo em estoque' : 'Entradas confirmadas'}</h2>
          <p>
            {balances
              ? 'Entradas confirmadas, saídas expedidas e entregas assinadas. Produtos em trânsito entram no destino após a assinatura.'
              : 'Quantidades dos recebimentos concluídos neste ambiente de demonstração.'}
          </p>
        </div>
        <span className="count-pill">{items.length} insumos</span>
      </div>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>INSUMO</th>
              <th>{balances ? 'SALDO DISPONÍVEL' : 'QUANTIDADE RECEBIDA'}</th>
              <th>UNIDADE DE MEDIDA</th>
              <th>VALOR FÍSICO</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id}>
                <td>
                  <strong>{item.name}</strong>
                </td>
                <td>{qty(item.quantity)}</td>
                <td>{item.uom}</td>
                <td>{money(item.value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!items.length && (
        <Empty
          title="Nenhuma entrada confirmada"
          text="Conclua um recebimento para registrar a entrada física."
        />
      )}
    </section>
  );
}

function Modal({
  children,
  onClose,
  title,
}: {
  children: React.ReactNode;
  onClose: () => void;
  title: string;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = dialog.current;
    el?.showModal();
    return () => el?.close();
  }, []);
  return (
    <dialog
      ref={dialog}
      onCancel={onClose}
      className="dialog"
      aria-label={title}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="dialog-content">
        <div className="dialog-top">
          <span>
            <Boxes size={19} /> stockai <span>/ {title}</span>
          </span>
          <button className="icon-button" aria-label="Fechar" onClick={onClose}>
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </dialog>
  );
}
function ReceiptDialog({
  receipt,
  onClose,
  onSave,
  operatorHref,
}: {
  receipt: Receipt;
  onClose: () => void;
  onSave: (r: Receipt) => Promise<void>;
  operatorHref?: string;
}) {
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const counting = receipt.status === 'counting';
  const t = receiptTotals(receipt);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const values = Object.fromEntries(
        Object.entries(counts).map(([key, value]) => [
          key,
          value.trim() === '' ? NaN : Number(value.replace(',', '.')),
        ]),
      );
      await onSave(submitCount(receipt, values));
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível salvar.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title={counting ? 'Conferência cega' : 'Detalhes do recebimento'} onClose={onClose}>
      <div className="dialog-heading">
        <div className="eyebrow">
          NF {receipt.invoice}
          {receipt.invoiceSeries ? ` / Série ${receipt.invoiceSeries}` : ''} · {receipt.unit}
        </div>
        <h2>{receipt.supplier}</h2>
        {receipt.companyTaxId && (
          <p>
            Destinatária: {receipt.companyLegalName} · CNPJ {formatCnpj(receipt.companyTaxId)}
          </p>
        )}
        <Badge status={receipt.status} />
      </div>
      {counting ? (
        <form onSubmit={submit}>
          {operatorHref && (
            <Link className="text-button" href={operatorHref}>
              Abrir tela de conferência do operador <ArrowRight size={15} />
            </Link>
          )}
          <div className="info-banner">
            <ShieldCheck size={22} />
            <p>
              <strong>Conte primeiro. Compare depois.</strong>Informe o que chegou. As quantidades
              da nota ficam ocultas durante a conferência.
            </p>
          </div>
          <div className="count-lines">
            {receipt.lines.map((line) => (
              <label key={line.id}>
                <span>
                  <strong>{line.name}</strong>
                  <small>Quantidade recebida · {line.uom}</small>
                </span>
                <div>
                  <input
                    aria-label={`Quantidade de ${line.name}`}
                    type="number"
                    min="0"
                    step="0.0001"
                    required
                    placeholder="0"
                    value={counts[line.id] ?? ''}
                    onChange={(e) => setCounts({ ...counts, [line.id]: e.target.value })}
                  />
                  <span>{line.uom}</span>
                </div>
              </label>
            ))}
          </div>
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          <div className="dialog-actions">
            <button type="button" className="secondary" onClick={onClose}>
              Conferir depois
            </button>
            <button type="submit" disabled={busy} className="primary">
              <Check size={18} />
              Finalizar conferência
            </button>
          </div>
        </form>
      ) : (
        <>
          {receipt.accessKey && (
            <div className="info-banner xml-source">
              <FileText size={21} />
              <div>
                <strong>
                  NF-e importada · Total da nota: {money(receipt.invoiceTotalCents ?? t.fiscal)}
                </strong>
                <p>Chave: {receipt.accessKey}</p>
                <p>
                  A conferência e o crédito por falta usam o valor dos produtos após descontos.
                  Frete, impostos e outros valores da nota ficam separados.
                </p>
              </div>
            </div>
          )}
          <div className="truth-grid">
            <div>
              <span>{receipt.accessKey ? 'Mercadorias líquidas' : 'Documento fiscal'}</span>
              <strong>{money(t.fiscal)}</strong>
              <small>
                {receipt.accessKey ? 'Produtos após descontos' : 'Valor original da nota'}
              </small>
            </div>
            <div>
              <span>Crédito por falta</span>
              <strong className="accent-text">{money(t.credit)}</strong>
              <small>Pendência com fornecedor</small>
            </div>
            <div>
              <span>{receipt.accessKey ? 'Mercadorias a pagar' : 'Valor a pagar'}</span>
              <strong>{money(t.payable ?? 0)}</strong>
              <small>
                {receipt.accessKey ? 'Mercadorias menos crédito' : 'Nota menos crédito'}
              </small>
            </div>
          </div>
          <div className="table-scroll">
            <table className="detail-table">
              <thead>
                <tr>
                  <th>INSUMO</th>
                  <th>FISCAL</th>
                  <th>FÍSICO</th>
                  <th>DIFERENÇA</th>
                </tr>
              </thead>
              <tbody>
                {receipt.lines.map((line) => (
                  <tr key={line.id}>
                    <td>
                      <strong>{line.name}</strong>
                      <small>{line.uom}</small>
                    </td>
                    <td>{qty(line.invoiced)}</td>
                    <td>{qty(line.counted ?? 0)}</td>
                    <td className={line.counted !== line.invoiced ? 'amber-text' : 'accent-text'}>
                      {qty((line.counted ?? 0) - line.invoiced)} {line.uom}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {receipt.status === 'pending_approval' && (
            <div className="info-banner amber-banner">
              <ClipboardCheck size={22} />
              <p>
                <strong>Revise antes de aprovar.</strong>A entrada será feita pela quantidade
                física. Excedentes não aumentam automaticamente o valor a pagar.
              </p>
            </div>
          )}
          <div className="dialog-actions">
            <button className="secondary" onClick={onClose}>
              Fechar
            </button>
            {receipt.status === 'pending_approval' && (
              <button
                disabled={busy}
                className="primary"
                onClick={async () => {
                  setBusy(true);
                  try {
                    await onSave(approveReceipt(receipt));
                  } catch (err) {
                    setError(String(err));
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                <CheckCheck size={18} />
                Aprovar recebimento
              </button>
            )}
            {receipt.status === 'closed' && (
              <span className="closed-label">
                <ShieldCheck size={16} />
                Recebimento registrado
              </span>
            )}
          </div>
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
        </>
      )}
    </Modal>
  );
}
function NewReceipt({
  onClose,
  onCreate,
  units = [
    { id: 'Jardins', name: 'Jardins', tax_id: null, legal_name: null, org_id: 'demo' },
    { id: 'Itaim', name: 'Itaim', tax_id: null, legal_name: null, org_id: 'demo' },
  ],
}: {
  onClose: () => void;
  onCreate: (r: Receipt) => Promise<void>;
  units?: Company[];
}) {
  const [lines, setLines] = useState([
    { id: crypto.randomUUID(), name: '', uom: 'KG' as 'KG' | 'L' | 'UN', invoiced: '', price: '' },
  ]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [requestId] = useState(() => crypto.randomUUID());
  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setBusy(true);
    const data = new FormData(e.currentTarget);
    try {
      const now = new Date();
      const r = receiptSchema.parse({
        id: requestId,
        supplier: String(data.get('supplier')).trim(),
        category: 'Cadastro manual',
        invoice: String(data.get('invoice')).trim(),
        unit: units.find((u) => u.id === data.get('unit'))?.name ?? '',
        unitId: data.get('unit'),
        companyTaxId: units.find((u) => u.id === data.get('unit'))?.tax_id ?? undefined,
        companyLegalName: units.find((u) => u.id === data.get('unit'))?.legal_name ?? undefined,
        date: now.toLocaleDateString('en-CA'),
        time: now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
        status: 'counting',
        lines: lines.map((l) => ({
          id: l.id,
          name: l.name.trim(),
          uom: l.uom,
          invoiced: Number(l.invoiced),
          counted: null,
          priceCents: Math.round(Number(l.price) * 100),
        })),
      });
      await onCreate(r);
    } catch (err) {
      setError(
        err instanceof z.ZodError
          ? 'Preencha todos os campos com valores válidos.'
          : err instanceof Error
            ? err.message
            : 'Não foi possível salvar.',
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title="Novo recebimento" onClose={onClose}>
      <div className="dialog-heading">
        <div className="eyebrow">UMA NOVA ENTRADA, TUDO NO LUGAR</div>
        <h2>Registrar recebimento</h2>
        <p>
          Escolha a empresa destinatária e cadastre os dados da nota para iniciar a conferência.
        </p>
      </div>
      <form onSubmit={submit}>
        <div className="form-grid">
          <label className="company-field">
            Empresa destinatária
            <select name="unit" required defaultValue="">
              <option value="" disabled>
                Selecione a empresa da nota
              </option>
              {units.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                  {u.tax_id ? ` · ${formatCnpj(u.tax_id)}` : ''}
                </option>
              ))}
            </select>
          </label>
          <label>
            Fornecedor
            <input name="supplier" required placeholder="Nome do fornecedor" maxLength={100} />
          </label>
          <label>
            Número da nota
            <input name="invoice" required placeholder="000.000" maxLength={40} />
          </label>
        </div>
        <div className="form-section-title">
          <h3>Itens da nota fiscal</h3>
          <span>Cadastro manual</span>
        </div>
        {lines.map((line, i) => (
          <div className="new-line" key={line.id}>
            <label>
              Insumo
              <input
                required
                value={line.name}
                placeholder="Ex.: Tomate italiano"
                onChange={(e) =>
                  setLines(lines.map((l, j) => (j === i ? { ...l, name: e.target.value } : l)))
                }
              />
            </label>
            <label>
              Unidade
              <select
                value={line.uom}
                onChange={(e) =>
                  setLines(
                    lines.map((l, j) =>
                      j === i ? { ...l, uom: e.target.value as 'KG' | 'L' | 'UN' } : l,
                    ),
                  )
                }
              >
                <option>KG</option>
                <option>L</option>
                <option>UN</option>
              </select>
            </label>
            <label>
              Qtd. na nota
              <input
                required
                type="number"
                min="0.0001"
                step="0.0001"
                value={line.invoiced}
                onChange={(e) =>
                  setLines(lines.map((l, j) => (j === i ? { ...l, invoiced: e.target.value } : l)))
                }
              />
            </label>
            <label>
              Preço unit. (R$)
              <input
                required
                type="number"
                min="0"
                step="0.01"
                value={line.price}
                onChange={(e) =>
                  setLines(lines.map((l, j) => (j === i ? { ...l, price: e.target.value } : l)))
                }
              />
            </label>
            {lines.length > 1 && (
              <button
                type="button"
                className="icon-button"
                aria-label={`Remover item ${i + 1}`}
                onClick={() => setLines(lines.filter((_, j) => j !== i))}
              >
                <X size={17} />
              </button>
            )}
          </div>
        ))}
        <button
          className="text-button add-line"
          type="button"
          onClick={() =>
            setLines([
              ...lines,
              { id: crypto.randomUUID(), name: '', uom: 'KG', invoiced: '', price: '' },
            ])
          }
        >
          <Plus size={16} />
          Adicionar item
        </button>
        <div className="info-banner">
          <FileText size={21} />
          <p>
            Para preencher os dados automaticamente, use “Importar XML” no painel. Aqui você pode
            registrar uma nota manualmente.
          </p>
        </div>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="dialog-actions">
          <button type="button" className="secondary" onClick={onClose}>
            Cancelar
          </button>
          <button className="primary" disabled={busy} type="submit">
            Iniciar conferência
            <ArrowRight size={17} />
          </button>
        </div>
      </form>
    </Modal>
  );
}
