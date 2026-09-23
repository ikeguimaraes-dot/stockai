'use client';
import { useRef } from 'react';
import type { Signature } from '@/lib/orders';
export function SignatureDrawing({
  value,
  onChange,
  disabled = false,
}: {
  value: Signature;
  onChange?: (v: Signature) => void;
  disabled?: boolean;
}) {
  const active = useRef<number | null>(null);
  const strokes = useRef(value);
  strokes.current = value;
  function point(e: React.PointerEvent<SVGSVGElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    return [
      Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)),
      Math.max(0, Math.min(1, (e.clientY - r.top) / r.height)),
    ];
  }
  function end(e: React.PointerEvent<SVGSVGElement>) {
    if (active.current === e.pointerId) active.current = null;
  }
  return (
    <div className="signature-field">
      <svg
        viewBox="0 0 600 300"
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label={onChange ? 'Campo para desenhar assinatura' : 'Assinatura de quem recebeu'}
        className="signature-pad"
        onPointerDown={(e) => {
          if (!onChange || disabled || active.current !== null) return;
          e.preventDefault();
          active.current = e.pointerId;
          e.currentTarget.setPointerCapture(e.pointerId);
          strokes.current = [...strokes.current, [point(e)]];
          onChange(strokes.current);
        }}
        onPointerMove={(e) => {
          if (!onChange || disabled || active.current !== e.pointerId) return;
          e.preventDefault();
          const current = strokes.current;
          if (current.flat().length >= 12000) return;
          strokes.current = [...current.slice(0, -1), [...current[current.length - 1], point(e)]];
          onChange(strokes.current);
        }}
        onPointerUp={end}
        onPointerCancel={end}
        onLostPointerCapture={end}
      >
        <line x1="24" y1="240" x2="576" y2="240" stroke="#d6cede" strokeDasharray="4 5" />
        {value.map((stroke, i) => (
          <polyline
            key={i}
            points={stroke.map(([x, y]) => `${x * 600},${y * 300}`).join(' ')}
            fill="none"
            stroke="#291533"
            strokeWidth="2.5"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        ))}
      </svg>
      {onChange && (
        <div className="signature-help">
          <span>Assine com o dedo, caneta ou mouse.</span>
          <button
            className="text-button"
            type="button"
            disabled={disabled}
            onClick={() => {
              active.current = null;
              strokes.current = [];
              onChange([]);
            }}
          >
            Limpar assinatura
          </button>
        </div>
      )}
    </div>
  );
}
