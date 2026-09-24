import { redirect } from 'next/navigation';
import { serverClient } from '@/lib/supabase-server';
import { Identification } from '@/components/identification';
export const dynamic = 'force-dynamic';
export default async function Page() {
  const c = await serverClient();
  const {
    data: { user },
  } = await c.auth.getUser();
  if (!user) redirect('/login');
  const rows = [];
  for (let start = 0; ; start += 500) {
    const r = await c
      .from('stockai_xml_inbox')
      .select('id,filename,status,message,created_at,receipt_id')
      .order('created_at', { ascending: false })
      .order('id')
      .range(start, start + 499);
    if (r.error) throw new Error('Não foi possível carregar a identificação.');
    rows.push(...r.data);
    if (r.data.length < 500) break;
  }
  return <Identification entries={rows} />;
}
