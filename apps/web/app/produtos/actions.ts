'use server';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { serverClient } from '@/lib/supabase-server';
const id = z.union([z.string().uuid(), z.literal('')]);
export async function saveCatalog(form: FormData): Promise<{ error: string | null }> {
  const common = z.object({
    kind: z.enum(['category', 'product']),
    orgId: z.string().uuid(),
    id,
    name: z.string().trim().min(2).max(80),
  });
  const input = z
    .discriminatedUnion('kind', [
      common.extend({ kind: z.literal('category') }),
      common.extend({
        kind: z.literal('product'),
        name: z.string().trim().min(1).max(120),
        uom: z.enum(['KG', 'L', 'UN']),
        categoryId: id,
        cmv: z.enum(['true', 'false']),
      }),
    ])
    .safeParse(Object.fromEntries(form));
  if (!input.success) return { error: 'Preencha os campos e escolha Sim ou Não para CMV.' };
  const data = input.data;
  try {
    const client = await serverClient();
    const result =
      data.kind === 'category'
        ? await client.rpc('stockai_save_category', {
            p_org: data.orgId,
            p_name: data.name,
            p_id: data.id || undefined,
          })
        : await client.rpc('stockai_save_product', {
            p_org: data.orgId,
            p_name: data.name,
            p_uom: data.uom,
            p_category: data.categoryId || undefined,
            p_cmv: data.cmv === 'true',
            p_id: data.id || undefined,
          });
    if (result.error)
      return {
        error:
          result.error.code === '23505'
            ? 'Já existe um cadastro com esse nome neste grupo.'
            : result.error.code === '42501'
              ? 'Seu acesso não permite alterar este cadastro.'
              : result.error.code === '22023'
                ? result.error.message
                : 'Não foi possível salvar. Tente novamente.',
      };
    revalidatePath('/produtos');
    revalidatePath('/operacao');
    return { error: null };
  } catch {
    return { error: 'Não foi possível salvar. Tente novamente.' };
  }
}
