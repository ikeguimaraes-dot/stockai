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
  const result = await c.rpc('stockai_assign_product_code', {
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
  revalidatePath('/produtos', 'layout');
  revalidatePath('/operacao');
  revalidatePath('/identificacao');
  revalidatePath('/notas/[id]', 'page');
  const data = result.data as {
    linked: boolean;
    item_id: string;
    code: string;
    name: string;
    links?: number;
  };
  return { error: null, assignment: data };
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

export async function saveProductName(itemId: string, name: string, expected: string) {
  if (!z.string().uuid().safeParse(itemId).success || !name.trim() || name.trim().length > 120)
    return { error: 'Informe um nome de até 120 caracteres.' };
  const c = await serverClient();
  const { error } = await c.rpc('stockai_rename_product', {
    p_item: itemId,
    p_name: name.trim(),
    p_expected: expected,
  });
  if (error)
    return {
      error:
        error.code === '23505'
          ? 'Já existe um produto com este nome e unidade no grupo.'
          : ['42501', '40001', '22023'].includes(error.code)
            ? error.message
            : 'Não foi possível salvar o nome.',
    };
  revalidatePath('/produtos', 'layout');
  revalidatePath('/operacao');
  revalidatePath('/notas/[id]', 'page');
  return { error: null };
}
export async function relinkProduct(
  linkId: string,
  target: string,
  factor: number,
  expected: string,
) {
  if (
    !z
      .object({
        linkId: z.string().uuid(),
        target: z.string().uuid(),
        factor: z.number().positive().finite(),
        expected: z.string().datetime({ offset: true }),
      })
      .safeParse({ linkId, target, factor, expected }).success
  )
    return { error: 'Confira o produto e a conversão.' };
  const c = await serverClient();
  const { error } = await c.rpc('stockai_relink_product', {
    p_link: linkId,
    p_target: target,
    p_factor: factor,
    p_expected: expected,
  });
  if (error)
    return {
      error: ['42501', '40001', '22023'].includes(error.code)
        ? error.message
        : 'Não foi possível salvar o vínculo.',
    };
  revalidatePath('/produtos', 'layout');
  revalidatePath('/identificacao');
  return { error: null };
}

export async function getProductSupplierLinks(itemId: string) {
  if (!z.string().uuid().safeParse(itemId).success) throw new Error('Produto inválido.');
  const c = await serverClient();
  const { data: item, error } = await c
    .from('stockai_items')
    .select('org_id')
    .eq('id', itemId)
    .single();
  if (error || !item) throw new Error('Produto indisponível.');
  const links = [];
  for (let start = 0; ; start += 500) {
    const { data, error } = await c
      .from('stockai_product_links')
      .select('*')
      .eq('org_id', item.org_id)
      .eq('item_id', itemId)
      .order('id')
      .range(start, start + 499);
    if (error) throw new Error('Não foi possível carregar os vínculos.');
    links.push(...data);
    if (data.length < 500) break;
  }
  const suppliers = new Map<string, string>();
  const taxes = [...new Set(links.map((l) => l.supplier_tax_id))];
  for (let start = 0; start < taxes.length; start += 100) {
    const { data, error } = await c
      .from('stockai_suppliers')
      .select('tax_id,name')
      .eq('org_id', item.org_id)
      .in('tax_id', taxes.slice(start, start + 100));
    if (error) throw new Error('Não foi possível carregar os fornecedores.');
    for (const s of data) if (s.tax_id) suppliers.set(s.tax_id, s.name);
  }
  return links.map((l) => ({
    ...l,
    supplierName: suppliers.get(l.supplier_tax_id) || l.supplier_tax_id,
  }));
}
