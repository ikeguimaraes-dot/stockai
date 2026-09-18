'use client';
import { useState } from 'react';
import Link from 'next/link';
import { Boxes, ArrowRight, ShieldCheck } from 'lucide-react';
import { signIn, setup } from '@/app/actions';
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
          <p>Entre com o acesso fornecido pelo administrador.</p>
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
                minLength={8}
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
export function Setup() {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <div className="setup-page">
      <div className="panel access-form">
        <div>
          <span className="eyebrow">PRIMEIRO PASSO</span>
          <h2>Vamos organizar sua operação.</h2>
          <p>Crie sua organização e a primeira unidade.</p>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              const result = await setup(new FormData(e.currentTarget));
              setError(result.error);
              setBusy(false);
            }}
          >
            <label>
              Nome da organização
              <input name="org" required placeholder="Grupo empresarial" maxLength={120} />
            </label>
            <label>
              Primeira unidade
              <input name="unit" required placeholder="Ex.: Jardins" maxLength={80} />
            </label>
            {error && (
              <p role="alert" className="error">
                {error}
              </p>
            )}
            <button className="primary full" disabled={busy}>
              {busy ? 'Preparando...' : 'Criar operação'}
              <ArrowRight size={17} />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
