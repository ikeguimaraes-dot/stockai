'use client';
import Link from 'next/link';
import { useState } from 'react';
import { Boxes, Building2, LayoutDashboard, Plus, Search, Pencil, ArrowLeft } from 'lucide-react';
import { formatCnpj, type Company } from '@/lib/company';
import { Setup } from './access';
import { signOut } from '@/app/actions';

export function CompanyDirectory({
  companies,
  editableIds,
  orgs,
  email,
}: {
  companies: Company[];
  editableIds: string[];
  orgs: { id: string; name: string }[];
  email: string;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [saved, setSaved] = useState(false);
  const normalized = search.trim().toLocaleLowerCase('pt-BR');
  const filtered = companies.filter((company) =>
    `${company.name} ${company.legal_name ?? ''} ${company.tax_id ?? ''} ${formatCnpj(company.tax_id ?? '')}`
      .toLocaleLowerCase('pt-BR')
      .includes(normalized),
  );
  if (editing !== null)
    return (
      <Setup
        companies={companies.filter((c) => editableIds.includes(c.id))}
        orgs={orgs}
        hasAccess
        initialCompanyId={editing}
        onSaved={() => {
          setEditing(null);
          setSearch('');
          setSaved(true);
        }}
        onCancel={() => setEditing(null)}
      />
    );
  return (
    <div className="shell company-directory">
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
          <Link href="/empresas" className="nav-item active" aria-current="page">
            <Building2 size={19} />
            Empresas
          </Link>
        </nav>
        <div className="sidebar-bottom">
          <div className="side-note">
            <span>
              <Building2 size={17} />
              Cada nota, na empresa certa.
            </span>
            <p>Cadastros organizados para receber com confiança.</p>
          </div>
          <div className="profile">
            <div>
              <strong>{email}</strong>
              <form action={signOut}>
                <button className="nav-item">Sair da conta</button>
              </form>
            </div>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <Link className="text-button" href="/operacao">
            <ArrowLeft size={16} />
            Voltar à operação
          </Link>
          <span className="company-top-label">Cadastros / Empresas</span>
        </header>
        <main>
          <div className="page-heading">
            <div>
              <div className="eyebrow">CADA EMPRESA, NO SEU LUGAR</div>
              <h1>Empresas cadastradas</h1>
              <p>Consulte os dados das empresas que recebem suas notas fiscais.</p>
            </div>
            {orgs.length > 0 && (
              <button
                className="primary"
                onClick={() => {
                  setSaved(false);
                  setEditing('');
                }}
              >
                <Plus size={18} />
                Nova empresa
              </button>
            )}
          </div>
          {saved && (
            <p role="status" className="company-success">
              Empresa salva com sucesso.
            </p>
          )}
          <div className="toolbar company-toolbar">
            <span>
              {companies.length}{' '}
              {companies.length === 1 ? 'empresa disponível' : 'empresas disponíveis'}
            </span>
            <label className="search">
              <Search size={16} />
              <input
                aria-label="Buscar empresas"
                placeholder="Buscar nome, razão social ou CNPJ"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </label>
          </div>
          <div className="company-grid">
            {filtered.map((company) => (
              <article className="panel company-card" key={company.id}>
                <div className="company-card-top">
                  <span className="company-symbol">
                    <Building2 size={24} />
                  </span>
                  <span className={`badge ${company.tax_id ? 'closed' : 'pending_approval'}`}>
                    {company.tax_id ? 'Cadastrada' : 'Cadastro pendente'}
                  </span>
                </div>
                <h2>{company.name}</h2>
                <dl>
                  <div>
                    <dt>Razão social</dt>
                    <dd>{company.legal_name ?? 'Ainda não informada'}</dd>
                  </div>
                  <div>
                    <dt>CNPJ</dt>
                    <dd>{company.tax_id ? formatCnpj(company.tax_id) : 'Ainda não informado'}</dd>
                  </div>
                </dl>
                <div className="company-card-actions">
                  {editableIds.includes(company.id) ? (
                    <button
                      className="secondary"
                      aria-label={`Editar ${company.name}`}
                      onClick={() => {
                        setSaved(false);
                        setEditing(company.id);
                      }}
                    >
                      <Pencil size={14} />
                      {company.tax_id ? 'Editar cadastro' : 'Completar cadastro'}
                    </button>
                  ) : (
                    <span>Somente visualização</span>
                  )}
                </div>
              </article>
            ))}
          </div>
          {!filtered.length && (
            <section className="panel empty">
              <Building2 size={32} />
              <h2>Nenhuma empresa encontrada</h2>
              <p>Tente outro nome ou CNPJ.</p>
              <button className="text-button" onClick={() => setSearch('')}>
                Limpar busca
              </button>
            </section>
          )}
        </main>
      </div>
    </div>
  );
}
