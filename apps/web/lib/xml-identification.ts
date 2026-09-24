import 'server-only';
import { z } from 'zod';
const sourceLinks = z.object({
  links: z
    .array(
      z.object({
        supplier_tax_id: z.string(),
        supplier_code: z.string(),
        source_unit: z.string(),
        factor: z.number().positive(),
      }),
    )
    .default([]),
});
import { parseNfe, mapNfeLines, type NfeMapping } from '@stockai/core/nfe';
import { serverClient } from './supabase-server';
import { getCatalog } from './catalog';
export type Selection = { number: string; itemId: string; factor: string };
export async function inspectXml(id: string) {
  const c = await serverClient();
  const { data: entry, error } = await c
    .from('stockai_xml_inbox')
    .select('*')
    .eq('id', id)
    .single();
  if (error || !entry) throw new Error('Arquivo não encontrado ou sem permissão.');
  let invoice;
  try {
    invoice = parseNfe(entry.raw_xml);
  } catch (error) {
    return {
      entry,
      invoice: null,
      issue: error instanceof Error ? error.message : 'Não foi possível reconhecer o XML.',
      companies: [],
      items: [],
      categories: [],
      links: [],
      suggestions: [],
      editableOrgs: [] as string[],
    };
  }
  const [units, members, catalog] = await Promise.all([
    c.from('stockai_units').select('id,name,org_id,tax_id').eq('tax_id', invoice.recipientTaxId),
    c.from('stockai_memberships').select('org_id,unit_id,role,revoked_at,expires_at'),
    getCatalog(),
  ]);
  if (units.error || members.error) throw new Error('Não foi possível consultar as empresas.');
  const valid = members.data.filter(
    (m) => !m.revoked_at && (!m.expires_at || Date.parse(m.expires_at) > Date.now()),
  );
  const companies = units.data.filter((u) =>
    valid.some(
      (m) =>
        m.org_id === u.org_id &&
        (!m.unit_id || m.unit_id === u.id) &&
        ['owner', 'manager', 'unit_manager', 'implementer'].includes(m.role),
    ),
  );
  const orgs = new Set(companies.map((u) => u.org_id));
  const linksResult = await c
    .from('stockai_product_links')
    .select('*')
    .eq('supplier_tax_id', invoice.supplierTaxId);
  if (linksResult.error) throw new Error('Não foi possível consultar os vínculos.');
  return {
    entry,
    invoice,
    issue: companies.length
      ? ''
      : 'Cadastre ou solicite acesso à empresa com o CNPJ destinatário ' +
        invoice.recipientTaxId +
        '.',
    companies,
    items: catalog.items.filter((i) => orgs.has(i.org_id)),
    categories: catalog.categories.filter((i) => orgs.has(i.org_id)),
    links: linksResult.data,
    suggestions: catalog.items
      .filter((i) => orgs.has(i.org_id) && i.is_active)
      .flatMap((i) => {
        const parsed = sourceLinks.safeParse(i.source_references);
        return parsed.success
          ? parsed.data.links
              .filter((l) => l.supplier_tax_id === invoice.supplierTaxId)
              .map((l) => ({ ...l, item_id: i.id, org_id: i.org_id }))
          : [];
      }),
    editableOrgs: valid
      .filter(
        (m) =>
          orgs.has(m.org_id) && !m.unit_id && ['owner', 'manager', 'implementer'].includes(m.role),
      )
      .map((m) => m.org_id),
  };
}
export async function processXml(
  id: string,
  chosenUnit?: string,
  selections?: Selection[],
  remember = false,
  createMissing = false,
) {
  const c = await serverClient();
  const info = await inspectXml(id);
  if (info.entry.receipt_id)
    return {
      id,
      status: info.entry.status,
      message: info.entry.message,
      createdId: info.entry.receipt_id,
    };
  const company =
    info.companies.find((u) => u.id === (chosenUnit || info.entry.unit_id)) ??
    (!chosenUnit && info.companies.length === 1 ? info.companies[0] : undefined);
  let message = info.issue;
  if (info.invoice && !company)
    message = message || 'Escolha a empresa destinatária em Identificação.';
  if (!info.invoice || !company) {
    const r = await c.rpc('stockai_xml_pending', { p_id: id, p_message: message });
    if (r.error) throw new Error(r.error.message);
    return { id, status: 'pending', message };
  }
  const invoice = info.invoice;
  const existing = await c
    .from('stockai_receipts')
    .select('id')
    .eq('unit_id', company.id)
    .eq('access_key', invoice.key)
    .maybeSingle();
  if (existing.error) throw new Error('Não foi possível verificar a nota.');
  if (existing.data) {
    const result = await c.rpc('stockai_identify_xml', {
      p_id: id,
      p_unit: company.id,
      p_invoice: JSON.parse(JSON.stringify(invoice)),
      p_lines: [],
      p_remember: false,
    });
    if (result.error) throw new Error(result.error.message);
    return {
      id,
      status: 'duplicate',
      message: 'Esta nota já foi importada.',
      createdId: result.data,
    };
  }
  if (createMissing && !selections) {
    const result = await c.rpc('stockai_auto_identify_xml', { p_id: id, p_unit: company.id });
    if (result.error) throw new Error(result.error.message);
    const summary = z
      .object({
        receipt_id: z.string().uuid(),
        created_products: z.number(),
        saved_links: z.number(),
      })
      .parse(result.data);
    return {
      id,
      status: 'imported',
      message: 'Identificada e enviada para conferência.',
      createdId: summary.receipt_id,
      createdProducts: summary.created_products,
      savedLinks: summary.saved_links,
    };
  }
  const selected =
    selections ??
    invoice.lines.map((line) => {
      const link = info.links.find(
        (l) =>
          l.org_id === company.org_id &&
          l.supplier_code === line.code &&
          l.source_unit === line.commercialUnit,
      );
      return {
        number: line.number,
        itemId: link?.item_id ?? '',
        factor: link ? String(link.factor) : line.suggestedFactor,
      };
    });
  if (selected.some((s) => !s.itemId) || selected.length !== invoice.lines.length) {
    message = 'Vincule os códigos do fornecedor aos seus produtos em Identificação.';
    const r = await c.rpc('stockai_xml_pending', {
      p_id: id,
      p_unit: company.id,
      p_message: message,
    });
    if (r.error) throw new Error(r.error.message);
    return { id, status: 'pending', message };
  }
  // Explicit conversions use the reviewed mapping, including supplier-specific units.
  const mappings: NfeMapping[] = selected.map((s) => {
    const item = info.items.find(
      (i) => i.id === s.itemId && i.org_id === company.org_id && i.is_active,
    );
    if (!item) throw new Error('Selecione um produto válido do grupo.');
    return { number: s.number, uom: item.base_uom as NfeMapping['uom'], factor: s.factor };
  });
  const mapped = mapNfeLines(
    { ...invoice, lines: invoice.lines.map((l) => ({ ...l, suggestedUom: null })) },
    mappings,
  ).map((l) => ({ ...l, item_id: selected.find((s) => s.number === l.number)!.itemId }));
  // One supplier code/unit must have one consistent mapping within the document.
  const seen = new Map<string, string>();
  for (const l of invoice.lines) {
    const s = selected.find((v) => v.number === l.number)!;
    const key = JSON.stringify([l.code, l.commercialUnit]);
    const value = JSON.stringify([s.itemId, Number(s.factor)]);
    if (seen.has(key) && seen.get(key) !== value)
      throw new Error('Use o mesmo vínculo e conversão para códigos repetidos na nota.');
    seen.set(key, value);
  }
  const result = await c.rpc('stockai_identify_xml', {
    p_id: id,
    p_unit: company.id,
    p_invoice: JSON.parse(JSON.stringify(invoice)),
    p_lines: JSON.parse(JSON.stringify(mapped)),
    p_remember: remember,
  });
  if (result.error) throw new Error(result.error.message);
  const { data: updated, error } = await c
    .from('stockai_xml_inbox')
    .select('status,message')
    .eq('id', id)
    .single();
  if (error) throw new Error('A nota foi processada. Atualize a identificação.');
  return { id, ...updated, createdId: result.data };
}
