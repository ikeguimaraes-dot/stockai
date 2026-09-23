'use client';
import { useState } from 'react';
import Link from 'next/link';
import { FileUp, CheckCircle2 } from 'lucide-react';
import type { Nfe, NfeMapping } from '@stockai/core/nfe';
export type Preview = {
  invoice: Nfe;
  categories: { id: string; org_id: string; name: string }[];
  items: {
    id: string;
    org_id: string;
    name: string;
    base_uom: string;
    category_id: string | null;
    composes_cmv: boolean | null;
  }[];
  companies: { id: string; orgId: string; name: string; taxId: string; alreadyImported: boolean }[];
};
const money = (cents: number) =>
  (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
type Mapping = NfeMapping & { categoryId?: string; composesCmv?: boolean };
type Entry = {
  id: string;
  name: string;
  xml: string;
  preview?: Preview;
  unitId: string;
  mappings: Mapping[];
  requestId: string;
  status: 'reading' | 'review' | 'imported' | 'error';
  error?: string;
};
type Imported = { receipts: unknown; createdId: string };
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
function duplicate(entry: Entry, entries: Entry[]) {
  if (!entry.preview || !entry.unitId) return false;
  return (
    entry.preview.companies.find((c) => c.id === entry.unitId)?.alreadyImported ||
    entries.some(
      (other) =>
        other.id !== entry.id &&
        other.unitId === entry.unitId &&
        other.preview?.invoice.key === entry.preview?.invoice.key &&
        (other.status === 'imported' || entries.indexOf(other) < entries.indexOf(entry)),
    )
  );
}
function ready(entry: Entry, entries: Entry[]) {
  return (
    !!entry.preview &&
    !!entry.unitId &&
    entry.status !== 'imported' &&
    !duplicate(entry, entries) &&
    entry.mappings.every((m) => Number.isFinite(Number(m.factor)) && Number(m.factor) > 0)
  );
}
export function XmlImport({
  onImported,
  onProgress,
  onBusyChange,
}: {
  onImported: (result: Imported) => void;
  onProgress: (result: Imported) => void;
  onBusyChange: (busy: boolean) => void;
}) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [selected, setSelected] = useState('');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');
  const update = (id: string, change: Partial<Entry>) =>
    setEntries((current) => current.map((e) => (e.id === id ? { ...e, ...change } : e)));
  function processing(value: boolean) {
    setBusy(value);
    onBusyChange(value);
  }
  async function read(files: File[]) {
    if (!files.length) return;
    setError('');
    const batch: Entry[] = files.map((file) => ({
      id: crypto.randomUUID(),
      name: file.name,
      xml: '',
      unitId: '',
      mappings: [],
      requestId: crypto.randomUUID(),
      status: 'reading',
    }));
    setEntries(batch);
    setSelected(batch[0].id);
    processing(true);
    try {
      for (let i = 0; i < files.length; i++) {
        setProgress(`Lendo arquivo ${i + 1} de ${files.length}…`);
        try {
          if (files[i].size > 1024 * 1024) throw new Error('Envie um XML de até 1 MB.');
          let xml: string;
          try {
            xml = new TextDecoder('utf-8', { fatal: true }).decode(await files[i].arrayBuffer());
          } catch {
            throw new Error('Envie o XML original em UTF-8.');
          }
          const preview: Preview = await send({ action: 'preview', xml });
          update(batch[i].id, {
            xml,
            preview,
            status: 'review',
            unitId: preview.companies.length === 1 ? preview.companies[0].id : '',
            mappings: preview.invoice.lines.map((line) => ({
              number: line.number,
              uom: line.suggestedUom || 'UN',
              factor: line.suggestedFactor,
            })),
          });
        } catch (cause) {
          update(batch[i].id, {
            status: 'error',
            error: cause instanceof Error ? cause.message : 'Não foi possível ler o arquivo.',
          });
        }
      }
    } finally {
      processing(false);
      setProgress('');
    }
  }
  async function confirm() {
    const pending = entries.filter((e) => ready(e, entries));
    if (!pending.length) return;
    processing(true);
    setError('');
    let successes = 0;
    try {
      for (let i = 0; i < pending.length; i++) {
        const entry = pending[i];
        setProgress(`Importando nota ${i + 1} de ${pending.length}…`);
        try {
          const company = entry.preview!.companies.find((c) => c.id === entry.unitId)!;
          const result: Imported = await send({
            action: 'import',
            xml: entry.xml,
            unitId: entry.unitId,
            requestId: entry.requestId,
            mappings: entry.mappings.map((m) => {
              const line = entry.preview!.invoice.lines.find((l) => l.number === m.number);
              const existing = entry.preview!.items.some(
                (item) =>
                  item.org_id === company.orgId &&
                  item.name === line?.name &&
                  item.base_uom === m.uom,
              );
              return existing ? { number: m.number, uom: m.uom, factor: m.factor } : m;
            }),
          });
          update(entry.id, { status: 'imported', error: undefined });
          successes++;
          onProgress(result);
          if (entries.length === 1) onImported(result);
        } catch (cause) {
          update(entry.id, {
            status: 'error',
            error:
              cause instanceof Error
                ? cause.message
                : 'Não foi possível importar. Tente novamente.',
          });
        }
      }
      setProgress(
        `${successes} nota(s) importada(s) nesta tentativa. As demais permanecem na lista para revisão.`,
      );
    } finally {
      processing(false);
    }
  }
  const active = entries.find((e) => e.id === selected);
  const pending = entries.filter((e) => ready(e, entries)).length;
  const imported = entries.filter((e) => e.status === 'imported').length;
  function label(e: Entry) {
    if (e.status === 'reading') return 'Lendo';
    if (e.status === 'imported') return 'Importada';
    if (duplicate(e, entries)) return 'Duplicada';
    if (e.status === 'error') return 'Erro — revise';
    return ready(e, entries) ? 'Pronta para importar' : 'Revisar empresa / unidades';
  }
  return (
    <div className="xml-import">
      <p className="muted">
        Selecione um ou vários XMLs completos da NF-e (modelo 55), com protocolo. Cada nota será
        vinculada à empresa pelo CNPJ destinatário.
      </p>
      <label className="xml-upload">
        <FileUp size={28} />
        <strong>Arquivos XML da NF-e</strong>
        <span>Selecione todos os XMLs · Envio um por vez · 1 MB por arquivo · UTF-8</span>
        <input
          aria-label="Arquivo XML da NF-e"
          type="file"
          multiple
          accept=".xml,application/xml,text/xml"
          disabled={busy}
          onChange={(e) => {
            void read(Array.from(e.target.files ?? []));
            e.target.value = '';
          }}
        />
      </label>
      {error && (
        <p className="xml-error" role="alert">
          {error}
        </p>
      )}
      {progress && (
        <p role="status" aria-live="polite">
          {progress}
        </p>
      )}
      {entries.length > 1 && (
        <>
          <div className="xml-batch-summary">
            <strong>{entries.length} arquivos</strong>
            <span>
              {pending} prontos · {imported} importados
            </span>
          </div>
          <div className="xml-batch-list" aria-label="Arquivos do lote">
            {entries.map((e) => (
              <button
                key={e.id}
                type="button"
                className={`xml-batch-file ${selected === e.id ? 'selected' : ''}`}
                aria-pressed={selected === e.id}
                disabled={busy}
                onClick={() => setSelected(e.id)}
              >
                <span>
                  <strong>{e.name}</strong>
                  {e.preview && (
                    <small>
                      NF-e {e.preview.invoice.number} · {e.preview.invoice.supplierName}
                    </small>
                  )}
                </span>
                <b>{label(e)}</b>
              </button>
            ))}
          </div>
          <p className="muted">
            Clique em cada arquivo para revisar. Notas com erro, duplicadas ou com conversão
            pendente não impedem a importação das demais.
          </p>
        </>
      )}
      {active?.error && (
        <div className="xml-error" role="alert">
          {active.error}
          <Link href="/empresas">Ver empresas cadastradas</Link>
        </div>
      )}
      {active?.preview && (
        <>
          {duplicate(active, entries) &&
            !active.preview.companies.find((c) => c.id === active.unitId)?.alreadyImported && (
              <p className="xml-error" role="alert">
                Esta nota está repetida no lote para a mesma empresa. Será importada apenas uma vez.
              </p>
            )}
          {active.status === 'imported' && (
            <p className="catalog-success">
              Nota importada. Consulte Recebimentos para fazer a conferência física.
            </p>
          )}
          <XmlReview
            key={active.id}
            entry={active}
            busy={busy || active.status === 'imported'}
            onChange={(change) =>
              update(active.id, { ...change, error: undefined, status: 'review' })
            }
          />
        </>
      )}
      {entries.some((e) => e.preview) && (
        <button className="primary" disabled={busy || !pending} onClick={() => void confirm()}>
          {entries.length === 1
            ? 'Importar e iniciar conferência'
            : `Importar ${pending} nota(s) pronta(s)`}
        </button>
      )}
    </div>
  );
}
function XmlReview({
  entry,
  busy,
  onChange,
}: {
  entry: Entry;
  busy: boolean;
  onChange: (change: Partial<Entry>) => void;
}) {
  const preview = entry.preview!;
  const { unitId, mappings } = entry;
  const company = preview.companies.find((c) => c.id === unitId);
  const setUnitId = (id: string) => onChange({ unitId: id });
  const setMappings = (update: (ms: Mapping[]) => Mapping[]) =>
    onChange({ mappings: update(mappings) });
  return (
    <div className="xml-review">
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
          onChange={(e) => {
            setUnitId(e.target.value);
            setMappings((ms) =>
              ms.map((m) => ({ number: m.number, uom: m.uom, factor: m.factor })),
            );
          }}
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
        CNPJ no XML: {preview.invoice.recipientTaxId}. Apenas empresas correspondentes são exibidas.
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
          <strong>{money(preview.invoice.productsCents - preview.invoice.discountCents)}</strong>
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
      <p className="muted">
        Categoria e CMV são salvos nos produtos novos. Você pode criar categorias e revisar os
        cadastros em{' '}
        <Link href="/produtos" target="_blank" rel="noreferrer">
          Produtos
        </Link>
        .
      </p>
      <div className="xml-items">
        {preview.invoice.lines.map((line, index) => {
          const mapping = mappings[index];
          const existing = preview.items.find(
            (item) =>
              item.org_id === company?.orgId &&
              item.name === line.name &&
              item.base_uom === mapping.uom,
          );
          const categories = preview.categories.filter((c) => c.org_id === company?.orgId);
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
                            i === index ? { ...m, uom: e.target.value as NfeMapping['uom'] } : m,
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
                      {(Number(line.quantity) * Number(mapping.factor)).toLocaleString('pt-BR', {
                        maximumFractionDigits: 4,
                      })}{' '}
                      {mapping.uom}
                    </span>
                  )}
                </div>
              )}
              {existing ? (
                <div className="xml-classification">
                  <p>
                    Categoria:{' '}
                    <strong>
                      {categories.find((c) => c.id === existing.category_id)?.name ??
                        'Sem categoria'}
                    </strong>{' '}
                    · Compõe CMV:{' '}
                    <strong>
                      {existing.composes_cmv === null
                        ? 'Não definido'
                        : existing.composes_cmv
                          ? 'Sim'
                          : 'Não'}
                    </strong>
                  </p>
                  <small>
                    Classificação preservada do cadastro.{' '}
                    <Link href="/produtos" target="_blank" rel="noreferrer">
                      Editar em Produtos
                    </Link>
                  </small>
                </div>
              ) : (
                <div className="xml-conversion">
                  <label>
                    Categoria
                    <select
                      aria-label={`Categoria do item ${line.number}`}
                      value={mapping.categoryId ?? ''}
                      disabled={busy || !company}
                      onChange={(e) =>
                        setMappings((ms) =>
                          ms.map((m, i) =>
                            i === index ? { ...m, categoryId: e.target.value || undefined } : m,
                          ),
                        )
                      }
                    >
                      <option value="">Sem categoria</option>
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Compõe CMV?
                    <select
                      aria-label={`Compõe CMV do item ${line.number}`}
                      value={mapping.composesCmv === undefined ? '' : String(mapping.composesCmv)}
                      disabled={busy || !company}
                      onChange={(e) =>
                        setMappings((ms) =>
                          ms.map((m, i) =>
                            i === index
                              ? {
                                  ...m,
                                  composesCmv:
                                    e.target.value === '' ? undefined : e.target.value === 'true',
                                }
                              : m,
                          ),
                        )
                      }
                    >
                      <option value="">Não definido</option>
                      <option value="true">Sim</option>
                      <option value="false">Não</option>
                    </select>
                  </label>
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
    </div>
  );
}
