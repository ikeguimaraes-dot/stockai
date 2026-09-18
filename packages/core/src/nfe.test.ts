import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { parseNfe, mapNfeLines } from './nfe';
import { lineTotals } from './index';
const xml = readFileSync(new URL('../../../tests/fixtures/nfe.xml', import.meta.url), 'utf8');
const mappings = [
  { number: '1', uom: 'KG' as const, factor: '1' },
  { number: '2', uom: 'UN' as const, factor: '6' },
];
describe('NF-e import', () => {
  it('preserves source values and maps packaging explicitly', () => {
    const invoice = parseNfe(xml);
    expect(invoice.recipientTaxId).toBe('12345678000195');
    expect(invoice.totalCents).toBe(19000);
    expect(invoice.lines[0].unitPrice).toBe('12.3456');
    expect(invoice.lines[1].suggestedUom).toBeNull();
    const lines = mapNfeLines(invoice, mappings);
    expect(lines.map((l) => [l.quantity, l.fiscal_cents, l.price_cents])).toEqual([
      [10, 12000, 1200],
      [12, 6000, 500],
    ]);
  });
  it('accepts namespace prefixes and escaped names', () => {
    const prefixed = xml
      .replace(/<(\/?)([A-Za-z][\w]*)(?=[\s>])/g, '<$1n:$2')
      .replace('xmlns=', 'xmlns:n=');
    expect(parseNfe(prefixed).number).toBe('123');
    expect(parseNfe(xml.replace('Arroz', 'Arroz &amp; Feijão')).lines[0].name).toBe(
      'Arroz & Feijão',
    );
  });
  it.each([
    xml.replace('<nfeProc ', '<nfeProc BROKEN '),
    '<!DOCTYPE nfeProc [<!ENTITY x "boom">]>' + xml,
    xml.replace('<cStat>100', '<cStat>101'),
    xml.replaceAll('<tpAmb>1', '<tpAmb>2'),
    xml.replace('<finNFe>1', '<finNFe>4'),
    xml.replace('<nNF>123', '<nNF>124'),
    xml.replace('nItem="2"', 'nItem="1"'),
    xml.replace('nItem="2"', 'nItem="0"'),
    xml.replace('<vProd>183.46', '<vProd>180.00'),
    xml.replace('<qCom>10.0000', '<qCom>11.0000'),
    xml.replace('<indTot>1', '<indTot>0'),
    'x'.repeat(1024 * 1024 + 1),
  ])('rejects invalid or unsupported documents', (input) =>
    expect(() => parseNfe(input)).toThrow(),
  );
  it('requires valid conversions and preserves known dimensions', () => {
    const nfe = parseNfe(xml);
    expect(() => mapNfeLines(nfe, [])).toThrow();
    expect(() => mapNfeLines(nfe, [mappings[0], { ...mappings[1], factor: '' }])).toThrow();
    expect(() => mapNfeLines(nfe, [{ ...mappings[0], uom: 'L' }, mappings[1]])).toThrow();
    expect(() => mapNfeLines(nfe, [mappings[0], { ...mappings[1], factor: '0.000001' }])).toThrow();
  });
  it('keeps exact discounted totals despite fractional unit cents', () => {
    const line = {
      id: 'x',
      name: 'X',
      uom: 'UN' as const,
      invoiced: 3,
      counted: 3,
      priceCents: 33.33333333,
      fiscalTotalCents: 100,
    };
    expect(lineTotals(line)).toMatchObject({ fiscal: 100, payable: 100, credit: 0 });
    expect(lineTotals({ ...line, counted: 2 })).toMatchObject({
      fiscal: 100,
      payable: 67,
      credit: 33,
    });
    expect(lineTotals({ ...line, counted: 0 }).credit).toBe(100);
    expect(lineTotals({ ...line, counted: 4 }).credit).toBe(0);
  });
});
