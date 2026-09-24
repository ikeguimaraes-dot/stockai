import { redirect } from 'next/navigation';
import { serverClient } from '@/lib/supabase-server';
import { getSuppliers } from '@/lib/suppliers-server';
import { Payables } from '@/components/payables';
export const dynamic = 'force-dynamic';
export default async function PayablesPage() {
  const c = await serverClient();
  const {
    data: { user },
  } = await c.auth.getUser();
  if (!user) redirect('/login');
  const [units, members, suppliers] = await Promise.all([
    c.from('stockai_units').select('id,org_id,name'),
    c
      .from('stockai_memberships')
      .select('org_id,unit_id,role,revoked_at,expires_at')
      .eq('user_id', user.id),
    getSuppliers(),
  ]);
  if (units.error || members.error) throw new Error('Não foi possível carregar as empresas.');
  const allowed = units.data.filter((u) =>
    members.data.some(
      (m) =>
        m.org_id === u.org_id &&
        (!m.unit_id || m.unit_id === u.id) &&
        !m.revoked_at &&
        (!m.expires_at || Date.parse(m.expires_at) > Date.now()) &&
        ['owner', 'manager', 'unit_manager', 'implementer'].includes(m.role),
    ),
  );
  const bills = [];
  for (let start = 0; ; start += 300) {
    const res = await c
      .from('stockai_payables')
      .select('*,installments:stockai_payable_installments(*)')
      .order('created_at', { ascending: false })
      .order('id')
      .range(start, start + 299);
    if (res.error) throw new Error('Não foi possível carregar as contas.');
    bills.push(...res.data);
    if (res.data.length < 300) break;
  }
  return (
    <Payables
      bills={bills}
      units={allowed}
      suppliers={suppliers}
      today={new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())}
    />
  );
}
