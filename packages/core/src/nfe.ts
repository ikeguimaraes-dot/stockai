import { XMLParser, XMLValidator } from 'fast-xml-parser';

export const MAX_NFE_BYTES = 1024 * 1024;
export type NfeLine = {
  number: string;
  code: string;
  name: string;
  commercialUnit: string;
  quantity: string;
  unitPrice: string;
  grossCents: number;
  discountCents: number;
  suggestedUom: 'KG' | 'L' | 'UN' | null;
  suggestedFactor: string;
};
export type Nfe = {
  key: string;
  number: string;
  series: string;
  issuedAt: string;
  supplierName: string;
  supplierTaxId: string;
  recipientName: string;
  recipientTaxId: string;
  protocol: string;
  totalCents: number;
  productsCents: number;
  discountCents: number;
  freightCents: number;
  lines: NfeLine[];
};
export type NfeMapping = { number: string; uom: 'KG' | 'L' | 'UN'; factor: string };
type Node = Record<string, unknown>;
function object(value: unknown, label: string): Node {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error(`XML inválido: ${label}.`);
  return value as Node;
}
function text(value: unknown, label: string, max = 160): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max)
    throw new Error(`XML inválido: ${label}.`);
  return value.trim();
}
function decimal(value: unknown, label: string, places = 10): string {
  const v = text(value, label, 30);
  if (!new RegExp(`^\\d{1,12}(?:\\.\\d{1,${places}})?$`).test(v))
    throw new Error(`Valor inválido no XML: ${label}.`);
  return v;
}
function cents(value: unknown, label: string): number {
  const v = decimal(value, label, 2);
  const [whole, fraction = ''] = v.split('.');
  const result = Number(BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0')));
  if (!Number.isSafeInteger(result) || result > 99_999_999_999_999)
    throw new Error(`Valor muito alto: ${label}.`);
  return result;
}
function taxId(value: unknown, label: string): string {
  const v = text(value, label, 14).toUpperCase();
  if (!/^[A-Z0-9]{12}\d{2}$/.test(v)) throw new Error(`O XML precisa informar o CNPJ ${label}.`);
  return v;
}
const units: Record<string, ['KG' | 'L' | 'UN', string]> = {
  KG: ['KG', '1'],
  KGS: ['KG', '1'],
  G: ['KG', '0.001'],
  GR: ['KG', '0.001'],
  L: ['L', '1'],
  LT: ['L', '1'],
  LITRO: ['L', '1'],
  ML: ['L', '0.001'],
  UN: ['UN', '1'],
  UND: ['UN', '1'],
  UNID: ['UN', '1'],
  PC: ['UN', '1'],
  PÇ: ['UN', '1'],
};
export function parseNfe(xml: string): Nfe {
  if (!xml.trim() || new TextEncoder().encode(xml).length > MAX_NFE_BYTES)
    throw new Error('Envie um XML de NF-e de até 1 MB.');
  if (/<!\s*(DOCTYPE|ENTITY)/i.test(xml))
    throw new Error('O XML contém declarações não permitidas.');
  const encoding = xml.match(/<\?xml[^>]*encoding\s*=\s*['"]([^'"]+)/i)?.[1];
  if (encoding && !/^utf-?8$/i.test(encoding)) throw new Error('Envie o XML original em UTF-8.');
  let depth = 0,
    tags = 0;
  for (const [tag] of xml.matchAll(/<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<[^>]*>/g)) {
    if (tag.startsWith('<?') || tag.startsWith('<!')) continue;
    if (++tags > 40000) throw new Error('XML muito complexo.');
    if (tag.startsWith('</')) depth--;
    else if (!tag.endsWith('/>')) depth++;
    if (depth > 64) throw new Error('XML muito complexo.');
  }
  if (XMLValidator.validate(xml) !== true)
    throw new Error('O arquivo está incompleto ou não é um XML válido.');
  const root = new XMLParser({
    ignoreAttributes: false,
    removeNSPrefix: true,
    parseTagValue: false,
    parseAttributeValue: false,
    trimValues: true,
    processEntities: true,
  }).parse(xml) as Node;
  // Only processed, authorized NF-e. Event/cancellation XMLs cannot create inventory.
  const proc = object(root.nfeProc, 'envie o XML completo da NF-e com protocolo (nfeProc)');
  const nfe = object(proc.NFe, 'NF-e');
  const info = object(nfe.infNFe, 'infNFe');
  if (info['@_versao'] !== '4.00') throw new Error('Importe uma NF-e no leiaute 4.00.');
  const ide = object(info.ide, 'identificação');
  if (ide.mod !== '55') throw new Error('Este recebimento aceita XML de NF-e modelo 55.');
  if (ide.tpAmb !== '1') throw new Error('Notas de homologação não podem entrar no estoque real.');
  if (ide.tpNF !== '1' || ide.finNFe !== '1')
    throw new Error(
      'Envie uma NF-e de saída normal do fornecedor. Devoluções, ajustes e complementos precisam de outro fluxo.',
    );
  const key = text(info['@_Id'], 'chave de acesso', 47).replace(/^NFe/, '').toUpperCase();
  if (!/^[A-Z0-9]{44}$/.test(key)) throw new Error('Chave de acesso inválida.');
  const auth = object(object(proc.protNFe, 'protocolo').infProt, 'protocolo de autorização');
  if (!['100', '150'].includes(String(auth.cStat)) || auth.chNFe !== key || auth.tpAmb !== '1')
    throw new Error('O XML não contém um protocolo de autorização compatível com a nota.');
  const emit = object(info.emit, 'emitente'),
    dest = object(info.dest, 'destinatária');
  const totals = object(object(info.total, 'totais').ICMSTot, 'totais da NF-e');
  const number = text(ide.nNF, 'número', 9),
    series = text(ide.serie, 'série', 3);
  if (!/^\d+$/.test(number) || !/^\d+$/.test(series)) throw new Error('Número ou série inválidos.');
  const supplierTaxId = taxId(emit.CNPJ, 'do fornecedor');
  if (
    key.slice(6, 20) !== supplierTaxId ||
    key.slice(20, 22) !== '55' ||
    Number(key.slice(22, 25)) !== Number(series) ||
    Number(key.slice(25, 34)) !== Number(number)
  )
    throw new Error('A chave de acesso não corresponde aos dados da NF-e.');
  const issuedAt = text(ide.dhEmi, 'data de emissão', 35);
  if (!/^\d{4}-\d{2}-\d{2}T/.test(issuedAt) || Number.isNaN(Date.parse(issuedAt)))
    throw new Error('Data de emissão inválida.');
  const details = Array.isArray(info.det) ? info.det : [info.det];
  if (!details.length || details.length > 990)
    throw new Error('A NF-e deve conter entre 1 e 990 itens.');
  const seen = new Set<string>();
  const lines: NfeLine[] = details.map((d) => {
    const detail = object(d, 'item'),
      product = object(detail.prod, 'produto');
    const itemNumber = text(detail['@_nItem'], 'número do item', 3);
    if (!/^[1-9]\d{0,2}$/.test(itemNumber) || Number(itemNumber) > 990 || seen.has(itemNumber))
      throw new Error('O XML contém numeração de itens inválida ou repetida.');
    seen.add(itemNumber);
    if (product.indTot !== '1')
      throw new Error(
        `O item ${itemNumber} não compõe o total da nota. Revise esse documento antes de importar.`,
      );
    const quantity = decimal(product.qCom, 'quantidade', 4),
      unitPrice = decimal(product.vUnCom, 'preço unitário');
    if (Number(quantity) <= 0 || Number(quantity) >= 1e9)
      throw new Error('Quantidade fora do limite de recebimento.');
    const grossCents = cents(product.vProd, 'total do produto'),
      discountCents = cents(product.vDesc ?? '0', 'desconto');
    if (discountCents > grossCents) throw new Error('Desconto maior que o valor do produto.');
    if (Math.abs(Math.round(Number(quantity) * Number(unitPrice) * 100) - grossCents) > 1)
      throw new Error(`Quantidade e preço não correspondem ao total do item ${itemNumber}.`);
    const commercialUnit = text(product.uCom, 'unidade comercial', 12).toUpperCase();
    const suggested = units[commercialUnit];
    return {
      number: itemNumber,
      code: text(product.cProd, 'código do produto', 60),
      name: text(product.xProd, 'nome do produto', 120),
      commercialUnit,
      quantity,
      unitPrice,
      grossCents,
      discountCents,
      suggestedUom: suggested?.[0] ?? null,
      suggestedFactor: suggested?.[1] ?? '',
    };
  });
  const productsCents = cents(totals.vProd, 'total de produtos'),
    discountCents = cents(totals.vDesc ?? '0', 'desconto total');
  if (
    lines.reduce((sum, l) => sum + l.grossCents, 0) !== productsCents ||
    lines.reduce((sum, l) => sum + l.discountCents, 0) !== discountCents
  )
    throw new Error('Os totais dos itens não correspondem aos totais do XML.');
  return {
    key,
    number,
    series,
    issuedAt,
    supplierName: text(emit.xNome, 'nome do fornecedor', 120),
    supplierTaxId,
    recipientName: text(dest.xNome, 'nome da destinatária', 160),
    recipientTaxId: taxId(dest.CNPJ, 'da destinatária'),
    protocol: text(auth.nProt, 'protocolo', 20),
    totalCents: cents(totals.vNF, 'total da nota'),
    productsCents,
    discountCents,
    freightCents: cents(totals.vFrete ?? '0', 'frete'),
    lines,
  };
}

export function mapNfeLines(invoice: Nfe, mappings: NfeMapping[]) {
  if (
    mappings.length !== invoice.lines.length ||
    new Set(mappings.map((m) => m.number)).size !== mappings.length
  )
    throw new Error('Revise a unidade de estoque de todos os itens.');
  return invoice.lines.map((line) => {
    const mapping = mappings.find((m) => m.number === line.number);
    if (!mapping || !['KG', 'L', 'UN'].includes(mapping.uom))
      throw new Error(`Escolha a unidade de estoque de ${line.name}.`);
    if (
      line.suggestedUom &&
      (mapping.uom !== line.suggestedUom || Number(mapping.factor) !== Number(line.suggestedFactor))
    )
      throw new Error(`Preserve a unidade original de ${line.name}.`);
    const factor = Number(decimal(mapping.factor, 'quantidade por embalagem', 6));
    const quantity = Number(line.quantity) * factor;
    if (
      factor <= 0 ||
      quantity <= 0 ||
      quantity >= 1e9 ||
      Math.abs(quantity - Math.round(quantity * 1e4) / 1e4) > 1e-9
    )
      throw new Error(
        `Conversão inválida para ${line.name}. Use quantidades com até quatro casas decimais.`,
      );
    const fiscalCents = line.grossCents - line.discountCents;
    const priceCents = fiscalCents / quantity;
    if (priceCents >= 1e11) throw new Error(`Preço convertido muito alto para ${line.name}.`);
    return {
      number: line.number,
      name: line.name,
      uom: mapping.uom,
      quantity: Math.round(quantity * 1e4) / 1e4,
      price_cents: Math.round(priceCents * 1e8) / 1e8,
      fiscal_cents: fiscalCents,
      source: { ...line, factor: mapping.factor },
    };
  });
}
