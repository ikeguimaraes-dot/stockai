'use client';
import { useState } from 'react';
import { Boxes, ShieldCheck, Check } from 'lucide-react';
export function BlindCount({
  receipt,
}: {
  receipt: {
    id: string;
    supplier: string;
    unit: string;
    status: string;
    lines: { id: string; name: string; uom: string }[];
  };
}) {
  const [done, setDone] = useState(receipt.status !== 'counting');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return (
    <div className="setup-page">
      <section className="panel" style={{ width: 560, maxWidth: '100%', padding: 24 }}>
        <div className="eyebrow">
          <Boxes size={23} />
        </div>
        <h1>{receipt.supplier}</h1>
        <p style={{ margin: '8px 0 20px', color: 'var(--muted)' }}>
          {receipt.unit} · Conferência de mercadoria
        </p>
        {done ? (
          <div className="empty">
            <Check size={38} />
            <h3>Conferência registrada.</h3>
            <p>O gestor acompanha os próximos passos na operação.</p>
          </div>
        ) : (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError('');
              const form = new FormData(e.currentTarget);
              try {
                const response = await fetch('/api/receipts', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    action: 'count',
                    id: receipt.id,
                    counts: Object.fromEntries(
                      receipt.lines.map((l) => [l.id, Number(form.get(l.id))]),
                    ),
                  }),
                });
                const body = await response.json();
                if (!response.ok) throw new Error(body.error);
                setDone(true);
              } catch (err) {
                setError(err instanceof Error ? err.message : 'Tente novamente.');
              } finally {
                setBusy(false);
              }
            }}
          >
            <div className="info-banner">
              <ShieldCheck size={22} />
              <p>
                <strong>Conte o que realmente chegou.</strong>Informe a quantidade de cada item. Use
                zero para itens não entregues.
              </p>
            </div>
            <div className="count-lines">
              {receipt.lines.map((l) => (
                <label key={l.id}>
                  <span>
                    <strong>{l.name}</strong>
                    <small>{l.uom}</small>
                  </span>
                  <input
                    aria-label={`Quantidade de ${l.name}`}
                    name={l.id}
                    required
                    type="number"
                    min="0"
                    max="999999999"
                    step="0.0001"
                    inputMode="decimal"
                  />
                </label>
              ))}
            </div>
            {error && (
              <p role="alert" className="error">
                {error}
              </p>
            )}
            <button className="primary full" disabled={busy} style={{ marginTop: 25 }}>
              {busy ? 'Registrando...' : 'Finalizar conferência'}
              <Check size={18} />
            </button>
          </form>
        )}
      </section>
    </div>
  );
}
