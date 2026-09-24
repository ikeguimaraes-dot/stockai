'use client';
import { useState } from 'react';
import { ReceiptCountFields, type CountLine } from './receipt-count-fields';
import { Boxes, Check } from 'lucide-react';
export function ReceiptConference({
  receipt,
}: {
  receipt: {
    id: string;
    supplier: string;
    unit: string;
    status: string;
    lines: CountLine[];
  };
}) {
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [done, setDone] = useState(receipt.status !== 'counting');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return (
    <div className="setup-page">
      <section className="panel" style={{ width: 850, maxWidth: '100%', padding: 24 }}>
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

              try {
                const response = await fetch('/api/receipts', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    action: 'count',
                    id: receipt.id,
                    counts: Object.fromEntries(
                      receipt.lines.map((l) => [
                        l.id,
                        counts[l.id]?.trim() ? Number(counts[l.id]) : NaN,
                      ]),
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
            <ReceiptCountFields
              lines={receipt.lines}
              counts={counts}
              onChange={setCounts}
              disabled={busy}
            />
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
