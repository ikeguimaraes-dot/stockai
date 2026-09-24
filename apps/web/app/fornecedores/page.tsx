import { redirect } from 'next/navigation';
import { getWorkspace } from '@/lib/receipts-server';
import { getSuppliers } from '@/lib/suppliers-server';
import { Stockai } from '@/components/stockai';

export const dynamic = 'force-dynamic';
export default async function Suppliers() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) redirect('/login');
  let workspace;
  try {
    workspace = await getWorkspace();
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHENTICATED') redirect('/login');
    throw error;
  }
  if (!workspace.units.some((u) => u.tax_id && u.legal_name)) redirect('/empresas');
  const suppliers = await getSuppliers();
  return (
    <Stockai
      initialPage="suppliers"
      live={{
        suppliers,
        orgs: workspace.orgs,
        initialReceipts: workspace.receipts,
        xmlInbox: workspace.xmlInbox,
        stockBalances: workspace.stockBalances,
        units: workspace.units,
        orgName: workspace.orgs.map((o) => o.name).join(' · '),
        email: workspace.email,
      }}
    />
  );
}
