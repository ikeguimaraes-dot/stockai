import { redirect } from 'next/navigation';
import { getWorkspace } from '@/lib/receipts-server';
import { Setup } from '@/components/access';
export const dynamic = 'force-dynamic';
export default async function Companies() {
  let workspace;
  try {
    workspace = await getWorkspace();
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHENTICATED') redirect('/login');
    throw error;
  }
  const managers = workspace.memberships.filter((m) =>
    ['owner', 'manager', 'unit_manager', 'implementer'].includes(m.role),
  );
  const companies = workspace.units.filter((u) =>
    managers.some((m) => m.org_id === u.org_id && (!m.unit_id || m.unit_id === u.id)),
  );
  const orgs = workspace.orgs.filter((o) =>
    managers.some((m) => m.org_id === o.id && !m.unit_id && m.role !== 'unit_manager'),
  );
  return <Setup companies={companies} orgs={orgs} hasAccess={workspace.memberships.length > 0} />;
}
