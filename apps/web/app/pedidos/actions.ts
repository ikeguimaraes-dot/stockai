'use server';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { serverClient } from '@/lib/supabase-server';
const id = z.string().uuid();
const quantity = z.number().finite().min(0).max(9999999999);
const schema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('create'),
    source: id,
    destination: id,
    kitchen: z.string().trim().min(2).max(100),
    notes: z.string().max(1000),
    needed: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    request: id,
    lines: z
      .array(z.object({ item_id: id, quantity: quantity.positive() }))
      .min(1)
      .max(100),
  }),
  z.object({
    kind: z.literal('dispatch'),
    order: id,
    lines: z.array(z.object({ id, quantity })).min(1).max(100),
  }),
  z.object({
    kind: z.literal('receive'),
    order: id,
    name: z.string().trim().min(3).max(120),
    notes: z.string().max(1000),
    confirmed: z.literal(true),
    signature: z
      .array(
        z
          .array(z.tuple([z.number().min(0).max(1), z.number().min(0).max(1)]))
          .min(1)
          .max(12000),
      )
      .min(1)
      .max(100),
  }),
  z.object({ kind: z.literal('cancel'), order: id }),
]);
export async function saveOrder(input: unknown): Promise<{ error: string | null }> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { error: 'Confira os campos, as quantidades e a assinatura.' };
  const d = parsed.data;
  try {
    const c = await serverClient();
    const r =
      d.kind === 'create'
        ? await c.rpc('stockai_create_order', {
            p_source: d.source,
            p_destination: d.destination,
            p_kitchen: d.kitchen,
            p_notes: d.notes,
            p_needed: d.needed,
            p_request: d.request,
            p_lines: d.lines,
          })
        : d.kind === 'dispatch'
          ? await c.rpc('stockai_dispatch_order', { p_order: d.order, p_lines: d.lines })
          : d.kind === 'receive'
            ? await c.rpc('stockai_receive_order', {
                p_order: d.order,
                p_name: d.name,
                p_signature: d.signature,
                p_notes: d.notes,
              })
            : await c.rpc('stockai_cancel_order', { p_order: d.order });
    if (r.error)
      return {
        error: ['22023', '42501'].includes(r.error.code)
          ? r.error.message
          : r.error.code === '23505'
            ? 'Não repita o mesmo produto no pedido.'
            : 'Não foi possível salvar. Atualize a página e tente novamente.',
      };
    for (const path of ['/pedidos', '/entregas', '/operacao']) revalidatePath(path);
    return { error: null };
  } catch {
    return { error: 'Não foi possível salvar. Confira sua conexão e tente novamente.' };
  }
}
