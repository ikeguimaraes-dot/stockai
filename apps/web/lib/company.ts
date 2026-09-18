export type Company = {
  id: string;
  org_id: string;
  name: string;
  legal_name: string | null;
  tax_id: string | null;
};
export function formatCnpj(value: string) {
  return value.replace(/^(.{2})(.{3})(.{3})(.{4})(.{2})$/, '$1.$2.$3/$4-$5');
}
