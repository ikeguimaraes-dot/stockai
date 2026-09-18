export type ReceiptStatus = 'counting' | 'pending_approval' | 'closed';
export type ReceiptLine = {
  id: string;
  name: string;
  uom: 'KG' | 'L' | 'UN';
  invoiced: number;
  counted: number | null;
  priceCents: number;
};
export type Receipt = {
  id: string;
  supplier: string;
  category: string;
  invoice: string;
  unit: string;
  date: string;
  time: string;
  status: ReceiptStatus;
  lines: ReceiptLine[];
};
export const lineTotals = (line: ReceiptLine) => {
  if (
    !Number.isFinite(line.invoiced) ||
    line.invoiced <= 0 ||
    !Number.isSafeInteger(line.priceCents) ||
    line.priceCents < 0 ||
    (line.counted !== null && (!Number.isFinite(line.counted) || line.counted < 0))
  )
    throw new Error('Quantidade ou preço inválido.');
  const fiscal = Math.round(line.invoiced * line.priceCents);
  const physical = line.counted;
  const payable =
    physical === null ? null : Math.round(Math.min(physical, line.invoiced) * line.priceCents);
  return {
    fiscal,
    physical,
    payable,
    credit: payable === null ? 0 : fiscal - payable,
    divergent: physical !== null && physical !== line.invoiced,
  };
};
export function receiptTotals(receipt: Receipt) {
  const lines = receipt.lines.map(lineTotals);
  return {
    fiscal: lines.reduce((n, l) => n + l.fiscal, 0),
    payable: lines.some((l) => l.payable === null)
      ? null
      : lines.reduce((n, l) => n + (l.payable ?? 0), 0),
    credit: lines.reduce((n, l) => n + l.credit, 0),
    divergences: lines.filter((l) => l.divergent).length,
  };
}
export function submitCount(receipt: Receipt, counts: Record<string, number>): Receipt {
  if (receipt.status !== 'counting') throw new Error('Este recebimento já foi conferido.');
  if (!receipt.lines.length) throw new Error('Inclua ao menos um item.');
  const lines = receipt.lines.map((line) => {
    const counted = counts[line.id];
    if (!Number.isFinite(counted) || counted < 0)
      throw new Error('Informe uma contagem válida para todos os itens.');
    return { ...line, counted };
  });
  const next = { ...receipt, lines };
  return { ...next, status: receiptTotals(next).divergences > 0 ? 'pending_approval' : 'closed' };
}
export function approveReceipt(receipt: Receipt): Receipt {
  if (receipt.status !== 'pending_approval' || receipt.lines.some((l) => l.counted === null))
    throw new Error('Recebimento não está pronto para aprovação.');
  receiptTotals(receipt);
  return { ...receipt, status: 'closed' };
}
export function convertUnit(
  quantity: number,
  from: string,
  to: string,
  packagingFactor?: number,
): number {
  if (!Number.isFinite(quantity) || quantity < 0) throw new Error('Quantidade inválida.');
  const units: Record<string, [string, number]> = {
    KG: ['mass', 1],
    G: ['mass', 0.001],
    L: ['volume', 1],
    ML: ['volume', 0.001],
    UN: ['count', 1],
  };
  if (['CX', 'FD', 'DZ'].includes(from)) {
    if (
      !units[to] ||
      packagingFactor === undefined ||
      !Number.isFinite(packagingFactor) ||
      packagingFactor <= 0
    )
      throw new Error('Embalagem sem conversão cadastrada.');
    return Math.round(quantity * packagingFactor * 10000) / 10000;
  }
  if (!units[from] || !units[to] || units[from][0] !== units[to][0])
    throw new Error('Unidades incompatíveis.');
  return Math.round(((quantity * units[from][1]) / units[to][1]) * 10000) / 10000;
}
