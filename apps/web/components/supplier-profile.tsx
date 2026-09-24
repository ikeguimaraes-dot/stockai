'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { saveSupplier } from '@/app/fornecedores/actions';
import type { Database } from '../../../packages/db/types/database';
type Supplier = Database['public']['Tables']['stockai_suppliers']['Row'];
export function SupplierProfile({
  supplier,
  orgs,
  editableOrgs,
}: {
  supplier: Supplier | null;
  orgs: { id: string; name: string }[];
  editableOrgs: string[];
}) {
  const router = useRouter();
  const [orgId, setOrgId] = useState(supplier?.org_id ?? editableOrgs[0] ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const allowed = editableOrgs.includes(orgId);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setSaved(false);
    try {
      const r = await saveSupplier(new FormData(e.currentTarget));
      if (r.error) {
        setError(r.error);
        return;
      }
      if (!supplier) router.replace(`/fornecedores/${r.id}`);
      else {
        setSaved(true);
        router.refresh();
      }
    } catch {
      setError('Não foi possível salvar. Confira sua conexão e tente novamente.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="supplier-profile">
      <Link href="/fornecedores" className="secondary">
        ← Fornecedores
      </Link>
      <header>
        <p className="eyebrow">CADASTRO INDIVIDUAL</p>
        <h1>{supplier?.name ?? 'Novo fornecedor'}</h1>
        <p className="muted">
          Só o nome é obrigatório. Você pode completar as outras informações depois.
        </p>
      </header>
      <form onSubmit={submit} className="panel supplier-profile-form">
        <input type="hidden" name="id" value={supplier?.id ?? ''} />
        <input type="hidden" name="revision" value={supplier?.revision ?? 1} />
        <input type="hidden" name="orgId" value={orgId} />
        <label className="xml-field">
          Grupo
          <select
            aria-label="Grupo"
            value={orgId}
            disabled={!!supplier || busy}
            onChange={(e) => setOrgId(e.target.value)}
          >
            {orgs
              .filter((o) => !!supplier || editableOrgs.includes(o.id))
              .map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
          </select>
        </label>
        <fieldset disabled={!allowed || busy} className="supplier-profile-fields">
          {(
            [
              { key: 'name', label: 'Nome do fornecedor', max: 120 },
              { key: 'legal_name', label: 'Razão social', max: 200 },
              { key: 'tax_id', label: 'CNPJ', max: 30 },
              { key: 'contact_name', label: 'Pessoa de contato', max: 200 },
              { key: 'email', label: 'E-mail', max: 200 },
              { key: 'phone', label: 'Telefone / WhatsApp', max: 200 },
            ] as const
          ).map((f) => (
            <label key={f.key} className="xml-field">
              {f.label}
              {f.key === 'name' ? ' *' : ''}
              <input
                name={f.key}
                type={f.key === 'email' ? 'email' : 'text'}
                required={f.key === 'name'}
                maxLength={f.max}
                defaultValue={supplier?.[f.key] ?? ''}
              />
            </label>
          ))}
          <label className="xml-field supplier-wide">
            Endereço
            <textarea
              name="address"
              maxLength={500}
              rows={2}
              defaultValue={supplier?.address ?? ''}
            />
          </label>
          <label className="xml-field supplier-wide">
            Observações
            <textarea name="notes" maxLength={4000} rows={4} defaultValue={supplier?.notes ?? ''} />
          </label>
        </fieldset>
        {supplier?.aliases.length ? (
          <p className="muted">Outros nomes na base: {supplier.aliases.join(', ')}</p>
        ) : null}
        {supplier?.review_note && (
          <p className="supplier-review-note">Referência da importação: {supplier.review_note}</p>
        )}
        {!allowed && <p className="muted">Somente gestores do grupo podem editar este cadastro.</p>}
        {error && <p role="alert">{error}</p>}
        {saved && <p role="status">Fornecedor salvo com sucesso.</p>}
        {allowed && (
          <button className="primary" disabled={busy}>
            {busy ? 'Salvando…' : 'Salvar fornecedor'}
          </button>
        )}
      </form>
    </main>
  );
}
