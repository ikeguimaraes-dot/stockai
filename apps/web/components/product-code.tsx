'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { updateProductCode } from '@/app/produtos/actions';
export function ProductCode({
  itemId,
  code,
  editable = false,
}: {
  itemId?: string;
  code?: string;
  editable?: boolean;
}) {
  const router = useRouter();
  const [value, setValue] = useState(code ?? '');
  const [saved, setSaved] = useState(code ?? '');
  const [busy, setBusy] = useState(false);
  const [destination, setDestination] = useState<{ id: string; code: string; name: string } | null>(
    null,
  );
  const [message, setMessage] = useState('');
  useEffect(() => {
    setValue(code ?? '');
    setSaved(code ?? '');
  }, [code]);
  useEffect(() => {
    const changed = (event: Event) => {
      const d = (event as CustomEvent<{ itemId: string; code: string }>).detail;
      if (d.itemId === itemId) {
        setValue(d.code);
        setSaved(d.code);
      }
    };
    window.addEventListener('stockai-product-code', changed);
    return () => window.removeEventListener('stockai-product-code', changed);
  }, [itemId]);
  if (!editable || !itemId) return <small>Código interno: {saved || 'Não informado'}</small>;
  return (
    <div className="product-code-editor">
      <label>
        Código interno
        <input
          aria-label="Código interno do produto"
          value={value}
          maxLength={60}
          disabled={busy}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.preventDefault();
          }}
          onChange={(e) => {
            setValue(e.target.value);
            setMessage('');
          }}
        />
      </label>
      <button
        type="button"
        className="secondary"
        disabled={busy || !value.trim() || value.trim() === saved}
        onClick={async () => {
          setBusy(true);
          setMessage('');
          try {
            const result = await updateProductCode(itemId, value, saved);
            if (result.error) {
              setMessage(result.error);
              return;
            }
            const assignment = result.assignment;
            if (assignment?.linked) {
              setDestination({
                id: assignment.item_id,
                code: assignment.code,
                name: assignment.name,
              });
              setValue(saved);
              setMessage(
                `${assignment.links} vínculo(s) transferido(s) para ${assignment.code}. As próximas importações usarão esse produto.`,
              );
              router.refresh();
              return;
            }
            setDestination(null);
            const next = assignment?.code ?? value.trim();
            setSaved(next);
            setValue(next);
            setMessage('Código salvo.');
            window.dispatchEvent(
              new CustomEvent('stockai-product-code', { detail: { itemId, code: next } }),
            );
            router.refresh();
          } catch {
            setMessage('Não foi possível salvar. Tente novamente.');
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? 'Salvando…' : 'Salvar código'}
      </button>
      {message && <small role="status">{message}</small>}
      {destination && (
        <small>
          <Link href={`/produtos/${destination.id}`}>
            Abrir {destination.code} — {destination.name}
          </Link>
        </small>
      )}
    </div>
  );
}
