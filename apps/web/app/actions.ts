'use server';
import { serverClient } from '@/lib/supabase-server';
import { redirect } from 'next/navigation';
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
export async function setup(form: FormData): Promise<{ error: string }> {
  const input = z
    .object({ org: z.string().trim().min(1).max(120), unit: z.string().trim().min(1).max(80) })
    .safeParse(Object.fromEntries(form));
  if (!input.success) return { error: 'Preencha o nome da organização e da unidade.' };
  const client = await serverClient();
  const { error } = await client.rpc('stockai_bootstrap_organization', {
    p_org_name: input.data.org,
    p_unit_name: input.data.unit,
  });
  if (error)
    return {
      error: 'Não foi possível criar a organização. Verifique seu acesso e tente novamente.',
    };
  redirect('/operacao');
}
