'use client';
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <div className="empty">
      <h1>Não conseguimos carregar a operação.</h1>
      <p>Verifique a conexão e tente novamente. Nenhum dado foi alterado.</p>
      <button className="primary" onClick={reset} style={{ marginTop: 20 }}>
        Tentar novamente
      </button>
    </div>
  );
}
