import { NextResponse } from 'next/server';
import { z } from 'zod';
import { serverClient } from '@/lib/supabase-server';
import { inspectXml, processXml } from '@/lib/xml-identification';
import { getWorkspace } from '@/lib/receipts-server';
const selection = z.object({
  number: z.string().regex(/^\d{1,3}$/),
  itemId: z.string().uuid(),
  factor: z.string().max(30),
});
export async function GET(request: Request) {
  try {
    const id = z.string().uuid().parse(new URL(request.url).searchParams.get('id'));
    const info = await inspectXml(id);
    if (new URL(request.url).searchParams.has('download'))
      return new Response(info.entry.raw_xml, {
        headers: {
          'Content-Type': 'application/xml; charset=utf-8',
          'Content-Disposition': 'attachment; filename="original.xml"',
          'X-Content-Type-Options': 'nosniff',
          'Cache-Control': 'no-store',
        },
      });
    return NextResponse.json(
      { ...info, entry: { ...info.entry, raw_xml: undefined } },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch {
    return NextResponse.json(
      { error: 'Arquivo não encontrado ou sem permissão.' },
      { status: 404 },
    );
  }
}
export async function POST(request: Request) {
  const origin =
    process.env.APP_ORIGIN ?? `${new URL(request.url).protocol}//${request.headers.get('host')}`;
  if (request.headers.get('origin') !== origin)
    return NextResponse.json({ error: 'Origem não permitida.' }, { status: 403 });
  const c = await serverClient();
  const {
    data: { user },
  } = await c.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Entre novamente para enviar.' }, { status: 401 });
  try {
    const reader = request.body?.getReader();
    if (!reader) throw new Error('Arquivo ausente.');
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const part = await reader.read();
        if (part.done) break;
        size += part.value.byteLength;
        if (size > 2 * 1024 * 1024) {
          await reader.cancel();
          throw new Error('Envie um XML de até 1 MB.');
        }
        chunks.push(part.value);
      }
    } finally {
      reader.releaseLock();
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    const input = z
      .discriminatedUnion('action', [
        z.object({
          action: z.literal('queue'),
          filename: z.string().min(1).max(255),
          xml: z.string(),
          requestId: z.string().uuid(),
        }),
        z.object({
          action: z.literal('identify'),
          id: z.string().uuid(),
          unitId: z.string().uuid().optional(),
          selections: z.array(selection).max(990).optional(),
          remember: z.boolean().optional(),
          createMissing: z.boolean().optional(),
        }),
      ])
      .parse(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)));
    let id: string;
    if (input.action === 'queue') {
      const r = await c.rpc('stockai_queue_xml', {
        p_filename: input.filename,
        p_xml: input.xml,
        p_request: input.requestId,
      });
      if (r.error) throw new Error(r.error.message);
      id = r.data;
    } else id = input.id;
    let result;
    try {
      result = await processXml(
        id,
        input.action === 'identify' ? input.unitId : undefined,
        input.action === 'identify' ? input.selections : undefined,
        input.action === 'identify' && input.remember === true,
        input.action === 'identify' && input.createMissing === true,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Revise o arquivo em Identificação.';
      await c.rpc('stockai_xml_pending', { p_id: id, p_message: message });
      return NextResponse.json(
        { id, status: 'pending', message },
        { headers: { 'Cache-Control': 'no-store' } },
      );
    }
    const workspace = result.createdId ? await getWorkspace() : null;
    return NextResponse.json(
      { ...result, receipts: workspace?.receipts },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Não foi possível salvar o arquivo.' },
      { status: 400 },
    );
  }
}
