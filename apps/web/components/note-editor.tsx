'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Plus, Trash2, Download } from 'lucide-react';
import { editNote } from '@/app/notas/[id]/actions';
import type { Database, Json } from '../../../packages/db/types/database';
type Tables = Database['public']['Tables'];
type Note = Tables['stockai_receipts']['Row'] & {
  supplier: { name: string } | null;
  lines: Tables['stockai_receipt_lines']['Row'][];
};
type Item = Tables['stockai_items']['Row'];
const money = (n: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n / 100);
function Snapshot({ data, items }: { data: Json; items: Item[] }) {
  const s = data as {
    receipt: { invoice_number: string; invoice_total_cents: number; notes: string };
    lines: {
      item_id: string;
      invoiced_qty: number;
      counted_qty: number | null;
      unit_price_cents: number;
    }[];
  };
  return (
    <div>
      <p>
        Nota {s.receipt.invoice_number} · {money(s.receipt.invoice_total_cents ?? 0)}
      </p>
      {s.receipt.notes && <p>{s.receipt.notes}</p>}
      <ul>
        {s.lines?.map((l, i) => (
          <li key={i}>
            {items.find((v) => v.id === l.item_id)?.name ?? 'Produto'}: {l.invoiced_qty} na nota ·{' '}
            {l.counted_qty ?? '—'} recebido · {money(l.unit_price_cents)} por unidade
          </li>
        ))}
      </ul>
    </div>
  );
}
export function NoteEditor({
  note,
  units,
  items,
  history,
  hasXml,
}: {
  note: Note;
  units: { id: string; name: string }[];
  items: Item[];
  history: Tables['stockai_receipt_revisions']['Row'][];
  hasXml: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [request] = useState(() => crypto.randomUUID());
  const [lines, setLines] = useState(
    note.lines.map((l) => ({
      key: l.id,
      item_id: l.item_id,
      quantity: String(l.invoiced_qty),
      price: String(l.unit_price_cents / 100),
      counted: l.counted_qty === null ? '' : String(l.counted_qty),
    })),
  );
  const closed = note.status === 'closed';
  const editable = units.some((u) => u.id === note.unit_id);
  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError('');
    try {
      const result = await editNote({
        id: note.id,
        revision: note.revision,
        request,
        reason: f.get('reason'),
        header: {
          unit_id: f.get('unit'),
          supplier: f.get('supplier'),
          invoice_number: f.get('number'),
          invoice_series: f.get('series'),
          issued_at: f.get('issued')
            ? new Date(String(f.get('issued')) + 'T12:00:00-03:00').toISOString()
            : '',
          invoice_total_cents: Math.round(Number(f.get('total')) * 100),
          notes: f.get('notes'),
        },
        lines: lines.map((l) => ({
          item_id: l.item_id,
          quantity: Number(l.quantity),
          price_cents: Math.round(Number(l.price) * 1e10) / 1e8,
          counted: closed ? Number(l.counted) : null,
        })),
      });
      if (result.error) setError(result.error);
      else router.refresh();
    } catch {
      setError('Não foi possível salvar. Tente novamente.');
    } finally {
      setBusy(false);
    }
  }
  function change(index: number, field: string, value: string) {
    setLines((ls) => ls.map((l, i) => (i === index ? { ...l, [field]: value } : l)));
  }
  return (
    <main className="note-page">
      <Link className="text-button" href="/operacao">
        <ArrowLeft size={16} /> Voltar para recebimentos
      </Link>
      <header className="note-heading">
        <div>
          <div className="eyebrow">Recebimentos · Versão {note.revision}</div>
          <h1>Editar nota {note.invoice_number}</h1>
          <p>Ajuste os dados e os produtos desta entrada.</p>
        </div>
        {hasXml && (
          <a className="secondary" href={`/api/notas/${note.id}/xml`}>
            <Download size={16} /> XML original
          </a>
        )}
      </header>
      <div className="info-banner">
        <p>
          {closed
            ? 'Ao salvar, o estoque e as divergências serão recalculados com as quantidades recebidas abaixo.'
            : 'Ao salvar, a nota voltará para conferência dos itens.'}{' '}
          Todas as alterações ficam no histórico. O XML original é preservado.
        </p>
      </div>
      <form onSubmit={save}>
        <fieldset disabled={busy || !editable} className="note-fields">
          <section className="company-card">
            <h2>Dados da nota</h2>
            <div className="note-grid">
              <label className="xml-field">
                Empresa
                <select name="unit" defaultValue={note.unit_id} required>
                  {units.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="xml-field">
                Fornecedor
                <input
                  name="supplier"
                  defaultValue={note.supplier?.name ?? ''}
                  required
                  maxLength={120}
                />
              </label>
              <label className="xml-field">
                Número da nota
                <input name="number" defaultValue={note.invoice_number} required maxLength={44} />
              </label>
              <label className="xml-field">
                Série
                <input name="series" defaultValue={note.invoice_series ?? ''} maxLength={3} />
              </label>
              <label className="xml-field">
                Data de emissão
                <input
                  name="issued"
                  type="date"
                  defaultValue={note.issued_at?.slice(0, 10) ?? ''}
                />
              </label>
              <label className="xml-field">
                Total da nota (R$)
                <input
                  name="total"
                  type="number"
                  min="0"
                  step="0.01"
                  required
                  defaultValue={
                    (note.invoice_total_cents ??
                      note.lines.reduce(
                        (s, l) => s + (l.fiscal_total_cents ?? l.invoiced_qty * l.unit_price_cents),
                        0,
                      )) / 100
                  }
                />
              </label>
            </div>
            <label className="xml-field">
              Observações
              <textarea name="notes" defaultValue={note.notes} maxLength={2000} />
            </label>
          </section>
          <section className="company-card">
            <h2>Produtos</h2>
            <p>Quantidades na unidade do seu cadastro: KG, L ou UN.</p>
            <div className="note-lines">
              {lines.map((l, index) => (
                <div className="receipt-edit-line" key={l.key}>
                  <label className="xml-field">
                    Produto
                    <select
                      aria-label={`Produto ${index + 1}`}
                      value={l.item_id}
                      required
                      onChange={(e) => change(index, 'item_id', e.target.value)}
                    >
                      <option value="">Selecione</option>
                      {items
                        .filter((i) => i.is_active || i.id === l.item_id)
                        .map((i) => (
                          <option key={i.id} value={i.id}>
                            {i.internal_code} · {i.name} · {i.base_uom}
                          </option>
                        ))}
                    </select>
                  </label>
                  <label className="xml-field">
                    Quantidade na nota
                    <input
                      aria-label={`Quantidade na nota ${index + 1}`}
                      type="number"
                      min="0.0001"
                      step="0.0001"
                      required
                      value={l.quantity}
                      onChange={(e) => change(index, 'quantity', e.target.value)}
                    />
                  </label>
                  <label className="xml-field">
                    Preço unitário (R$)
                    <input
                      aria-label={`Preço unitário ${index + 1}`}
                      type="number"
                      min="0"
                      step="any"
                      required
                      value={l.price}
                      onChange={(e) => change(index, 'price', e.target.value)}
                    />
                  </label>
                  {closed && (
                    <label className="xml-field">
                      Quantidade recebida
                      <input
                        aria-label={`Quantidade recebida ${index + 1}`}
                        type="number"
                        min="0"
                        step="0.0001"
                        required
                        value={l.counted}
                        onChange={(e) => change(index, 'counted', e.target.value)}
                      />
                    </label>
                  )}
                  <button
                    type="button"
                    className="text-button"
                    aria-label={`Remover produto ${index + 1}`}
                    disabled={lines.length === 1}
                    onClick={() => setLines((ls) => ls.filter((_, i) => i !== index))}
                  >
                    <Trash2 size={17} />
                  </button>
                </div>
              ))}
            </div>
            <button
              type="button"
              className="text-button"
              onClick={() =>
                setLines((ls) => [
                  ...ls,
                  {
                    key: crypto.randomUUID(),
                    item_id: '',
                    quantity: '1',
                    price: '0',
                    counted: '0',
                  },
                ])
              }
            >
              <Plus size={16} />
              Adicionar produto
            </button>
          </section>
          <section className="company-card">
            <label className="xml-field">
              Motivo da alteração
              <textarea
                name="reason"
                required
                minLength={3}
                maxLength={1000}
                placeholder="Descreva o que foi corrigido"
              />
            </label>
            <button className="primary" disabled={busy}>
              {busy ? 'Salvando…' : 'Salvar alteração'}
            </button>
          </section>
        </fieldset>
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
        {!editable && (
          <p>Seu acesso permite consultar esta nota. Solicite a edição a um gestor da empresa.</p>
        )}
      </form>
      <section className="company-card">
        <h2>Histórico de alterações</h2>
        {!history.length && <p>A nota ainda não foi editada.</p>}
        {history.map((h) => (
          <details className="revision-entry" key={h.id}>
            <summary>
              Versão {h.version} · {new Date(h.created_at).toLocaleString('pt-BR')} · {h.reason}
            </summary>
            <div className="note-grid">
              <div>
                <h3>Antes</h3>
                <Snapshot data={h.before_data} items={items} />
              </div>
              <div>
                <h3>Depois</h3>
                <Snapshot data={h.after_data} items={items} />
              </div>
            </div>
          </details>
        ))}
      </section>
    </main>
  );
}
