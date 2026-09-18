import { redirect } from 'next/navigation';
import { getWorkspace } from '@/lib/receipts-server';
import { getCatalog } from '@/lib/catalog';
import { ProductDirectory } from '@/components/products';
export const dynamic = 'force-dynamic';
export default async function Products() {
  let workspace;
  try {
    workspace = await getWorkspace();
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHENTICATED') redirect('/login');
    throw error;
  }
  if (!workspace.units.some((u) => u.tax_id)) redirect('/empresas');
  const catalog = await getCatalog();
  const editableOrgs = workspace.memberships
    .filter((m) => !m.unit_id && ['owner', 'manager', 'implementer'].includes(m.role))
    .map((m) => m.org_id);
  return <ProductDirectory {...catalog} orgs={workspace.orgs} editableOrgs={editableOrgs} />;
}
