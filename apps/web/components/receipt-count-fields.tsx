'use client';
import { Check } from 'lucide-react';
export type CountLine = {
  id: string;
  name: string;
  uom: string;
  invoiced: number;
  sourceQuantity?: string;
  sourceUnit?: string;
};
const qty = (n: number) => new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 4 }).format(n);
export function ReceiptCountFields({
  lines,
  counts,
  onChange,
  disabled = false,
}: {
  lines: CountLine[];
  counts: Record<string, string>;
  onChange: (values: Record<string, string>) => void;
  disabled?: boolean;
}) {
  return (
    <fieldset className="receipt-count-fields" disabled={disabled}>
      <div className="info-banner">
        <Check size={22} />
        <p>
          <strong>Compare com o que chegou.</strong> Confira a quantidade da nota e informe a
          recebida. Se veio certo, use os atalhos; depois finalize a conferência.
        </p>
      </div>
      <button
        type="button"
        className="secondary full"
        onClick={() => onChange(Object.fromEntries(lines.map((l) => [l.id, String(l.invoiced)])))}
      >
        <Check size={17} />
        Preencher tudo conforme a nota
      </button>
      <div className="receipt-count-grid">
        {lines.map((l) => {
          const source = Number(l.sourceQuantity);
          const converted =
            l.sourceQuantity &&
            l.sourceUnit &&
            Number.isFinite(source) &&
            (source !== l.invoiced || l.sourceUnit !== l.uom);
          return (
            <div className="receipt-count-row" key={l.id}>
              <div className="receipt-count-product">
                <strong>{l.name}</strong>
                <span>
                  Na nota:{' '}
                  <b>
                    {converted ? qty(source) : qty(l.invoiced)} {converted ? l.sourceUnit : l.uom}
                  </b>
                </span>
                {converted && (
                  <small>
                    Equivalente no estoque: {qty(l.invoiced)} {l.uom}. Informe o recebido em {l.uom}
                    .
                  </small>
                )}
              </div>
              <label className="xml-field">
                Recebido ({l.uom})
                <input
                  aria-label={`Quantidade de ${l.name}`}
                  type="number"
                  min="0"
                  max="999999999"
                  step="0.0001"
                  inputMode="decimal"
                  required
                  placeholder="Informe ou confirme"
                  value={counts[l.id] ?? ''}
                  onChange={(e) => onChange({ ...counts, [l.id]: e.target.value })}
                />
              </label>
              <button
                type="button"
                className="secondary"
                aria-label={`Veio certo: ${l.name}`}
                onClick={() => onChange({ ...counts, [l.id]: String(l.invoiced) })}
              >
                <Check size={16} />
                Veio certo
              </button>
            </div>
          );
        })}
      </div>
    </fieldset>
  );
}
