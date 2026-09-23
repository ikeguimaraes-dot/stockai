'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Boxes, ArrowRight, ShieldCheck } from 'lucide-react';
import { signIn, setup, signOut } from '@/app/actions';
export function Access({ configured }: { configured: boolean }) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <div className="access-page">
      <div className="access-story">
        <Link href="/" className="brand">
          <span className="brand-icon">
            <Boxes size={31} />
          </span>
          stock<span>ai</span>
          <i />
        </Link>
        <div>
          <span className="eyebrow">INTELIGÊNCIA EM CADA ENTRADA</span>
          <h1>
            O controle começa
            <br />
            na porta da cozinha.
          </h1>
          <p>
            Receba com confiança. Enxergue as diferenças.
            <br />
            Cuide do resultado da sua operação.
          </p>
          <div className="access-art">
            <Boxes size={100} strokeWidth={0.6} />
            <span>FISCAL</span>
            <span>FÍSICO</span>
            <span>FINANCEIRO</span>
          </div>
        </div>
        <small>Feito para o ritmo da sua cozinha.</small>
      </div>
      <div className="access-form">
        <div>
          <span className="eyebrow">BEM-VINDO AO STOCKAI</span>
          <h2>Sua operação começa aqui.</h2>
          <p>Use o mesmo e-mail e senha já cadastrados nos sistemas do grupo.</p>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError('');
              const result = await signIn(new FormData(e.currentTarget));
              setError(result.error);
              setBusy(false);
            }}
          >
            <label>
              E-mail
              <input
                name="email"
                type="email"
                placeholder="voce@restaurante.com.br"
                autoComplete="username"
                required
              />
            </label>
            <label>
              Senha
              <input
                name="password"
                type="password"
                placeholder="Sua senha"
                autoComplete="current-password"
                required
              />
            </label>
            {!configured && (
              <div className="info-banner">
                <p>
                  O ambiente de operação ainda não foi conectado. Você pode explorar a demonstração
                  abaixo.
                </p>
              </div>
            )}
            {error && (
              <p role="alert" className="error">
                {error}
              </p>
            )}
            <button className="primary full" disabled={busy || !configured}>
              {busy ? 'Entrando...' : 'Entrar na operação'}
              <ArrowRight size={17} />
            </button>
          </form>
          <Link className="demo-link" href="/demo">
            Explorar demonstração
            <ArrowRight size={15} />
          </Link>
          <div className="access-security">
            <ShieldCheck size={15} />
            Acesso individual. Dados separados por organização.
          </div>
        </div>
      </div>
    </div>
  );
}
export function Setup({
  companies = [],
  orgs = [],
  initialCompanyId,
  onSaved,
  onCancel,
}: {
  companies?: import('@/lib/company').Company[];
  orgs?: { id: string; name: string }[];
  initialCompanyId?: string;
  onSaved?: () => void;
  onCancel?: () => void;
}) {
  const router = useRouter();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState(initialCompanyId ?? companies[0]?.id ?? '');
  const company = companies.find((c) => c.id === selected);
  return (
    <div className="setup-page">
      <div className="panel access-form">
        <div>
          <span className="eyebrow">{onCancel ? 'EMPRESAS' : 'PRIMEIRO PASSO'}</span>
          <h2>
            {onCancel ? (company ? 'Editar empresa' : 'Nova empresa') : 'Cadastre sua empresa.'}
          </h2>
          <p>
            Informe a empresa destinatária das notas. Cada recebimento ficará vinculado ao seu CNPJ.
          </p>
          <form
            key={selected}
            onChange={() => setError('')}
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError('');
              try {
                const result = await setup(new FormData(e.currentTarget));
                if (result.error) {
                  setError(result.error);
                  return;
                }
                if (onSaved) onSaved();
                else router.replace('/operacao');
                router.refresh();
              } catch {
                setError('Não foi possível salvar. Tente novamente.');
              } finally {
                setBusy(false);
              }
            }}
          >
            {initialCompanyId === undefined && companies.length > 0 && (
              <label>
                Empresa a cadastrar ou atualizar
                <select value={selected} onChange={(e) => setSelected(e.target.value)}>
                  {companies.map((c) => (
                    <option value={c.id} key={c.id}>
                      {c.name}
                      {!c.tax_id ? ' · cadastro pendente' : ''}
                    </option>
                  ))}
                  <option value="">Cadastrar outra empresa</option>
                </select>
              </label>
            )}
            <input type="hidden" name="unitId" value={selected} />
            {company ? (
              <input type="hidden" name="orgId" value={company.org_id} />
            ) : orgs.length > 0 ? (
              <label>
                Grupo
                <select name="orgId">
                  {orgs.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                    </option>
                  ))}
                  <option value="new">+ Novo grupo (empresa independente)</option>
                </select>
              </label>
            ) : (
              <input type="hidden" name="orgId" value="new" />
            )}
            <label>
              Nome fantasia
              <input
                name="name"
                required
                minLength={2}
                defaultValue={company?.name}
                placeholder="Ex.: Restaurante Jardins"
                maxLength={80}
              />
            </label>
            <label>
              Razão social
              <input
                name="legalName"
                required
                minLength={2}
                defaultValue={company?.legal_name ?? ''}
                placeholder="Nome empresarial da nota fiscal"
                maxLength={160}
              />
            </label>
            <label>
              CNPJ
              <input
                name="taxId"
                required
                defaultValue={company?.tax_id ?? ''}
                placeholder="00.000.000/0001-00"
                maxLength={18}
                autoCapitalize="characters"
              />
            </label>
            {error && (
              <p role="alert" className="error">
                {error}
              </p>
            )}
            <button className="primary full" disabled={busy}>
              {busy ? 'Salvando...' : onCancel ? 'Salvar empresa' : 'Salvar empresa e continuar'}
              <ArrowRight size={17} />
            </button>
          </form>
          {onCancel && (
            <button className="demo-link full" type="button" onClick={onCancel} disabled={busy}>
              Voltar às empresas
            </button>
          )}
          {!onCancel && companies.some((c) => c.tax_id) && (
            <Link className="demo-link" href="/operacao">
              Voltar à operação <ArrowRight size={15} />
            </Link>
          )}
          <form action={signOut}>
            <button className="text-button">Sair da conta</button>
          </form>
        </div>
      </div>
    </div>
  );
}
