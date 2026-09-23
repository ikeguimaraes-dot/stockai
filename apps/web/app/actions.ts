'use server';
import { serverClient } from '@/lib/supabase-server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
export async function signIn(form: FormData): Promise<{ error: string }> {
  const input = z
    .object({ email: z.string().trim().email(), password: z.string().min(1) })
    .safeParse(Object.fromEntries(form));
  if (!input.success) return { error: 'Informe seu e-mail e sua senha já cadastrados.' };
  try {
    const client = await serverClient();
    const { error } = await client.auth.signInWithPassword(input.data);
    if (error) return { error: 'Não foi possível entrar. Confira seu e-mail e senha.' };
  } catch {
    return { error: 'Banco não configurado ou indisponível.' };
  }
  redirect('/operacao');
}
export async function signOut() {
  const client = await serverClient();
  await client.auth.signOut();
  redirect('/login');
}
export async function setup(form: FormData): Promise<{ error: string | null }> {
  const input = z
    .object({
      name: z.string().trim().min(2).max(80),
      legalName: z.string().trim().min(2).max(160),
      taxId: z
        .string()
        .transform((v) => v.replace(/[.\/\s-]/g, '').toUpperCase())
        .pipe(z.string().regex(/^[A-Z0-9]{12}[0-9]{2}$/)),
      orgId: z.union([z.string().uuid(), z.literal(''), z.literal('new')]),
      unitId: z.union([z.string().uuid(), z.literal('')]),
    })
    .safeParse(Object.fromEntries(form));
  if (!input.success) return { error: 'Confira o nome, a razão social e o CNPJ com 14 posições.' };
  const isNewGroup = input.data.orgId === 'new';
  const client = await serverClient();
  const { error } = await client.rpc('stockai_register_company', {
    p_name: input.data.name,
    p_legal_name: input.data.legalName,
    p_tax_id: input.data.taxId,
    p_org: isNewGroup ? undefined : input.data.orgId || undefined,
    p_unit: input.data.unitId || undefined,
    p_new_org: isNewGroup || undefined,
  });
  if (error)
    return {
      error:
        error.code === '23505'
          ? 'Já existe uma empresa com esse nome ou CNPJ no grupo.'
          : error.code === '42501'
            ? 'Seu acesso não permite cadastrar esta empresa. Peça ao gestor do grupo.'
            : error.code === '22023'
              ? error.message
              : 'Não foi possível salvar a empresa. Tente novamente.',
    };
  revalidatePath('/operacao');
  revalidatePath('/empresas');
  return { error: null };
}
