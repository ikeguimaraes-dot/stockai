import { serverClient } from '@/lib/supabase-server';
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const c = await serverClient();
  const { data, error } = await c
    .from('stockai_nfe_documents')
    .select('raw_xml')
    .eq('receipt_id', id)
    .single();
  if (error || !data) return new Response('Documento indisponível.', { status: 404 });
  return new Response(data.raw_xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Content-Disposition': 'attachment; filename="nota-original.xml"',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
