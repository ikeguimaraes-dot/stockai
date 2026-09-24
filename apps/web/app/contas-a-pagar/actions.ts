'use server';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { serverClient } from '@/lib/supabase-server';
const optionalDate = z.union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.literal('')]);
const schema = z.object({
  id: z.string().uuid().nullable(),
  revision: z.number().int(),
  request: z.string().uuid(),
  data: z.object({
    unit_id: z.string().uuid(),
    supplier_id: z.union([z.string().uuid(), z.literal('')]),
    creditor_name: z.string().max(200),
    description: z.string().trim().min(1).max(200),
    issued_on: optionalDate,
    document_number: z.string().max(60).optional(),
    reference_month: z
      .union([z.string().regex(/^20\d{2}-(0[1-9]|1[0-2])$/), z.literal('')])
      .optional(),
    notes: z.string().max(4000),
    cancelled: z.boolean(),
    installments: z
      .array(
        z.object({
          amount_cents: z.number().int().min(0).max(99999999999999),
          due_on: optionalDate,
          paid_on: optionalDate,
          paid_without_date: z.boolean().optional(),
        }),
      )
      .min(1)
      .max(120),
  }),
});
export async function savePayable(input: unknown) {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { error: 'Confira os campos e valores das parcelas.' };
  try {
    const c = await serverClient();
    const v = parsed.data;
    const { error } = await c.rpc('stockai_save_payable', {
      p_id: v.id ?? undefined,
      p_revision: v.revision,
      p_request: v.request,
      p_data: v.data,
    });
    if (error)
      return {
        error: ['22023', '40001'].includes(error.code)
          ? error.message
          : error.code === '42501'
            ? 'Seu acesso não permite alterar esta conta.'
            : 'Não foi possível salvar. Confira os dados e tente novamente.',
      };
    revalidatePath('/contas-a-pagar');
    revalidatePath('/fornecedores');
    revalidatePath('/operacao');
    return { error: null };
  } catch {
    return { error: 'Não foi possível salvar. Confira sua conexão.' };
  }
}

export async function linkPayable(
  bill: string,
  target: string,
  revision: number,
  targetRevision: number,
) {
  if (
    !z
      .object({
        bill: z.string().uuid(),
        target: z.string().uuid(),
        revision: z.number().int(),
        targetRevision: z.number().int(),
      })
      .safeParse({ bill, target, revision, targetRevision }).success
  )
    return { error: 'Confira as contas selecionadas.' };
  const c = await serverClient();
  const { error } = await c.rpc('stockai_link_payable', {
    p_bill: bill,
    p_target: target,
    p_revision: revision,
    p_target_revision: targetRevision,
  });
  if (error)
    return {
      error: ['22023', '40001', '42501'].includes(error.code)
        ? error.message
        : 'Não foi possível vincular a conta.',
    };
  revalidatePath('/contas-a-pagar', 'layout');
  return { error: null };
}

export async function resolvePayableImport(row: string, input: unknown, existing?: string) {
  if (!z.string().uuid().safeParse(row).success) return { error: 'Identificação inválida.' };
  const parsed = existing
    ? z.object({ data: z.object({ unit_id: z.string().uuid() }) }).safeParse(input)
    : schema.safeParse(input);
  if (!parsed.success || (existing && !z.string().uuid().safeParse(existing).success))
    return { error: 'Confira a empresa, o favorecido e os valores.' };
  const c = await serverClient();
  const { error } = await c.rpc('stockai_resolve_payable_import', {
    p_row: row,
    p_data: parsed.data.data,
    p_existing: existing,
  });
  if (error)
    return {
      error: ['22023', '40001', '42501'].includes(error.code)
        ? error.message
        : 'Não foi possível identificar esta despesa.',
    };
  revalidatePath('/contas-a-pagar', 'layout');
  revalidatePath('/fornecedores');
  return { error: null };
}
