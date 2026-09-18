import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {
  title: 'Stockai · Controle que começa no recebimento',
  description: 'Recebimento, estoque e inteligência para sua operação.',
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
