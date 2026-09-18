'use client';

import { useState } from 'react';
import Link from 'next/link';
import { FileUp, CheckCircle2 } from 'lucide-react';
import type { Nfe, NfeMapping } from '@stockai/core/nfe';

type Preview = {
  invoice: Nfe;
  companies: { id: string; name: string; taxId: string; alreadyImported: boolean }[];
};
const money = (cents: number) =>
  (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
export function XmlImport({
  onImported,
}: {
  onImported: (result: { receipts: unknown; createdId: string }) => void;
}) {
  const [xml, setXml] = useState('');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [unitId, setUnitId] = useState('');
  const [mappings, setMappings] = useState<NfeMapping[]>([]);
  const [requestId, setRequestId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function send(payload: object) {
    const response = await fetch('/api/receipts/xml', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Não foi possível importar a nota.');
    return result;
  }
  async function read(file?: File) {
    setPreview(null);
    setError('');
    setXml('');
    setMappings([]);
    setUnitId('');
    if (!file) return;
    setBusy(true);
    try {
      if (file.size > 1024 * 1024) throw new Error('Envie um XML de até 1 MB.');
      let content: string;
      try {
        content = new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer());
      } catch {
        throw new Error('Envie o XML original em UTF-8.');
      }
      const result: Preview = await send({ action: 'preview', xml: content });
      setXml(content);
      setPreview(result);
      setRequestId(crypto.randomUUID());
      setUnitId(result.companies.length === 1 ? result.companies[0].id : '');
      setMappings(
        result.invoice.lines.map((line) => ({
          number: line.number,
          uom: line.suggestedUom || 'UN',
          factor: line.suggestedFactor,
        })),
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível ler o arquivo.');
    } finally {
      setBusy(false);
    }
  }
  async function confirm() {
    setBusy(true);
    setError('');
    try {
      onImported(await send({ action: 'import', xml, unitId, requestId, mappings }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível importar.');
    } finally {
      setBusy(false);
    }
  }
  const company = preview?.companies.find((c) => c.id === unitId);
  const complete = mappings.every((m) => Number(m.factor) > 0);
  return (
    <div className="xml-import">
      <p className="muted">
        Envie o XML completo da NF-e (modelo 55) com protocolo. Revise a empresa e as unidades antes
        de gravar.
      </p>
      <label className="xml-upload">
        <FileUp size={28} />
        <strong>Arquivo XML da NF-e</strong>
        <span>Até 1 MB · UTF-8</span>
        <input
          aria-label="Arquivo XML da NF-e"
          type="file"
          accept=".xml,application/xml,text/xml"
          disabled={busy}
          onChange={(event) => {
            void read(event.target.files?.[0]);
          }}
        />
      </label>
      {busy && <p role="status">Processando a nota…</p>}
      {error && (
        <div className="xml-error" role="alert">
          {error} <Link href="/empresas">Ver empresas cadastradas</Link>
        </div>
      )}
      {preview && (
        <>
          <div className="xml-summary">
            <CheckCircle2 size={24} />
            <div>
              <strong>
                NF-e {preview.invoice.number} · Série {preview.invoice.series}
              </strong>
              <p>
                {preview.invoice.supplierName} · CNPJ {preview.invoice.supplierTaxId}
              </p>
            </div>
          </div>
          <label className="xml-field">
            Empresa destinatária
            <select
              aria-label="Empresa destinatária"
              value={unitId}
              disabled={busy}
              onChange={(e) => setUnitId(e.target.value)}
            >
              <option value="">Selecione a empresa</option>
              {preview.companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} · {c.taxId}
                </option>
              ))}
            </select>
          </label>
          <p className="muted">
            CNPJ no XML: {preview.invoice.recipientTaxId}. Apenas empresas correspondentes são
            exibidas.
          </p>
          {company?.alreadyImported && (
            <p className="xml-error" role="alert">
              Esta nota já foi importada para a empresa. Consulte os recebimentos.
            </p>
          )}
          <div className="xml-totals">
            <div>
              <span>Total da NF-e</span>
              <strong>{money(preview.invoice.totalCents)}</strong>
            </div>
            <div>
              <span>Mercadorias após descontos</span>
              <strong>
                {money(preview.invoice.productsCents - preview.invoice.discountCents)}
              </strong>
            </div>
            <div>
              <span>Frete informado</span>
              <strong>{money(preview.invoice.freightCents)}</strong>
            </div>
          </div>
          <p className="muted">
            A conferência calcula diferenças sobre as mercadorias após descontos. Frete, tributos e
            outros valores da nota permanecem separados.
          </p>
          <div className="xml-items">
            {preview.invoice.lines.map((line, index) => {
              const mapping = mappings[index];
              return (
                <div className="xml-item" key={line.number}>
                  <div>
                    <strong>
                      {line.number}. {line.name}
                    </strong>
                    <p>
                      {Number(line.quantity).toLocaleString('pt-BR')} {line.commercialUnit} ·{' '}
                      {money(line.grossCents - line.discountCents)} após descontos
                    </p>
                  </div>
                  {line.suggestedUom ? (
                    <span className="xml-unit">
                      {(Number(line.quantity) * Number(mapping.factor)).toLocaleString('pt-BR', {
                        maximumFractionDigits: 4,
                      })}{' '}
                      {mapping.uom} no estoque
                    </span>
                  ) : (
                    <div className="xml-conversion">
                      <label>
                        1 {line.commercialUnit} equivale a
                        <input
                          aria-label={`Quantidade por embalagem do item ${line.number}`}
                          type="number"
                          min="0.000001"
                          step="any"
                          value={mapping.factor}
                          disabled={busy}
                          placeholder="Ex.: 6"
                          onChange={(e) =>
                            setMappings((current) =>
                              current.map((m, i) =>
                                i === index ? { ...m, factor: e.target.value } : m,
                              ),
                            )
                          }
                        />
                      </label>
                      <label>
                        Unidade de estoque
                        <select
                          aria-label={`Unidade do item ${line.number}`}
                          value={mapping.uom}
                          disabled={busy}
                          onChange={(e) =>
                            setMappings((current) =>
                              current.map((m, i) =>
                                i === index
                                  ? { ...m, uom: e.target.value as NfeMapping['uom'] }
                                  : m,
                              ),
                            )
                          }
                        >
                          <option value="UN">UN — unidade</option>
                          <option value="KG">KG — quilo</option>
                          <option value="L">L — litro</option>
                        </select>
                      </label>
                      {Number(mapping.factor) > 0 && (
                        <span>
                          Total:{' '}
                          {(Number(line.quantity) * Number(mapping.factor)).toLocaleString(
                            'pt-BR',
                            { maximumFractionDigits: 4 },
                          )}{' '}
                          {mapping.uom}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <details className="xml-key">
            <summary>Chave de acesso e emissão</summary>
            <p>{preview.invoice.key}</p>
            <p>Emissão: {new Date(preview.invoice.issuedAt).toLocaleDateString('pt-BR')}</p>
          </details>
          <button
            className="primary"
            disabled={busy || !company || company.alreadyImported || !complete}
            onClick={() => {
              void confirm();
            }}
          >
            Importar e iniciar conferência
          </button>
        </>
      )}
    </div>
  );
}
