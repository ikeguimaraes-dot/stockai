'use server';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { serverClient } from '@/lib/supabase-server';
const schema = z.object({
  id: z.string().uuid(),
  revision: z.number().int().min(0),
  request: z.string().uuid(),
  reason: z.string().trim().min(3).max(1000),
  header: z.object({
    unit_id: z.string().uuid(),
    supplier: z.string().trim().min(1).max(120),
    invoice_number: z.string().trim().min(1).max(44),
    invoice_series: z.string().max(3),
    issued_at: z.string(),
    invoice_total_cents: z.number().int().nonnegative(),
    notes: z.string().max(2000),
  }),
  lines: z
    .array(
      z.object({
        item_id: z.string().uuid(),
        quantity: z.number().positive(),
        price_cents: z.number().nonnegative(),
        counted: z.number().nonnegative().nullable(),
      }),
    )
    .min(1)
    .max(990),
});
export async function editNote(input: unknown) {
  const parsed = schema.safeParse(input);
  if (!parsed.success)
    return { error: 'Revise os campos da nota e informe o motivo da alteração.' };
  const d = parsed.data;
  if (new Set(d.lines.map((l) => l.item_id)).size !== d.lines.length)
    return { error: 'Agrupe as quantidades dos produtos repetidos em uma única linha.' };
  const c = await serverClient();
  const { error } = await c.rpc('stockai_edit_receipt', {
    p_receipt: d.id,
    p_expected: d.revision,
    p_request: d.request,
    p_header: d.header,
    p_lines: d.lines,
    p_reason: d.reason,
  });
  if (error)
    return {
      error: ['22023', '42501', '40001'].includes(error.code)
        ? error.message
        : 'Não foi possível salvar a alteração. Confira os campos e tente novamente.',
    };
  for (const path of [
    '/operacao',
    '/pedidos',
    '/entregas',
    `/notas/${d.id}`,
    `/conferencia/${d.id}`,
  ])
    revalidatePath(path);
  return { error: null };
}
