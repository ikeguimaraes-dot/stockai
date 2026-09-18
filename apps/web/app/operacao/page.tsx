import { redirect } from 'next/navigation';
import { getWorkspace } from '@/lib/receipts-server';
import { Stockai } from '@/components/stockai';

export const dynamic = 'force-dynamic';
export default async function Operation() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) redirect('/login');
  let workspace;
  try {
    workspace = await getWorkspace();
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHENTICATED') redirect('/login');
    throw error;
  }
  if (!workspace.units.some((u) => u.tax_id && u.legal_name)) redirect('/empresas');
  return (
    <Stockai
      live={{
        initialReceipts: workspace.receipts,
        units: workspace.units,
        orgName: workspace.orgs.map((o) => o.name).join(' · '),
        email: workspace.email,
      }}
    />
  );
}
