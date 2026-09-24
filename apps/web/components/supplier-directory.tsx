'use client';
import Link from 'next/link';
import { useState } from 'react';
import { Truck, Search, ArrowRight } from 'lucide-react';
import { receiptTotals, type Receipt } from '@stockai/core';
export type SupplierReference = {
  id: string;
  org_id: string;
  name: string;
  tax_id: string | null;
  aliases: string[];
  reference_labels: string[];
  source_name: string | null;
  review_note: string | null;
};
const normalize = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
const money = (n: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n / 100);
export function SupplierDirectory({
  suppliers,
  receipts,
  units,
  orgs,
  unit,
  onReceipts,
}: {
  suppliers: SupplierReference[];
  receipts: Receipt[];
  units: { id: string; org_id: string }[];
  orgs: { id: string; name: string }[];
  unit: string;
  onReceipts: (name: string) => void;
}) {
  const [search, setSearch] = useState('');
  const [review, setReview] = useState(false);
  const org = units.find((u) => u.id === unit)?.org_id;
  const filtered = suppliers.filter(
    (s) =>
      (!org || s.org_id === org) &&
      (!review || !!s.review_note) &&
      normalize([s.name, s.tax_id, ...s.aliases, ...s.reference_labels].join(' ')).includes(
        normalize(search.trim()),
      ),
  );
  return (
    <section className="supplier-directory">
      <div className="company-toolbar">
        <label className="search">
          <Search size={17} />
          <input
            aria-label="Buscar fornecedor cadastrado"
            placeholder="Nome, referência ou CNPJ"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <label className="supplier-review-filter">
          <input type="checkbox" checked={review} onChange={(e) => setReview(e.target.checked)} />
          Somente cadastros para revisar
        </label>
        <span>{filtered.length} fornecedor(es)</span>
        <Link className="primary" href="/fornecedores/novo">
          Novo fornecedor
        </Link>
      </div>
      <p className="muted supplier-base-note">
        Cadastros do grupo, incluindo fornecedores sem recebimentos. As referências da planilha
        ajudam na busca; produtos e conversões são identificados a partir dos XMLs.
      </p>
      <div className="supplier-grid">
        {filtered.map((s) => {
          const list = receipts.filter(
            (r) =>
              r.supplier === s.name &&
              units.some((u) => u.id === r.unitId && u.org_id === s.org_id) &&
              (unit === 'Todas as empresas' || r.unitId === unit),
          );
          return (
            <article className="panel supplier-card" key={s.id}>
              <span className="supplier-icon">
                <Truck size={22} />
              </span>
              <h2>{s.name}</h2>
              <p>{orgs.find((o) => o.id === s.org_id)?.name}</p>
              <p>{s.tax_id ? `CNPJ: ${s.tax_id}` : 'CNPJ a identificar'}</p>
              {s.reference_labels.length > 0 && (
                <details>
                  <summary>Referências ({s.reference_labels.length})</summary>
                  <ul>
                    {s.reference_labels.map((l) => (
                      <li key={l}>{l}</li>
                    ))}
                  </ul>
                </details>
              )}
              {s.aliases.some((a) => a !== s.name) && (
                <p className="supplier-aliases">
                  Também na planilha: {s.aliases.filter((a) => a !== s.name).join(', ')}
                </p>
              )}
              {s.review_note && <p className="supplier-review-note">{s.review_note}</p>}
              {s.source_name && <small className="muted">Base: {s.source_name}</small>}
              <div>
                <span>Recebimentos</span>
                <strong>{list.length}</strong>
              </div>
              <div>
                <span>Crédito identificado</span>
                <strong className="accent-text">
                  {money(list.reduce((n, r) => n + receiptTotals(r).credit, 0))}
                </strong>
              </div>
              <Link className="primary full" href={`/fornecedores/${s.id}`}>
                Ver cadastro
              </Link>
              <button
                className="secondary full"
                disabled={!list.length}
                onClick={() => onReceipts(s.name)}
              >
                Ver recebimentos
                <ArrowRight size={15} />
              </button>
            </article>
          );
        })}
      </div>
      {!filtered.length && <div className="catalog-empty">Nenhum fornecedor encontrado.</div>}
    </section>
  );
}
