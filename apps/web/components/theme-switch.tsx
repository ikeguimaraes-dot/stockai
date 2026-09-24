'use client';
import { useEffect, useState } from 'react';
import { Sun, Moon, Menu } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
export function ThemeSwitch() {
  const pathname = usePathname();
  const [light, setLight] = useState(false);
  useEffect(() => {
    setLight(document.documentElement.dataset.theme === 'light');
  }, []);
  return (
    <header className="theme-header">
      {pathname !== '/login' && pathname !== '/' && (
        <details className="mobile-navigation" key={pathname}>
          <summary>
            <Menu size={18} /> Menu
          </summary>
          <nav aria-label="Menu móvel">
            {[
              ['/operacao', 'Recebimentos e visão geral'],
              ['/produtos', 'Produtos'],
              ['/empresas', 'Empresas'],
              ['/fornecedores', 'Fornecedores'],
              ['/identificacao', 'Identificação'],
              ['/contas-a-pagar', 'Contas a pagar'],
              ['/devolucoes', 'NF-e de devolução'],
              ['/pedidos', 'Pedidos'],
              ['/entregas', 'Entregas'],
            ].map(([href, label]) => (
              <Link href={href} key={href} aria-current={pathname === href ? 'page' : undefined}>
                {label}
              </Link>
            ))}
          </nav>
        </details>
      )}
      <span>Aparência</span>
      <button
        type="button"
        className="theme-switch"
        aria-label="Tema claro"
        aria-pressed={light}
        onClick={() => {
          const next = !light;
          setLight(next);
          document.documentElement.dataset.theme = next ? 'light' : 'dark';
          try {
            localStorage.setItem('stockai-theme', next ? 'light' : 'dark');
          } catch {
            /* Preference is optional when storage is unavailable. */
          }
        }}
      >
        {light ? <Sun size={17} /> : <Moon size={17} />}
        {light ? 'Claro' : 'Escuro'}
      </button>
    </header>
  );
}
