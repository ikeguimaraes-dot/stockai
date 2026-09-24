'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Pencil, Link2 } from 'lucide-react';
import { ProductCode } from './product-code';
import { getProductSupplierLinks, relinkProduct, saveProductName } from '@/app/produtos/actions';
import type { Database } from '../../../packages/db/types/database';
type Item = Database['public']['Tables']['stockai_items']['Row'];
export function SimilarProductCard({
  item,
  items,
  matches,
  editable,
}: {
  item: Item;
  items: Item[];
  matches: Item[];
  editable: boolean;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<'name' | 'link' | null>(null);
  const [name, setName] = useState(item.name);
  const [links, setLinks] = useState<Awaited<ReturnType<typeof getProductSupplierLinks>>>([]);
  const [selected, setSelected] = useState('');
  const [targetId, setTargetId] = useState('');
  const [search, setSearch] = useState('');
  const [factor, setFactor] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const target = items.find((i) => i.id === targetId);
  const chosen = links.find((l) => l.id === selected);
  const normalize = (s: string) =>
    s
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
  const candidates = items.filter(
    (i) =>
      i.id !== item.id &&
      i.is_active &&
      i.org_id === item.org_id &&
      (i.id === targetId || normalize(`${i.name} ${i.internal_code}`).includes(normalize(search))),
  );
  async function openLink(id = '') {
    setMode('link');
    setTargetId(id);
    setSelected('');
    setFactor('');
    setMessage('');
    setBusy(true);
    try {
      const data = await getProductSupplierLinks(item.id);
      setLinks(data);
      if (data.length === 1) {
        setSelected(data[0].id);
        if (items.find((i) => i.id === id)?.base_uom === item.base_uom)
          setFactor(String(data[0].factor));
      }
    } catch {
      setMessage('Não foi possível carregar os vínculos. Tente novamente.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <article className="similar-card" aria-label={item.name}>
      <div className="similar-card-main">
        <div className="similar-identity">
          <span className="eyebrow">NOSSO PRODUTO · {item.base_uom}</span>
          <h2>
            <Link href={`/produtos/${item.id}`}>{item.name}</Link>
          </h2>
          <ProductCode itemId={item.id} code={item.internal_code} editable={editable} />
          {editable && (
            <div className="heading-actions">
              <button
                className="secondary"
                disabled={busy}
                onClick={() => {
                  setMode('name');
                  setName(item.name);
                  setMessage('');
                }}
              >
                <Pencil size={16} /> Corrigir nome
              </button>
              <button className="secondary" disabled={busy} onClick={() => void openLink()}>
                <Link2 size={16} /> Vincular a existente
              </button>
            </div>
          )}
        </div>
        <div className="similar-matches">
          <h3>
            Nomes parecidos <span>({matches.length})</span>
          </h3>
          <ul>
            {matches.map((p) => (
              <li key={p.id}>
                <div>
                  <Link href={`/produtos/${p.id}`}>{p.name}</Link>
                  <small>
                    {p.internal_code} · {p.base_uom}
                  </small>
                </div>
                {editable && p.is_active && (
                  <button
                    className="text-button"
                    disabled={busy}
                    aria-label={`Vincular a ${p.internal_code}`}
                    onClick={() => void openLink(p.id)}
                  >
                    Usar este produto
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      </div>
      {mode === 'name' && (
        <form
          className="similar-editor"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setMessage('');
            try {
              const r = await saveProductName(item.id, name, item.name);
              setMessage(r.error || 'Nome atualizado. Vínculos preservados.');
              if (!r.error) {
                setMode(null);
                router.refresh();
              }
            } catch {
              setMessage('Não foi possível salvar. Tente novamente.');
            } finally {
              setBusy(false);
            }
          }}
        >
          <label>
            Nosso nome do produto
            <input
              autoFocus
              required
              maxLength={120}
              value={name}
              disabled={busy}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <div className="heading-actions">
            <button className="primary" disabled={busy}>
              Salvar nome
            </button>
            <button
              type="button"
              className="secondary"
              disabled={busy}
              onClick={() => setMode(null)}
            >
              Cancelar
            </button>
          </div>
        </form>
      )}
      {mode === 'link' && (
        <form
          className="similar-editor"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!chosen || !target) return;
            setBusy(true);
            setMessage('');
            try {
              const r = await relinkProduct(
                chosen.id,
                target.id,
                Number(factor),
                chosen.updated_at,
              );
              setMessage(r.error || `Vínculo salvo em ${target.internal_code} — ${target.name}.`);
              if (!r.error) {
                setLinks((rows) => rows.filter((l) => l.id !== chosen.id));
                setSelected('');
                router.refresh();
              }
            } catch {
              setMessage('Não foi possível salvar. Tente novamente.');
            } finally {
              setBusy(false);
            }
          }}
        >
          <h3>Vincular a um produto existente</h3>
          <p>
            O código do fornecedor passará a usar o produto escolhido nas próximas importações.
            Notas anteriores e estoque já movimentado permanecem no cadastro original.
          </p>
          {busy && <p role="status">Carregando ou salvando…</p>}
          {!busy && !links.length && (
            <p>
              Nenhum vínculo de fornecedor disponível neste cadastro. Você pode corrigir o nome ou
              abrir o cadastro do produto.
            </p>
          )}
          {!!links.length && (
            <>
              <label>
                Código do fornecedor a vincular
                <select
                  required
                  value={selected}
                  disabled={busy}
                  onChange={(e) => {
                    setSelected(e.target.value);
                    const l = links.find((l) => l.id === e.target.value);
                    setFactor(l && target?.base_uom === item.base_uom ? String(l.factor) : '');
                  }}
                >
                  <option value="">Selecione o vínculo</option>
                  {links.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.supplierName} · {l.supplier_code} · {l.source_unit}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Buscar produto de destino
                <input
                  value={search}
                  disabled={busy}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Nome ou código interno"
                />
              </label>
              <label>
                Produto existente
                <select
                  required
                  value={targetId}
                  disabled={busy}
                  onChange={(e) => {
                    setTargetId(e.target.value);
                    setFactor(
                      chosen &&
                        items.find((i) => i.id === e.target.value)?.base_uom === item.base_uom
                        ? String(chosen.factor)
                        : '',
                    );
                  }}
                >
                  <option value="">Selecione o produto</option>
                  {candidates.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.internal_code} — {p.name} · {p.base_uom}
                    </option>
                  ))}
                </select>
              </label>
              {target && chosen && (
                <label>
                  1 {chosen.source_unit} do fornecedor equivale a quantos {target.base_uom}?
                  <input
                    type="number"
                    required
                    min="0.000001"
                    step="0.000001"
                    value={factor}
                    disabled={busy}
                    onChange={(e) => setFactor(e.target.value)}
                  />
                </label>
              )}
            </>
          )}
          <div className="heading-actions">
            <button className="primary" disabled={busy || !chosen || !target}>
              Salvar vínculo
            </button>
            <button
              type="button"
              className="secondary"
              disabled={busy}
              onClick={() => setMode(null)}
            >
              Fechar
            </button>
          </div>
        </form>
      )}
      {message && (
        <p className="similar-feedback" role="status">
          {message}
        </p>
      )}
    </article>
  );
}
