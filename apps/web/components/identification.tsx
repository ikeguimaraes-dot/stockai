'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Boxes, ArrowLeft, Plus } from 'lucide-react';
import { OrderNav } from './order-nav';
import { saveCatalog } from '@/app/produtos/actions';
import type { inspectXml, Selection } from '@/lib/xml-identification';
type Info = Awaited<ReturnType<typeof inspectXml>>;
type Entry = {
  id: string;
  filename: string;
  status: string;
  message: string;
  created_at: string;
  receipt_id: string | null;
};
export function Identification({ entries }: { entries: Entry[] }) {
  const router = useRouter();
  const [info, setInfo] = useState<Info | null>(null);
  const [unit, setUnit] = useState('');
  const [mapping, setMapping] = useState<Selection[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [filter, setFilter] = useState('pending');
  const [create, setCreate] = useState<null | 'product' | 'category'>(null);
  const company = info?.companies.find((c) => c.id === unit);
  const canRemember = !!company && !!info?.editableOrgs.includes(company.org_id);
  async function load(id: string, reset = true) {
    const response = await fetch(`/api/xml-inbox?id=${id}`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error);
    const next = data as Info;
    setInfo(next);
    if (reset) {
      const unit = next.entry.unit_id ?? (next.companies.length === 1 ? next.companies[0].id : '');
      setUnit(unit);
      selectUnit(unit, next);
    }
    return next;
  }
  function selectUnit(unit: string, next = info) {
    setUnit(unit);
    const org = next?.companies.find((c) => c.id === unit)?.org_id;
    setMapping(
      next?.invoice?.lines.map((l) => {
        const link = next.links.find(
          (v) =>
            v.org_id === org && v.supplier_code === l.code && v.source_unit === l.commercialUnit,
        );
        return {
          number: l.number,
          itemId: link?.item_id ?? '',
          factor: link ? String(link.factor) : l.suggestedFactor,
        };
      }) ?? [],
    );
  }
  async function open(id: string) {
    setBusy(true);
    setError('');
    setMessage('');
    setCreate(null);
    try {
      await load(id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao abrir.');
    } finally {
      setBusy(false);
    }
  }
  async function process(id: string, review = false) {
    const r = await fetch('/api/xml-inbox', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'identify',
        id,
        ...(review ? { unitId: unit, selections: mapping, remember: canRemember } : {}),
      }),
    });
    const result = await r.json();
    if (!r.ok) throw new Error(result.error);
    return result;
  }
  async function confirm() {
    if (!info) return;
    setBusy(true);
    setError('');
    try {
      const result = await process(info.entry.id, true);
      setMessage(result.message);
      await load(info.entry.id, false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível identificar.');
    } finally {
      setBusy(false);
    }
  }
  async function reprocess() {
    setBusy(true);
    setError('');
    let done = 0;
    try {
      const pending = entries.filter((e) => e.status === 'pending');
      for (let i = 0; i < pending.length; i++) {
        setMessage(`Reprocessando ${i + 1} de ${pending.length}…`);
        const r = await process(pending[i].id);
        if (r.status !== 'pending') done++;
      }
      setMessage(`${done} arquivo(s) identificado(s). Pendências restantes continuam salvas.`);
      setInfo(null);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível reprocessar.');
    } finally {
      setBusy(false);
    }
  }
  async function catalog(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const result = await saveCatalog(new FormData(e.currentTarget));
      if (result.error) throw new Error(result.error);
      await load(info!.entry.id, false);
      setCreate(null);
      setMessage('Cadastro salvo. Selecione o produto no vínculo.');
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível salvar.');
    } finally {
      setBusy(false);
    }
  }
  const products = info?.items.filter((i) => i.org_id === company?.org_id && i.is_active) ?? [];
  return (
    <div className="shell company-directory">
      <aside className="sidebar">
        <Link className="brand" href="/operacao">
          <Boxes /> stock<span>ai</span>
        </Link>
        <nav>
          <OrderNav active="identification" />
          <Link className="nav-item" href="/produtos">
            Produtos e categorias
          </Link>
          <Link className="nav-item" href="/empresas">
            Empresas
          </Link>
        </nav>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <Link className="text-button" href="/operacao">
            <ArrowLeft size={16} />
            Voltar à operação
          </Link>
        </header>
        <main>
          <div className="page-heading">
            <div>
              <div className="eyebrow">SEUS CÓDIGOS, SEM RETRABALHO</div>
              <h1>Identificação de XMLs</h1>
              <p>
                Vincule os produtos uma vez. As próximas notas usam a relação salva para o
                fornecedor.
              </p>
            </div>
            <button
              className="primary"
              disabled={busy || !entries.some((e) => e.status === 'pending')}
              onClick={() => void reprocess()}
            >
              Reprocessar pendentes
            </button>
          </div>
          {error && (
            <p role="alert" className="xml-error">
              {error}
            </p>
          )}
          {message && (
            <p role="status" className="catalog-success">
              {message}
            </p>
          )}
          {info ? (
            <section className="panel order-detail">
              <button
                className="text-button"
                disabled={busy}
                onClick={() => {
                  setInfo(null);
                  setCreate(null);
                }}
              >
                ← Voltar à lista
              </button>
              <h2>{info.entry.filename}</h2>
              <p className="order-notes">{info.entry.message}</p>
              <a className="text-button" href={`/api/xml-inbox?id=${info.entry.id}&download=1`}>
                Baixar XML original
              </a>
              {info.issue && (
                <p className="xml-error">
                  {info.issue} <Link href="/empresas">Abrir empresas</Link>
                </p>
              )}
              {info.entry.receipt_id ? (
                <Link href={`/notas/${info.entry.receipt_id}`} className="primary">
                  Abrir nota e editar
                </Link>
              ) : (
                info.invoice && (
                  <>
                    <div className="order-meta">
                      <p>
                        NF-e {info.invoice.number} · {info.invoice.supplierName}
                      </p>
                      <p>CNPJ fornecedor: {info.invoice.supplierTaxId}</p>
                    </div>
                    <label className="xml-field">
                      Empresa destinatária
                      <select
                        aria-label="Empresa destinatária"
                        disabled={busy}
                        value={unit}
                        onChange={(e) => selectUnit(e.target.value)}
                      >
                        <option value="">Selecione a empresa</option>
                        {info.companies.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name} · {c.tax_id}
                          </option>
                        ))}
                      </select>
                    </label>
                    <div className="heading-actions">
                      {canRemember && company && (
                        <>
                          <button
                            className="secondary"
                            disabled={busy}
                            onClick={() => setCreate('category')}
                          >
                            <Plus size={16} />
                            Nova categoria
                          </button>
                          <button
                            className="secondary"
                            disabled={busy}
                            onClick={() => setCreate('product')}
                          >
                            <Plus size={16} />
                            Novo produto interno
                          </button>
                        </>
                      )}
                      <Link href="/produtos" target="_blank" className="text-button">
                        Gerenciar produtos e categorias
                      </Link>
                    </div>
                    {create && company && (
                      <form className="catalog-editor" onSubmit={catalog}>
                        <h3>{create === 'category' ? 'Nova categoria' : 'Novo produto interno'}</h3>
                        <input type="hidden" name="kind" value={create} />
                        <input type="hidden" name="orgId" value={company.org_id} />
                        <input type="hidden" name="id" value="" />
                        <label>
                          Nome
                          <input
                            name="name"
                            required
                            minLength={2}
                            maxLength={create === 'category' ? 80 : 120}
                          />
                        </label>
                        {create === 'product' && (
                          <>
                            <label>
                              Código interno
                              <input name="code" required maxLength={60} />
                            </label>
                            <label>
                              Unidade
                              <select name="uom" aria-label="Unidade">
                                <option>UN</option>
                                <option>KG</option>
                                <option>L</option>
                              </select>
                            </label>
                            <label>
                              Categoria
                              <select name="categoryId" aria-label="Categoria">
                                <option value="">Sem categoria</option>
                                {info.categories
                                  .filter((c) => c.org_id === company.org_id)
                                  .map((c) => (
                                    <option key={c.id} value={c.id}>
                                      {c.name}
                                    </option>
                                  ))}
                              </select>
                            </label>
                            <label>
                              Compõe CMV?
                              <select name="cmv" aria-label="Compõe CMV?" required defaultValue="">
                                <option value="" disabled>
                                  Selecione
                                </option>
                                <option value="true">Sim</option>
                                <option value="false">Não</option>
                              </select>
                            </label>
                          </>
                        )}
                        <div className="heading-actions">
                          <button className="primary" disabled={busy}>
                            Salvar cadastro
                          </button>
                          <button
                            className="secondary"
                            type="button"
                            disabled={busy}
                            onClick={() => setCreate(null)}
                          >
                            Cancelar
                          </button>
                        </div>
                      </form>
                    )}
                    <div className="xml-items">
                      {info.invoice.lines.map((l, i) => (
                        <div className="xml-item" key={l.number}>
                          <strong>
                            {l.code} — {l.name}
                          </strong>
                          <p>
                            {l.quantity} {l.commercialUnit} no XML
                          </p>
                          <div className="xml-conversion">
                            <label>
                              Meu produto
                              <select
                                aria-label={`Meu produto do item ${l.number}`}
                                value={mapping[i]?.itemId ?? ''}
                                disabled={busy || !company}
                                onChange={(e) =>
                                  setMapping(
                                    mapping.map((s, j) =>
                                      i === j ? { ...s, itemId: e.target.value } : s,
                                    ),
                                  )
                                }
                              >
                                <option value="">Vincule ao código interno</option>
                                {products.map((p) => (
                                  <option value={p.id} key={p.id}>
                                    {p.internal_code} — {p.name} ({p.base_uom})
                                  </option>
                                ))}
                              </select>
                            </label>
                            <label>
                              1 {l.commercialUnit} equivale a
                              <input
                                aria-label={`Conversão do item ${l.number}`}
                                type="number"
                                min="0.000001"
                                step="any"
                                value={mapping[i]?.factor ?? ''}
                                disabled={busy}
                                onChange={(e) =>
                                  setMapping(
                                    mapping.map((s, j) =>
                                      i === j ? { ...s, factor: e.target.value } : s,
                                    ),
                                  )
                                }
                              />
                            </label>
                            <span>
                              Unidade interna:{' '}
                              {products.find((p) => p.id === mapping[i]?.itemId)?.base_uom ??
                                'Selecione o produto'}{' '}
                              · Total:{' '}
                              {(
                                Number(l.quantity) * Number(mapping[i]?.factor || 0)
                              ).toLocaleString('pt-BR', { maximumFractionDigits: 4 })}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                    <p className="muted">
                      {canRemember
                        ? 'O vínculo por fornecedor, código e embalagem será salvo para as próximas notas.'
                        : 'Seu acesso permite identificar esta nota. O gestor do grupo pode salvar os vínculos para reutilização.'}
                    </p>
                    <button
                      className="primary"
                      disabled={
                        busy ||
                        !company ||
                        mapping.some(
                          (m) =>
                            !m.itemId ||
                            Number(m.factor) <= 0 ||
                            !Number.isFinite(Number(m.factor)),
                        )
                      }
                      onClick={() => void confirm()}
                    >
                      Vincular e lançar nota
                    </button>
                  </>
                )
              )}
            </section>
          ) : (
            <>
              <div className="catalog-filters">
                <label>
                  Situação
                  <select value={filter} onChange={(e) => setFilter(e.target.value)}>
                    <option value="pending">Aguardando identificação</option>
                    <option value="all">Todos os arquivos</option>
                    <option value="imported">Importados</option>
                    <option value="duplicate">Duplicados</option>
                  </select>
                </label>
              </div>
              <div className="order-list">
                {entries
                  .filter((e) => filter === 'all' || e.status === filter)
                  .map((e) => (
                    <button
                      key={e.id}
                      disabled={busy}
                      className="panel order-card"
                      onClick={() => void open(e.id)}
                    >
                      <h2>{e.filename}</h2>
                      <p>{e.message}</p>
                      <small>{new Date(e.created_at).toLocaleString('pt-BR')}</small>
                    </button>
                  ))}
              </div>
              {!entries.some((e) => filter === 'all' || e.status === filter) && (
                <div className="catalog-empty">Nenhum arquivo nesta situação.</div>
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}
