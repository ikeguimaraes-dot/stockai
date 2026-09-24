'use client';
import { useEffect, useState } from 'react';
import { Sun, Moon } from 'lucide-react';
export function ThemeSwitch() {
  const [light, setLight] = useState(false);
  useEffect(() => {
    setLight(document.documentElement.dataset.theme === 'light');
  }, []);
  return (
    <header className="theme-header">
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
