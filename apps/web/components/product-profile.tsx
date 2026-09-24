'use client';
import Link from 'next/link';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ProductCode } from './product-code';
import { saveProductName, relinkProduct } from '@/app/produtos/actions';
import type { Database } from '../../../packages/db/types/database';
type Item = Database['public']['Tables']['stockai_items']['Row'];
export type SupplierLink = Database['public']['Tables']['stockai_product_links']['Row'] & {
  supplierName: string;
  names: string[];
};
export function ProductProfile({
  item,
  items,
  links,
  editable,
}: {
  item: Item;
  items: Item[];
  links: SupplierLink[];
  editable: boolean;
}) {
  const router = useRouter();
  const [name, setName] = useState(item.name),
    [search, setSearch] = useState(''),
    [selected, setSelected] = useState(''),
    [factor, setFactor] = useState(''),
    [message, setMessage] = useState('');
  const [pending, start] = useTransition();
  const linked = links.filter((l) => l.item_id === item.id);
  const normalize = (s: string) =>
    s
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
  const candidates = links.filter(
    (l) =>
      l.item_id !== item.id &&
      normalize(
        `${l.supplierName} ${l.supplier_code} ${l.names.join(' ')} ${items.find((i) => i.id === l.item_id)?.name} ${items.find((i) => i.id === l.item_id)?.internal_code}`,
      ).includes(normalize(search)),
  );
  const chosen = links.find((l) => l.id === selected);
  const previous = items.find((i) => i.id === chosen?.item_id);
  return (
    <main className="product-profile">
      <Link href="/produtos">← Produtos</Link>
      <header>
        <span className="eyebrow">CADASTRO INTERNO</span>
        <h1>{item.name}</h1>
        <p>Seu produto, com todos os códigos de fornecedores associados.</p>
      </header>
      <section className="profile-panel">
        <h2>Nosso produto</h2>
        <ProductCode itemId={item.id} code={item.internal_code ?? ''} editable={editable} />
        <p>
          Unidade de estoque: <strong>{item.base_uom}</strong>
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            start(async () => {
              const r = await saveProductName(item.id, name, item.name);
              setMessage(r.error || 'Nome atualizado. Os vínculos foram preservados.');
              if (!r.error) router.refresh();
            });
          }}
        >
          <label>
            Nosso nome do produto
            <input
              value={name}
              maxLength={120}
              required
              disabled={!editable || pending}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          {editable && (
            <button className="primary" disabled={pending}>
              Salvar nome
            </button>
          )}
        </form>
      </section>
      <section className="profile-panel">
        <h2>Produtos vinculados ({linked.length})</h2>
        <p>Os nomes abaixo são os que vieram nas notas dos fornecedores.</p>
        {linked.length ? (
          <div className="profile-table">
            <table>
              <thead>
                <tr>
                  <th>Fornecedor</th>
                  <th>Produto na nota</th>
                  <th>Código do fornecedor</th>
                  <th>Conversão</th>
                </tr>
              </thead>
              <tbody>
                {linked
                  .sort((a, b) => a.supplierName.localeCompare(b.supplierName, 'pt-BR'))
                  .map((l) => (
                    <tr key={l.id}>
                      <td>
                        {l.supplierName}
                        <small>{l.supplier_tax_id}</small>
                      </td>
                      <td>{l.names.join(' / ') || 'Sem descrição nas notas disponíveis'}</td>
                      <td>{l.supplier_code}</td>
                      <td>
                        1 {l.source_unit} = {l.factor} {item.base_uom}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p>Nenhum produto de fornecedor vinculado ainda.</p>
        )}
      </section>
      {editable && (
        <section className="profile-panel">
          <h2>Vincular outro produto de fornecedor</h2>
          <p>
            Escolha um produto já importado para usar nosso código{' '}
            <strong>{item.internal_code}</strong> nas próximas importações. Notas anteriores e
            movimentações permanecem como foram registradas.
          </p>
          <label>
            Buscar fornecedor, produto ou código
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Ex.: arroz, fornecedor ou código"
            />
          </label>
          <label>
            Produto do fornecedor
            <select
              value={selected}
              disabled={pending}
              onChange={(e) => {
                setSelected(e.target.value);
                const l = links.find((l) => l.id === e.target.value);
                const old = items.find((i) => i.id === l?.item_id);
                setFactor(l && old?.base_uom === item.base_uom ? String(l.factor) : '');
                setMessage('');
              }}
            >
              <option value="">Selecione um produto ({candidates.length})</option>
              {candidates.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.supplierName} · {l.supplier_code} ·{' '}
                  {l.names[0] || items.find((i) => i.id === l.item_id)?.name} · {l.source_unit}
                </option>
              ))}
            </select>
          </label>
          {chosen && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                start(async () => {
                  const r = await relinkProduct(
                    chosen.id,
                    item.id,
                    Number(factor),
                    chosen.updated_at,
                  );
                  setMessage(r.error || 'Vínculo atualizado para as próximas importações.');
                  if (!r.error) {
                    setSelected('');
                    router.refresh();
                  }
                });
              }}
            >
              <p>
                Código atual:{' '}
                <strong>
                  {previous?.internal_code} — {previous?.name}
                </strong>
              </p>
              <label>
                1 {chosen.source_unit} do fornecedor equivale a quantos {item.base_uom}?
                <input
                  type="number"
                  required
                  min="0.000001"
                  step="0.000001"
                  value={factor}
                  onChange={(e) => setFactor(e.target.value)}
                />
              </label>
              <button className="primary" disabled={pending}>
                Vincular a {item.internal_code}
              </button>
            </form>
          )}
        </section>
      )}
      <p role="status" aria-live="polite">
        {pending ? 'Salvando…' : message}
      </p>
    </main>
  );
}
