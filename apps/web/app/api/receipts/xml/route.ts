import { NextResponse } from 'next/server';
import { z } from 'zod';
import { parseNfe, mapNfeLines, MAX_NFE_BYTES } from '@stockai/core/nfe';
import { serverClient } from '@/lib/supabase-server';
import { getWorkspace } from '@/lib/receipts-server';
const schema = z.object({
  action: z.enum(['preview', 'import']),
  xml: z.string().min(1),
  unitId: z.string().uuid().optional(),
  requestId: z.string().uuid().optional(),
  mappings: z
    .array(
      z.object({
        number: z.string().regex(/^\d{1,3}$/),
        uom: z.enum(['KG', 'L', 'UN']),
        factor: z.string().max(30),
      }),
    )
    .max(990)
    .optional(),
});
function failure(error: string, status = 400) {
  return NextResponse.json({ error }, { status, headers: { 'Cache-Control': 'no-store' } });
}
async function body(request: Request) {
  const limit = MAX_NFE_BYTES * 2;
  if (Number(request.headers.get('content-length')) > limit)
    throw new Error('Envie um XML de até 1 MB.');
  const reader = request.body?.getReader();
  if (!reader) throw new Error('Selecione o arquivo XML.');
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > limit) {
        await reader.cancel();
        throw new Error('Envie um XML de até 1 MB.');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  try {
    return schema.parse(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)));
  } catch {
    throw new Error('Solicitação inválida. Revise o arquivo e as unidades dos itens.');
  }
}
export async function POST(request: Request) {
  const allowedOrigin =
    process.env.APP_ORIGIN ?? `${new URL(request.url).protocol}//${request.headers.get('host')}`;
  if (request.headers.get('origin') !== allowedOrigin) return failure('Origem não permitida.', 403);
  try {
    const client = await serverClient();
    const {
      data: { user },
    } = await client.auth.getUser();
    if (!user) return failure('Entre novamente para importar a nota.', 401);
    const data = await body(request);
    const invoice = parseNfe(data.xml);
    const { data: companies, error: companyError } = await client
      .from('stockai_units')
      .select('id,name,org_id,tax_id')
      .eq('tax_id', invoice.recipientTaxId);
    const { data: memberships, error: membershipError } = await client
      .from('stockai_memberships')
      .select('org_id,unit_id,role');
    if (companyError || membershipError)
      return failure('Não foi possível consultar suas empresas. Tente novamente.', 503);
    const permitted = (companies ?? []).filter((c) =>
      (memberships ?? []).some(
        (m) =>
          m.org_id === c.org_id &&
          (!m.unit_id || m.unit_id === c.id) &&
          ['owner', 'manager', 'unit_manager', 'implementer'].includes(m.role),
      ),
    );
    if (!permitted.length)
      return failure(
        `O CNPJ destinatário ${invoice.recipientTaxId} não corresponde a uma empresa cadastrada com permissão de recebimento. Cadastre a empresa ou peça acesso ao gestor.`,
        422,
      );
    const { data: existing, error: duplicateError } = await client
      .from('stockai_receipts')
      .select('id,unit_id')
      .eq('access_key', invoice.key)
      .in(
        'unit_id',
        permitted.map((c) => c.id),
      );
    if (duplicateError)
      return failure('Não foi possível verificar se a nota já foi importada.', 503);
    if (data.action === 'preview')
      return NextResponse.json(
        {
          invoice,
          companies: permitted.map((c) => ({
            id: c.id,
            name: c.name,
            taxId: c.tax_id,
            alreadyImported: (existing ?? []).some((r) => r.unit_id === c.id),
          })),
        },
        { headers: { 'Cache-Control': 'no-store' } },
      );
    const company = permitted.find((c) => c.id === data.unitId);
    if (!company || !data.requestId || !data.mappings)
      return failure('Selecione a empresa destinatária e revise todos os itens.');
    const lines = mapNfeLines(invoice, data.mappings);
    const { data: createdId, error } = await client.rpc('stockai_import_nfe', {
      p_unit: company.id,
      p_request: data.requestId,
      p_xml: data.xml,
      p_invoice: JSON.parse(JSON.stringify(invoice)),
      p_lines: JSON.parse(JSON.stringify(lines)),
    });
    if (error)
      return failure(
        error.code === '23505'
          ? 'Esta nota já está cadastrada para a empresa. Confira os recebimentos.'
          : error.code === '42501'
            ? 'Seu acesso não permite importar para esta empresa.'
            : error.code === '22023'
              ? error.message
              : 'Não foi possível importar a nota. Nenhum recebimento parcial foi gravado. Tente novamente.',
      );
    const workspace = await getWorkspace();
    return NextResponse.json(
      { receipts: workspace.receipts, createdId },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return failure(error instanceof Error ? error.message : 'Não foi possível ler o XML.');
  }
}
