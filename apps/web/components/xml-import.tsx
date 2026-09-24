'use client';
import { useState } from 'react';
import Link from 'next/link';
import { FileUp } from 'lucide-react';
type Result = {
  id?: string;
  status: string;
  message: string;
  createdId?: string;
  receipts?: unknown;
};
export function XmlImport({
  onProgress,
  onBusyChange,
}: {
  onImported: (r: { receipts: unknown; createdId: string }) => void;
  onProgress: (r: { receipts: unknown; createdId: string }) => void;
  onBusyChange: (busy: boolean) => void;
}) {
  const [files, setFiles] = useState<{ file: File; requestId: string; result?: Result }[]>([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  async function upload(batch: typeof files) {
    setBusy(true);
    onBusyChange(true);
    try {
      for (let i = 0; i < batch.length; i++) {
        const entry = batch[i];
        if (entry.result?.id) continue;
        setProgress(`Enviando ${i + 1} de ${batch.length}…`);
        let result: Result;
        try {
          if (entry.file.size > 1024 * 1024) throw new Error('O arquivo ultrapassa 1 MB.');
          const xml = new TextDecoder('utf-8', { fatal: true }).decode(
            await entry.file.arrayBuffer(),
          );
          const response = await fetch('/api/xml-inbox', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'queue',
              filename: entry.file.name,
              xml,
              requestId: entry.requestId,
            }),
          });
          const data = await response.json();
          if (!response.ok) throw new Error(data.error || 'Não foi possível enviar.');
          result = data;
          if (data.createdId && data.receipts)
            onProgress({ createdId: data.createdId, receipts: data.receipts });
        } catch (error) {
          result = {
            status: 'error',
            message: error instanceof Error ? error.message : 'Falha no envio. Tente novamente.',
          };
        }
        entry.result = result;
        setFiles([...batch]);
      }
    } finally {
      setBusy(false);
      onBusyChange(false);
      setProgress('Envio concluído. Os arquivos sem vínculo estão salvos em Identificação.');
    }
  }
  return (
    <div className="xml-import">
      <p className="muted">
        Selecione todos os XMLs. Eles serão salvos um por vez. Códigos já vinculados são
        reconhecidos automaticamente; os demais ficam em Identificação para você resolver depois.
      </p>
      <label className="xml-upload">
        <FileUp size={28} />
        <strong>Enviar XMLs</strong>
        <span>Sem limite de quantidade · 1 MB por arquivo · UTF-8</span>
        <input
          type="file"
          multiple
          accept=".xml,application/xml,text/xml"
          aria-label="Arquivo XML da NF-e"
          disabled={busy}
          onChange={(e) => {
            const batch = Array.from(e.target.files ?? []).map((file) => ({
              file,
              requestId: crypto.randomUUID(),
            }));
            setFiles(batch);
            if (batch.length) void upload(batch);
            e.target.value = '';
          }}
        />
      </label>
      {progress && <p role="status">{progress}</p>}
      <div className="xml-batch-list">
        {files.map((entry, i) => (
          <div className="xml-batch-file" key={entry.requestId}>
            <span>
              <strong>{entry.file.name}</strong>
              <small>{entry.result?.message ?? 'Aguardando envio'}</small>
            </span>
            <b>
              {entry.result?.status === 'imported'
                ? 'Importada'
                : entry.result?.status === 'duplicate'
                  ? 'Duplicada'
                  : entry.result?.id
                    ? 'Salva para identificação'
                    : entry.result?.status === 'error'
                      ? 'Não enviado'
                      : `${i + 1}/${files.length}`}
            </b>
          </div>
        ))}
      </div>
      {!busy && files.some((f) => !f.result?.id) && (
        <button className="secondary" onClick={() => void upload([...files])}>
          Tentar novamente os não enviados
        </button>
      )}
      <Link
        href="/identificacao"
        className="primary"
        aria-disabled={busy}
        onClick={(e) => {
          if (busy) e.preventDefault();
        }}
      >
        Abrir Identificação
      </Link>
    </div>
  );
}
