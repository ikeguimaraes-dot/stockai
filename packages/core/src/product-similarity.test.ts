import { describe, expect, it } from 'vitest';
import { similarProducts } from './product-similarity';
describe('product name review', () => {
  it('suggests accents, spelling and package variations without crossing groups', () => {
    const result = similarProducts([
      { id: 'a', org_id: '1', name: 'AÇÚCAR MASCAVO UNIÃO 1KG' },
      { id: 'b', org_id: '1', name: 'ACUCAR MASCAVO UNIAO 1KG [FD12 de compra]' },
      { id: 'c', org_id: '2', name: 'ACUCAR MASCAVO UNIAO 1KG' },
      { id: 'd', org_id: '1', name: 'DETERGENTE NEUTRO 5L' },
    ]);
    expect(result.get('a')).toEqual(['b']);
    expect(result.has('c')).toBe(false);
    expect(result.has('d')).toBe(false);
  });
});
