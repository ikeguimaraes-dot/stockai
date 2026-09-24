import { notFound, redirect } from 'next/navigation';
import { serverClient } from '@/lib/supabase-server';
import { getWorkspace } from '@/lib/receipts-server';
import { SupplierProfile } from '@/components/supplier-profile';
export const dynamic = 'force-dynamic';
export default async function SupplierPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (id !== 'novo' && !/^[0-9a-f-]{36}$/i.test(id)) notFound();
  let workspace;
  try {
    workspace = await getWorkspace();
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHENTICATED') redirect('/login');
    throw error;
  }
  const c = await serverClient();
  const {
    data: { user },
  } = await c.auth.getUser();
  if (!user) redirect('/login');
  const { data: members, error } = await c
    .from('stockai_memberships')
    .select('org_id,role,unit_id,revoked_at,expires_at')
    .eq('user_id', user.id);
  if (error) throw new Error('Não foi possível verificar seu acesso.');
  const editableOrgs = (members ?? [])
    .filter(
      (m) =>
        !m.unit_id &&
        !m.revoked_at &&
        (!m.expires_at || Date.parse(m.expires_at) > Date.now()) &&
        ['owner', 'manager', 'implementer'].includes(m.role),
    )
    .map((m) => m.org_id);
  const result =
    id === 'novo' ? null : await c.from('stockai_suppliers').select('*').eq('id', id).maybeSingle();
  if (result?.error) throw new Error('Não foi possível carregar o fornecedor.');
  if (id !== 'novo' && !result?.data) notFound();
  return (
    <SupplierProfile
      key={id}
      supplier={result?.data ?? null}
      orgs={workspace.orgs}
      editableOrgs={editableOrgs}
    />
  );
}
