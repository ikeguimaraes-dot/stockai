import { redirect, notFound } from 'next/navigation';
import { serverClient } from '@/lib/supabase-server';
import { ReceiptConference } from '@/components/blind-count';
import { z } from 'zod';
export const dynamic = 'force-dynamic';
const schema = z.object({
  id: z.string().uuid(),
  supplier: z.string(),
  unit: z.string(),
  status: z.string(),
  lines: z.array(
    z.object({
      id: z.string().uuid(),
      name: z.string(),
      uom: z.string(),
      invoiced: z.number().positive(),
      sourceQuantity: z.string().optional(),
      sourceUnit: z.string().optional(),
    }),
  ),
});
export default async function Conference({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) notFound();
  const client = await serverClient();
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) redirect('/login');
  const { data, error } = await client.rpc('stockai_get_receipt_conference', { p_receipt: id });
  if (error) notFound();
  return <ReceiptConference receipt={schema.parse(data)} />;
}
