'use client';
import { OrderNav } from './order-nav';
import { useMemo, useState } from 'react';
import { similarProducts } from '@stockai/core';
import { ProductCode } from './product-code';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Boxes,
  Building2,
  LayoutDashboard,
  Package,
  Plus,
  Pencil,
  ArrowLeft,
  Search,
} from 'lucide-react';
import { saveCatalog } from '@/app/produtos/actions';
import type { Database } from '../../../packages/db/types/database';
type Item = Database['public']['Tables']['stockai_items']['Row'];
type Category = Database['public']['Tables']['stockai_product_categories']['Row'];
export function ProductDirectory({
  items,
  categories,
  orgs,
  editableOrgs,
}: {
  items: Item[];
  categories: Category[];
  orgs: { id: string; name: string }[];
  editableOrgs: string[];
}) {
  const router = useRouter();
  const [orgId, setOrgId] = useState(orgs[0]?.id ?? '');
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState('catalog');
  const similar = useMemo(() => similarProducts(items), [items]);
  const [filter, setFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [editing, setEditing] = useState<Item | 'new' | null>(null);
  const [category, setCategory] = useState<Category | 'new' | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');
  const allowed = editableOrgs.includes(orgId);
  const groupCategories = categories.filter((c) => c.org_id === orgId);
  const filtered = items
    .filter(
      (i) =>
        i.org_id === orgId &&
        `${i.internal_code} ${i.name}`
          .toLocaleLowerCase('pt-BR')
          .includes(search.trim().toLocaleLowerCase('pt-BR')) &&
        (filter === 'all' ||
          (filter === 'pending' ? i.composes_cmv === null : String(i.composes_cmv) === filter)) &&
        (categoryFilter === 'all' ||
          (categoryFilter === 'none' ? !i.category_id : i.category_id === categoryFilter)),
    )
    .sort(
      (a, b) =>
        a.name.localeCompare(b.name, 'pt-BR') || a.internal_code.localeCompare(b.internal_code),
    );
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setSaved('');
    try {
      const result = await saveCatalog(new FormData(e.currentTarget));
      if (result.error) {
        setError(result.error);
        return;
      }
      setEditing(null);
      setCategory(null);
      setSaved('Cadastro salvo com sucesso.');
      router.refresh();
    } catch {
      setError('Não foi possível salvar. Confira a conexão e tente novamente.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="shell company-directory product-directory">
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
          <Link className="nav-item" href="/operacao">
            <LayoutDashboard size={19} />
            Visão geral
          </Link>
          <Link className="nav-item active" aria-current="page" href="/produtos">
            <Package size={19} />
            Produtos
          </Link>
          <Link className="nav-item" href="/empresas">
            <Building2 size={19} />
            Empresas
          </Link>
          <OrderNav />
        </nav>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <Link className="text-button" href="/operacao">
            <ArrowLeft size={16} />
            Voltar à operação
          </Link>
          <span>Cadastros / Produtos</span>
        </header>
        <main>
          <div className="page-heading">
            <div>
              <div className="eyebrow">CADA PRODUTO, BEM ORGANIZADO</div>
              <h1>Produtos e categorias</h1>
              <p>Classifique seus produtos e defina quais compõem o CMV.</p>
            </div>
            {allowed && (
              <div className="heading-actions">
                <button
                  className="secondary"
                  onClick={() => {
                    setCategory('new');
                    setEditing(null);
                    setError('');
                  }}
                >
                  Nova categoria
                </button>
                <button
                  className="primary"
                  onClick={() => {
                    setEditing('new');
                    setCategory(null);
                    setError('');
                  }}
                >
                  <Plus size={18} />
                  Novo produto
                </button>
              </div>
            )}
          </div>
          <div className="catalog-filters">
            <button
              className={tab === 'catalog' ? 'primary' : 'secondary'}
              onClick={() => setTab('catalog')}
            >
              Catálogo
            </button>
            <button
              className={tab === 'similar' ? 'primary' : 'secondary'}
              onClick={() => setTab('similar')}
            >
              Nomes parecidos
            </button>
            <label>
              Grupo
              <select
                aria-label="Grupo de produtos"
                value={orgId}
                onChange={(e) => {
                  setOrgId(e.target.value);
                  setCategoryFilter('all');
                  setEditing(null);
                  setCategory(null);
                  setError('');
                  setSaved('');
                }}
              >
                {orgs.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>
                <Search size={14} /> Buscar produtos
              </span>
              <input
                aria-label="Buscar produtos"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Código interno ou nome"
              />
            </label>
            <label>
              Categoria
              <select
                aria-label="Filtrar categoria"
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
              >
                <option value="all">Todas as categorias</option>
                <option value="none">Sem categoria</option>
                {groupCategories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Compõe CMV
              <select
                aria-label="Filtrar CMV"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              >
                <option value="all">Todos</option>
                <option value="true">Sim</option>
                <option value="false">Não</option>
                <option value="pending">Não definido</option>
              </select>
            </label>
          </div>
          {saved && (
            <p role="status" className="catalog-success">
              {saved}
            </p>
          )}
          {(editing || category) && (
            <form
              key={
                editing
                  ? editing === 'new'
                    ? 'new-product'
                    : editing.id
                  : category
                    ? category === 'new'
                      ? 'new-category'
                      : category.id
                    : 'none'
              }
              className="catalog-editor"
              onSubmit={submit}
              aria-label={editing ? 'Cadastro de produto' : 'Cadastro de categoria'}
            >
              <h2>
                {editing
                  ? editing === 'new'
                    ? 'Novo produto'
                    : 'Classificar produto'
                  : category === 'new'
                    ? 'Nova categoria'
                    : 'Editar categoria'}
              </h2>
              <input type="hidden" name="kind" value={editing ? 'product' : 'category'} />
              <input type="hidden" name="orgId" value={orgId} />
              <input
                type="hidden"
                name="id"
                value={
                  editing && editing !== 'new'
                    ? editing.id
                    : category && category !== 'new'
                      ? category.id
                      : ''
                }
              />
              <label>
                Nome
                <input
                  name="name"
                  aria-label={editing ? 'Nome do produto' : 'Nome da categoria'}
                  required
                  maxLength={editing ? 120 : 80}
                  minLength={editing ? 1 : 2}
                  readOnly={!!editing && editing !== 'new'}
                  defaultValue={
                    editing && editing !== 'new'
                      ? editing.name
                      : category && category !== 'new'
                        ? category.name
                        : ''
                  }
                />
              </label>
              {editing && (
                <>
                  <label>
                    Código interno
                    <input
                      name="code"
                      aria-label="Código interno"
                      required
                      maxLength={60}
                      defaultValue={editing === 'new' ? '' : editing.internal_code}
                    />
                  </label>
                  <label>
                    Unidade
                    <select
                      name="uom"
                      aria-label="Unidade do produto"
                      defaultValue={editing === 'new' ? 'UN' : editing.base_uom}
                    >
                      {(editing === 'new' ? ['UN', 'KG', 'L'] : [editing.base_uom]).map((u) => (
                        <option key={u}>{u}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Categoria
                    <select
                      name="categoryId"
                      aria-label="Categoria do produto"
                      defaultValue={editing === 'new' ? '' : (editing.category_id ?? '')}
                    >
                      <option value="">Sem categoria</option>
                      {groupCategories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Compõe CMV?
                    <select
                      name="cmv"
                      aria-label="Compõe CMV?"
                      required
                      defaultValue={
                        editing === 'new' || editing.composes_cmv === null
                          ? ''
                          : String(editing.composes_cmv)
                      }
                    >
                      <option value="" disabled>
                        Selecione
                      </option>
                      <option value="true">Sim</option>
                      <option value="false">Não</option>
                    </select>
                  </label>
                  <p className="muted">
                    Indica se este produto deve entrar na apuração do custo das mercadorias
                    vendidas. A marcação não altera os valores das notas.
                  </p>
                </>
              )}
              {error && (
                <p role="alert" className="error">
                  {error}
                </p>
              )}
              <div className="heading-actions">
                <button
                  type="button"
                  className="secondary"
                  disabled={busy}
                  onClick={() => {
                    setEditing(null);
                    setCategory(null);
                  }}
                >
                  Cancelar
                </button>
                <button className="primary" disabled={busy}>
                  {busy ? 'Salvando…' : editing ? 'Salvar produto' : 'Salvar categoria'}
                </button>
              </div>
            </form>
          )}
          <details className="catalog-categories">
            <summary>Categorias cadastradas ({groupCategories.length})</summary>
            <div>
              {groupCategories.map((c) => (
                <span key={c.id}>
                  {c.name}
                  {allowed && (
                    <button
                      className="icon-button"
                      aria-label={`Editar categoria ${c.name}`}
                      onClick={() => {
                        setCategory(c);
                        setEditing(null);
                        setError('');
                      }}
                    >
                      <Pencil size={14} />
                    </button>
                  )}
                </span>
              ))}
              {!groupCategories.length && (
                <p>
                  Nenhuma categoria cadastrada. Crie categorias como Hortifruti, Bebidas ou Limpeza.
                </p>
              )}
            </div>
          </details>
          <p className="muted">
            {filtered.length} produtos · Cadastros compartilhados entre as empresas deste grupo.
          </p>
          {tab === 'similar' && (
            <section className="panel">
              <p className="similar-help">
                Produtos com nomes parecidos, em ordem alfabética. Confira marca, unidade e
                embalagem antes de concluir que são iguais. Alterar o código atualiza o cadastro em
                todas as notas; não une produtos.
              </p>
              <div className="table-scroll">
                <table className="similar-products-table">
                  <thead>
                    <tr>
                      <th>Produto (A–Z)</th>
                      <th>Nosso código</th>
                      <th>Unidade</th>
                      <th>Nomes parecidos</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered
                      .filter((i) => similar.has(i.id))
                      .map((i) => (
                        <tr key={i.id}>
                          <td>
                            <Link href={`/produtos/${i.id}`}>
                              <strong>{i.name}</strong>
                            </Link>
                          </td>
                          <td>
                            <ProductCode itemId={i.id} code={i.internal_code} editable={allowed} />
                          </td>
                          <td>{i.base_uom}</td>
                          <td>
                            {(similar.get(i.id) ?? [])
                              .map((id) => items.find((p) => p.id === id))
                              .filter(Boolean)
                              .map((p) => (
                                <div key={p!.id}>
                                  {p!.name} · {p!.internal_code}
                                </div>
                              ))}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
              {!filtered.some((i) => similar.has(i.id)) && (
                <p className="similar-help">Nenhum nome parecido encontrado com estes filtros.</p>
              )}
            </section>
          )}
          {tab === 'catalog' && (
            <div className="catalog-grid">
              {filtered.map((i) => (
                <article className="catalog-card" key={i.id}>
                  <div className="catalog-icon">
                    <Package size={22} />
                  </div>
                  <h2>
                    <Link href={`/produtos/${i.id}`}>{i.name}</Link>
                  </h2>
                  <span>
                    {i.internal_code} · {i.base_uom} ·{' '}
                    {categories.find((c) => c.id === i.category_id)?.name ?? 'Sem categoria'}
                  </span>
                  <p
                    className={`cmv-badge ${i.composes_cmv === true ? 'cmv-yes' : i.composes_cmv === false ? 'cmv-no' : 'cmv-pending'}`}
                  >
                    Compõe CMV:{' '}
                    <strong>
                      {i.composes_cmv === null ? 'Não definido' : i.composes_cmv ? 'Sim' : 'Não'}
                    </strong>
                  </p>
                  {allowed && (
                    <button
                      className="text-button"
                      aria-label={`Editar produto ${i.name}`}
                      onClick={() => {
                        setEditing(i);
                        setCategory(null);
                        setError('');
                      }}
                    >
                      <Pencil size={15} />
                      Editar classificação
                    </button>
                  )}
                </article>
              ))}
            </div>
          )}
          {!filtered.length && (
            <div className="catalog-empty">
              <Package size={36} />
              <h2>Nenhum produto encontrado</h2>
              <p>Cadastre um produto, importe uma nota ou ajuste os filtros.</p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
