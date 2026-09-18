import { describe, it, expect } from 'vitest';
import { approveReceipt, convertUnit, receiptTotals, submitCount, type Receipt } from './index';
const receipt: Receipt = {
  id: '1',
  supplier: 'Fornecedor',
  category: 'Hortifruti',
  invoice: '12',
  unit: 'Jardins',
  date: '2026-09-18',
  time: '09:00',
  status: 'counting',
  lines: [{ id: 'a', name: 'Tomate', uom: 'KG', invoiced: 20, counted: null, priceCents: 1250 }],
};
describe('Conferência e três verdades', () => {
  it('preserva fiscal e gera crédito somente sobre a falta', () => {
    const result = submitCount(receipt, { a: 18 });
    expect(result.status).toBe('pending_approval');
    expect(receiptTotals(result)).toEqual({
      fiscal: 25000,
      payable: 22500,
      credit: 2500,
      divergences: 1,
    });
    expect(result.lines[0].counted).toBe(18);
    expect(receipt.lines[0].counted).toBeNull();
    expect(approveReceipt(result).status).toBe('closed');
  });
  it('não cobra automaticamente excedente nem gera crédito negativo', () => {
    expect(receiptTotals(submitCount(receipt, { a: 24 }))).toEqual({
      fiscal: 25000,
      payable: 25000,
      credit: 0,
      divergences: 1,
    });
  });
  it('fecha conforme e impede reconferência e dupla aprovação', () => {
    const result = submitCount(receipt, { a: 20 });
    expect(result.status).toBe('closed');
    expect(() => submitCount(result, { a: 20 })).toThrow();
    expect(() => approveReceipt(result)).toThrow();
  });
  it('valida contagem completa e aceita ausência de entrega', () => {
    const invalid: Record<string, number>[] = [{}, { a: -1 }, { a: NaN }, { a: Infinity }];
    for (const counts of invalid) expect(() => submitCount(receipt, counts)).toThrow();
    expect(receiptTotals(submitCount(receipt, { a: 0 })).credit).toBe(25000);
    expect(receiptTotals(receipt).payable).toBeNull();
  });
});
describe('Conversões determinísticas', () => {
  it('converte dentro de uma dimensão e embalagens cadastradas', () => {
    expect(convertUnit(300, 'G', 'KG')).toBe(0.3);
    expect(convertUnit(1.5, 'L', 'ML')).toBe(1500);
    expect(convertUnit(2, 'CX', 'KG', 20)).toBe(40);
  });
  it('não inventa densidade ou embalagem', () => {
    expect(() => convertUnit(2, 'L', 'KG')).toThrow();
    expect(() => convertUnit(2, 'CX', 'KG')).toThrow();
    expect(() => convertUnit(2, 'CX', 'KG', -1)).toThrow();
    expect(() => convertUnit(NaN, 'KG', 'KG')).toThrow();
  });
});
