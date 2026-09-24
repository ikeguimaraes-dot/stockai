'use server';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { serverClient } from '@/lib/supabase-server';
export async function saveSupplier(form: FormData) {
  const parsed = z
    .object({
      orgId: z.string().uuid(),
      id: z.union([z.string().uuid(), z.literal('')]),
      revision: z.coerce.number().int().min(1),
      name: z.string().trim().min(1).max(120),
      tax_id: z.string().max(30),
      legal_name: z.string().max(200),
      contact_name: z.string().max(200),
      email: z.union([z.string().trim().email(), z.literal('')]),
      phone: z.string().max(200),
      address: z.string().max(500),
      notes: z.string().max(4000),
    })
    .safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: 'Confira os campos do cadastro.', id: null };
  const { orgId, id, revision, ...data } = parsed.data;
  try {
    const c = await serverClient();
    const result = await c.rpc('stockai_save_supplier', {
      p_org: orgId,
      p_data: data,
      p_id: id || undefined,
      p_revision: revision,
    });
    if (result.error)
      return {
        error:
          result.error.code === '23505'
            ? 'Já existe um fornecedor com esse nome ou CNPJ neste grupo. Abra o cadastro existente.'
            : ['22023', '40001'].includes(result.error.code)
              ? result.error.message
              : result.error.code === '42501'
                ? 'Seu acesso não permite alterar este fornecedor.'
                : 'Não foi possível salvar o fornecedor.',
        id: null,
      };
    revalidatePath('/operacao');
    revalidatePath('/fornecedores');
    revalidatePath(`/fornecedores/${result.data}`);
    return { error: null, id: result.data };
  } catch {
    return { error: 'Não foi possível salvar. Confira sua conexão e tente novamente.', id: null };
  }
}
