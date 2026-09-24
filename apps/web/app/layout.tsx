import type { Metadata } from 'next';
import './globals.css';
import { ThemeSwitch } from '@/components/theme-switch';
export const metadata: Metadata = {
  title: 'Stockai · Controle que começa no recebimento',
  description: 'Recebimento, estoque e inteligência para sua operação.',
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{document.documentElement.dataset.theme=localStorage.getItem('stockai-theme')==='light'?'light':'dark'}catch(e){}",
          }}
        />
      </head>
      <body>
        <ThemeSwitch />
        {children}
      </body>
    </html>
  );
}
