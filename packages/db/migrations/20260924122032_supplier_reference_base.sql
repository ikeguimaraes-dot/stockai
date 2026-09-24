-- Import provenance and names used by the restaurant, without inventing tax IDs.
alter table public.stockai_suppliers
 add column aliases text[] not null default '{}',
 add column reference_labels text[] not null default '{}',
 add column source_name text,
 add column review_note text,
 add column source_references jsonb not null default '{}'::jsonb;
comment on column public.stockai_suppliers.source_references is 'Source workbook checksum and sheet/row references; not accounting transactions.';
alter table public.stockai_items add column source_references jsonb not null default '{}'::jsonb;
comment on column public.stockai_items.source_references is 'Original XML codes used to suggest, never silently confirm, product mappings.';
