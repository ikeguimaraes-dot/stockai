'use server';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { serverClient } from '@/lib/supabase-server';
const id = z.union([z.string().uuid(), z.literal('')]);
export async function updateProductCode(itemId: string, code: string, expected: string) {
  const parsed = z
    .object({
      itemId: z.string().uuid(),
      code: z.string().trim().min(1).max(60),
      expected: z.string().max(60),
    })
    .safeParse({ itemId, code, expected });
  if (!parsed.success) return { error: 'Informe um código de até 60 caracteres.' };
  const c = await serverClient();
  const result = await c.rpc('stockai_update_internal_code', {
    p_item: itemId,
    p_code: parsed.data.code,
    p_expected: expected,
  });
  if (result.error)
    return {
      error:
        result.error.code === '23505'
          ? 'Este código já pertence a outro produto do grupo.'
          : ['42501', '40001', '22023'].includes(result.error.code)
            ? result.error.message
            : 'Não foi possível alterar o código.',
    };
  revalidatePath('/produtos');
  revalidatePath('/operacao');
  revalidatePath('/notas/[id]', 'page');
  return { error: null };
}
export async function saveCatalog(form: FormData): Promise<{ error: string | null; id?: string }> {
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
        code: z.string().trim().min(1).max(60),
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
        : await client.rpc('stockai_save_product_code', {
            p_org: data.orgId,
            p_name: data.name,
            p_code: data.code,
            p_uom: data.uom,
            p_category: data.categoryId || undefined,
            p_cmv: data.cmv === 'true',
            p_id: data.id || undefined,
          });
    if (result.error)
      return {
        error:
          result.error.code === '23505'
            ? 'Já existe um cadastro com esse nome ou código neste grupo.'
            : result.error.code === '42501'
              ? 'Seu acesso não permite alterar este cadastro.'
              : result.error.code === '22023'
                ? result.error.message
                : 'Não foi possível salvar. Tente novamente.',
      };
    revalidatePath('/produtos');
    revalidatePath('/operacao');
    return { error: null, id: result.data };
  } catch {
    return { error: 'Não foi possível salvar. Tente novamente.' };
  }
}
