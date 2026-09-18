import { NextResponse } from 'next/server';
import { z } from 'zod';
import { serverClient } from '@/lib/supabase-server';
import { getWorkspace } from '@/lib/receipts-server';
const schema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('create'),
    requestId: z.string().uuid(),
    unit: z.string().uuid(),
    supplier: z.string().trim().min(1).max(120),
    invoice: z.string().trim().min(1).max(44),
    lines: z
      .array(
        z.object({
          name: z.string().trim().min(1).max(120),
          uom: z.enum(['KG', 'L', 'UN']),
          quantity: z.number().positive().max(999999999),
          price_cents: z.number().int().nonnegative().max(99999999999),
        }),
      )
      .min(1)
      .max(100),
  }),
  z.object({
    action: z.literal('count'),
    id: z.string().uuid(),
    counts: z.record(z.string().uuid(), z.number().finite().nonnegative().max(999999999)),
  }),
  z.object({ action: z.literal('approve'), id: z.string().uuid() }),
]);
export async function POST(request: Request) {
  const allowedOrigin =
    process.env.APP_ORIGIN ?? `${new URL(request.url).protocol}//${request.headers.get('host')}`;
  if (request.headers.get('origin') !== allowedOrigin)
    return NextResponse.json({ error: 'Origem não permitida.' }, { status: 403 });
  if (Number(request.headers.get('content-length') ?? 0) > 65536)
    return NextResponse.json({ error: 'Solicitação muito grande.' }, { status: 413 });
  try {
    const body = await request.text();
    if (body.length > 65536)
      return NextResponse.json({ error: 'Solicitação muito grande.' }, { status: 413 });
    const parsed = schema.safeParse(JSON.parse(body));
    if (!parsed.success)
      return NextResponse.json({ error: 'Dados inválidos. Confira os campos.' }, { status: 400 });
    const client = await serverClient();
    const {
      data: { user },
    } = await client.auth.getUser();
    if (!user)
      return NextResponse.json({ error: 'Entre novamente para continuar.' }, { status: 401 });
    const data = parsed.data;
    const result =
      data.action === 'create'
        ? await client.rpc('stockai_create_receipt', {
            p_unit: data.unit,
            p_supplier: data.supplier,
            p_invoice: data.invoice,
            p_lines: data.lines,
            p_request: data.requestId,
          })
        : data.action === 'count'
          ? await client.rpc('stockai_submit_receipt_count', {
              p_receipt: data.id,
              p_counts: data.counts,
            })
          : await client.rpc('stockai_approve_receipt', { p_receipt: data.id });
    if (result.error)
      return NextResponse.json(
        {
          error:
            result.error.code === '23505'
              ? 'Essa nota ou um dos itens já foi cadastrado.'
              : result.error.code === '42501'
                ? 'Você não tem permissão para essa operação.'
                : 'Não foi possível salvar. Atualize a página e confira os dados.',
        },
        { status: 400 },
      );
    return NextResponse.json(
      { ...(await getWorkspace()), createdId: data.action === 'create' ? result.data : null },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch {
    return NextResponse.json(
      { error: 'Não foi possível processar a solicitação.' },
      { status: 400 },
    );
  }
}
