import { redirect, notFound } from 'next/navigation';
import { serverClient } from '@/lib/supabase-server';
import { getCatalog } from '@/lib/catalog';
import { NoteEditor } from '@/components/note-editor';
export const dynamic = 'force-dynamic';
export default async function Note({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const c = await serverClient();
  const {
    data: { user },
  } = await c.auth.getUser();
  if (!user) redirect('/login');
  const { data: note, error } = await c
    .from('stockai_receipts')
    .select('*,supplier:stockai_suppliers(name),lines:stockai_receipt_lines(*)')
    .eq('id', id)
    .single();
  if (error || !note) notFound();
  const [units, members, catalog, history, document] = await Promise.all([
    c.from('stockai_units').select('id,name,org_id,tax_id').eq('org_id', note.org_id),
    c
      .from('stockai_memberships')
      .select('org_id,unit_id,role,revoked_at,expires_at')
      .eq('org_id', note.org_id),
    getCatalog(),
    c
      .from('stockai_receipt_revisions')
      .select('*')
      .eq('receipt_id', id)
      .order('version', { ascending: false }),
    c.from('stockai_nfe_documents').select('receipt_id').eq('receipt_id', id).maybeSingle(),
  ]);
  if (units.error || members.error || history.error)
    throw new Error('Não foi possível carregar a nota.');
  const allowed = units.data.filter(
    (u) =>
      u.tax_id &&
      members.data.some(
        (m) =>
          (!m.unit_id || m.unit_id === u.id) &&
          !m.revoked_at &&
          (!m.expires_at || Date.parse(m.expires_at) > Date.now()) &&
          ['owner', 'manager', 'unit_manager', 'implementer'].includes(m.role),
      ),
  );
  return (
    <NoteEditor
      key={`${note.id}:${note.revision}`}
      note={{ ...note, lines: note.lines.filter((l) => l.is_active) }}
      units={allowed}
      items={catalog.items.filter((i) => i.org_id === note.org_id)}
      history={history.data}
      hasXml={!!document.data}
      canEditProductCodes={members.data.some(
        (m) =>
          !m.unit_id &&
          !m.revoked_at &&
          (!m.expires_at || Date.parse(m.expires_at) > Date.now()) &&
          ['owner', 'manager', 'implementer'].includes(m.role),
      )}
    />
  );
}
