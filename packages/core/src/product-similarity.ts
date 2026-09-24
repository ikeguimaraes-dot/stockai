type Product = { id: string; org_id: string; name: string };
const normalize = (name: string) =>
  name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\[[^\]]*\]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
function pairs(s: string) {
  const result = new Set<string>();
  for (let i = 0; i < s.length - 1; i++) result.add(s.slice(i, i + 2));
  return result;
}
/** Suggestions only: do not infer interchangeable products or packaging conversions. */
export function similarProducts(items: Product[]): Map<string, string[]> {
  const result = new Map<string, string[]>();
  const prepared = items.map((item) => ({
    ...item,
    normalized: normalize(item.name),
    pairs: pairs(normalize(item.name)),
  }));
  for (let i = 0; i < prepared.length; i++)
    for (let j = i + 1; j < prepared.length; j++) {
      const a = prepared[i],
        b = prepared[j];
      if (a.org_id !== b.org_id || a.normalized.length < 3 || b.normalized.length < 3) continue;
      let overlap = 0;
      for (const pair of a.pairs) if (b.pairs.has(pair)) overlap++;
      const score = (2 * overlap) / (a.pairs.size + b.pairs.size);
      if (a.normalized === b.normalized || score >= 0.78) {
        result.set(a.id, [...(result.get(a.id) ?? []), b.id]);
        result.set(b.id, [...(result.get(b.id) ?? []), a.id]);
      }
    }
  return result;
}
