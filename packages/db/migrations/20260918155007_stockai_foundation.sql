-- Stockai only: additive objects for a shared Supabase project.
create schema if not exists "stockai_private";


  create table "public"."stockai_audit_events" (
    "id" uuid not null default gen_random_uuid(),
    "org_id" uuid not null,
    "unit_id" uuid not null,
    "actor_id" uuid not null,
    "receipt_id" uuid not null,
    "kind" text not null,
    "payload" jsonb not null default '{}'::jsonb,
    "created_at" timestamp with time zone not null default now()
      );


alter table "public"."stockai_audit_events" enable row level security;


  create table "public"."stockai_items" (
    "id" uuid not null default gen_random_uuid(),
    "org_id" uuid not null,
    "name" text not null,
    "base_uom" text not null,
    "is_active" boolean not null default true,
    "created_at" timestamp with time zone not null default now()
      );


alter table "public"."stockai_items" enable row level security;


  create table "public"."stockai_memberships" (
    "id" uuid not null default gen_random_uuid(),
    "org_id" uuid not null,
    "unit_id" uuid,
    "user_id" uuid not null,
    "role" text not null,
    "expires_at" timestamp with time zone,
    "revoked_at" timestamp with time zone,
    "created_at" timestamp with time zone not null default now()
      );


alter table "public"."stockai_memberships" enable row level security;


  create table "public"."stockai_orgs" (
    "id" uuid not null default gen_random_uuid(),
    "name" text not null,
    "created_at" timestamp with time zone not null default now()
      );


alter table "public"."stockai_orgs" enable row level security;


  create table "public"."stockai_receipt_lines" (
    "id" uuid not null default gen_random_uuid(),
    "org_id" uuid not null,
    "unit_id" uuid not null,
    "receipt_id" uuid not null,
    "item_id" uuid not null,
    "invoiced_qty" numeric(14,4) not null,
    "counted_qty" numeric(14,4),
    "unit_price_cents" bigint not null,
    "payable_cents" bigint,
    "credit_cents" bigint
      );


alter table "public"."stockai_receipt_lines" enable row level security;


  create table "public"."stockai_receipts" (
    "id" uuid not null default gen_random_uuid(),
    "org_id" uuid not null,
    "unit_id" uuid not null,
    "supplier_id" uuid not null,
    "invoice_number" text not null,
    "status" text not null default 'counting'::text,
    "request_id" uuid not null,
    "created_by" uuid not null,
    "counted_by" uuid,
    "approved_by" uuid,
    "created_at" timestamp with time zone not null default now(),
    "closed_at" timestamp with time zone
      );


alter table "public"."stockai_receipts" enable row level security;


  create table "public"."stockai_stock_movements" (
    "id" uuid not null default gen_random_uuid(),
    "org_id" uuid not null,
    "unit_id" uuid not null,
    "item_id" uuid not null,
    "receipt_line_id" uuid not null,
    "kind" text not null default 'entry'::text,
    "qty_base" numeric(14,4) not null,
    "unit_cost_cents" bigint not null,
    "reverses_id" uuid,
    "created_by" uuid not null,
    "created_at" timestamp with time zone not null default now()
      );


alter table "public"."stockai_stock_movements" enable row level security;


  create table "public"."stockai_supplier_claims" (
    "id" uuid not null default gen_random_uuid(),
    "org_id" uuid not null,
    "unit_id" uuid not null,
    "supplier_id" uuid not null,
    "receipt_line_id" uuid not null,
    "amount_cents" bigint not null,
    "qty_base" numeric(14,4) not null,
    "status" text not null default 'open'::text,
    "created_at" timestamp with time zone not null default now()
      );


alter table "public"."stockai_supplier_claims" enable row level security;


  create table "public"."stockai_suppliers" (
    "id" uuid not null default gen_random_uuid(),
    "org_id" uuid not null,
    "name" text not null,
    "created_at" timestamp with time zone not null default now()
      );


alter table "public"."stockai_suppliers" enable row level security;


  create table "public"."stockai_units" (
    "id" uuid not null default gen_random_uuid(),
    "org_id" uuid not null,
    "name" text not null,
    "is_central" boolean not null default false,
    "created_at" timestamp with time zone not null default now()
      );


alter table "public"."stockai_units" enable row level security;

CREATE UNIQUE INDEX stockai_audit_events_pkey ON public.stockai_audit_events USING btree (id);

CREATE INDEX stockai_audit_events_receipt ON public.stockai_audit_events USING btree (receipt_id, created_at);

CREATE UNIQUE INDEX stockai_items_org_id_id_key ON public.stockai_items USING btree (org_id, id);

CREATE UNIQUE INDEX stockai_items_org_id_name_base_uom_key ON public.stockai_items USING btree (org_id, name, base_uom);

CREATE UNIQUE INDEX stockai_items_pkey ON public.stockai_items USING btree (id);

CREATE UNIQUE INDEX stockai_memberships_pkey ON public.stockai_memberships USING btree (id);

CREATE INDEX stockai_memberships_user_access ON public.stockai_memberships USING btree (user_id, org_id, unit_id) WHERE (revoked_at IS NULL);

CREATE UNIQUE INDEX stockai_memberships_user_id_org_id_unit_id_role_key ON public.stockai_memberships USING btree (user_id, org_id, unit_id, role) NULLS NOT DISTINCT;

CREATE UNIQUE INDEX stockai_orgs_pkey ON public.stockai_orgs USING btree (id);

CREATE INDEX stockai_receipt_lines_item ON public.stockai_receipt_lines USING btree (org_id, item_id);

CREATE UNIQUE INDEX stockai_receipt_lines_org_id_id_key ON public.stockai_receipt_lines USING btree (org_id, id);

CREATE UNIQUE INDEX stockai_receipt_lines_pkey ON public.stockai_receipt_lines USING btree (id);

CREATE INDEX stockai_receipt_lines_receipt ON public.stockai_receipt_lines USING btree (receipt_id);

CREATE UNIQUE INDEX stockai_receipt_lines_receipt_id_item_id_key ON public.stockai_receipt_lines USING btree (receipt_id, item_id);

CREATE UNIQUE INDEX stockai_receipts_org_id_id_key ON public.stockai_receipts USING btree (org_id, id);

CREATE UNIQUE INDEX stockai_receipts_org_id_request_id_key ON public.stockai_receipts USING btree (org_id, request_id);

CREATE UNIQUE INDEX stockai_receipts_org_id_unit_id_id_key ON public.stockai_receipts USING btree (org_id, unit_id, id);

CREATE UNIQUE INDEX stockai_receipts_pkey ON public.stockai_receipts USING btree (id);

CREATE INDEX stockai_receipts_supplier ON public.stockai_receipts USING btree (org_id, supplier_id);

CREATE UNIQUE INDEX stockai_receipts_unit_id_supplier_id_invoice_number_key ON public.stockai_receipts USING btree (unit_id, supplier_id, invoice_number);

CREATE INDEX stockai_receipts_unit_status_date ON public.stockai_receipts USING btree (unit_id, status, created_at DESC);

CREATE UNIQUE INDEX stockai_stock_movements_pkey ON public.stockai_stock_movements USING btree (id);

CREATE UNIQUE INDEX stockai_stock_movements_receipt_line_id_kind_key ON public.stockai_stock_movements USING btree (receipt_line_id, kind);

CREATE UNIQUE INDEX stockai_stock_movements_reverses_id_key ON public.stockai_stock_movements USING btree (reverses_id);

CREATE INDEX stockai_stock_movements_unit_item ON public.stockai_stock_movements USING btree (unit_id, item_id, created_at DESC);

CREATE UNIQUE INDEX stockai_supplier_claims_pkey ON public.stockai_supplier_claims USING btree (id);

CREATE UNIQUE INDEX stockai_supplier_claims_receipt_line_id_key ON public.stockai_supplier_claims USING btree (receipt_line_id);

CREATE INDEX stockai_supplier_claims_unit_status ON public.stockai_supplier_claims USING btree (unit_id, status);

CREATE UNIQUE INDEX stockai_suppliers_org_id_id_key ON public.stockai_suppliers USING btree (org_id, id);

CREATE UNIQUE INDEX stockai_suppliers_org_id_name_key ON public.stockai_suppliers USING btree (org_id, name);

CREATE UNIQUE INDEX stockai_suppliers_pkey ON public.stockai_suppliers USING btree (id);

CREATE UNIQUE INDEX stockai_units_org_id_id_key ON public.stockai_units USING btree (org_id, id);

CREATE UNIQUE INDEX stockai_units_org_id_name_key ON public.stockai_units USING btree (org_id, name);

CREATE UNIQUE INDEX stockai_units_pkey ON public.stockai_units USING btree (id);

alter table "public"."stockai_audit_events" add constraint "stockai_audit_events_pkey" PRIMARY KEY using index "stockai_audit_events_pkey";

alter table "public"."stockai_items" add constraint "stockai_items_pkey" PRIMARY KEY using index "stockai_items_pkey";

alter table "public"."stockai_memberships" add constraint "stockai_memberships_pkey" PRIMARY KEY using index "stockai_memberships_pkey";

alter table "public"."stockai_orgs" add constraint "stockai_orgs_pkey" PRIMARY KEY using index "stockai_orgs_pkey";

alter table "public"."stockai_receipt_lines" add constraint "stockai_receipt_lines_pkey" PRIMARY KEY using index "stockai_receipt_lines_pkey";

alter table "public"."stockai_receipts" add constraint "stockai_receipts_pkey" PRIMARY KEY using index "stockai_receipts_pkey";

alter table "public"."stockai_stock_movements" add constraint "stockai_stock_movements_pkey" PRIMARY KEY using index "stockai_stock_movements_pkey";

alter table "public"."stockai_supplier_claims" add constraint "stockai_supplier_claims_pkey" PRIMARY KEY using index "stockai_supplier_claims_pkey";

alter table "public"."stockai_suppliers" add constraint "stockai_suppliers_pkey" PRIMARY KEY using index "stockai_suppliers_pkey";

alter table "public"."stockai_units" add constraint "stockai_units_pkey" PRIMARY KEY using index "stockai_units_pkey";

alter table "public"."stockai_audit_events" add constraint "stockai_audit_events_actor_id_fkey" FOREIGN KEY (actor_id) REFERENCES auth.users(id) not valid;

alter table "public"."stockai_audit_events" validate constraint "stockai_audit_events_actor_id_fkey";

alter table "public"."stockai_audit_events" add constraint "stockai_audit_events_org_id_unit_id_receipt_id_fkey" FOREIGN KEY (org_id, unit_id, receipt_id) REFERENCES public.stockai_receipts(org_id, unit_id, id) not valid;

alter table "public"."stockai_audit_events" validate constraint "stockai_audit_events_org_id_unit_id_receipt_id_fkey";

alter table "public"."stockai_items" add constraint "stockai_items_base_uom_check" CHECK ((base_uom = ANY (ARRAY['KG'::text, 'L'::text, 'UN'::text]))) not valid;

alter table "public"."stockai_items" validate constraint "stockai_items_base_uom_check";

alter table "public"."stockai_items" add constraint "stockai_items_name_check" CHECK (((length(TRIM(BOTH FROM name)) >= 1) AND (length(TRIM(BOTH FROM name)) <= 120))) not valid;

alter table "public"."stockai_items" validate constraint "stockai_items_name_check";

alter table "public"."stockai_items" add constraint "stockai_items_org_id_fkey" FOREIGN KEY (org_id) REFERENCES public.stockai_orgs(id) not valid;

alter table "public"."stockai_items" validate constraint "stockai_items_org_id_fkey";

alter table "public"."stockai_items" add constraint "stockai_items_org_id_id_key" UNIQUE using index "stockai_items_org_id_id_key";

alter table "public"."stockai_items" add constraint "stockai_items_org_id_name_base_uom_key" UNIQUE using index "stockai_items_org_id_name_base_uom_key";

alter table "public"."stockai_memberships" add constraint "stockai_memberships_check" CHECK (((role <> ALL (ARRAY['unit_manager'::text, 'operator'::text])) OR (unit_id IS NOT NULL))) not valid;

alter table "public"."stockai_memberships" validate constraint "stockai_memberships_check";

alter table "public"."stockai_memberships" add constraint "stockai_memberships_check1" CHECK (((role <> 'implementer'::text) OR (expires_at IS NOT NULL))) not valid;

alter table "public"."stockai_memberships" validate constraint "stockai_memberships_check1";

alter table "public"."stockai_memberships" add constraint "stockai_memberships_org_id_fkey" FOREIGN KEY (org_id) REFERENCES public.stockai_orgs(id) not valid;

alter table "public"."stockai_memberships" validate constraint "stockai_memberships_org_id_fkey";

alter table "public"."stockai_memberships" add constraint "stockai_memberships_org_id_unit_id_fkey" FOREIGN KEY (org_id, unit_id) REFERENCES public.stockai_units(org_id, id) not valid;

alter table "public"."stockai_memberships" validate constraint "stockai_memberships_org_id_unit_id_fkey";

alter table "public"."stockai_memberships" add constraint "stockai_memberships_role_check" CHECK ((role = ANY (ARRAY['owner'::text, 'manager'::text, 'unit_manager'::text, 'operator'::text, 'viewer'::text, 'implementer'::text]))) not valid;

alter table "public"."stockai_memberships" validate constraint "stockai_memberships_role_check";

alter table "public"."stockai_memberships" add constraint "stockai_memberships_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) not valid;

alter table "public"."stockai_memberships" validate constraint "stockai_memberships_user_id_fkey";

alter table "public"."stockai_memberships" add constraint "stockai_memberships_user_id_org_id_unit_id_role_key" UNIQUE using index "stockai_memberships_user_id_org_id_unit_id_role_key";

alter table "public"."stockai_orgs" add constraint "stockai_orgs_name_check" CHECK (((length(TRIM(BOTH FROM name)) >= 1) AND (length(TRIM(BOTH FROM name)) <= 120))) not valid;

alter table "public"."stockai_orgs" validate constraint "stockai_orgs_name_check";

alter table "public"."stockai_receipt_lines" add constraint "stockai_receipt_lines_counted_qty_check" CHECK (((counted_qty >= (0)::numeric) AND (counted_qty < (1000000000)::numeric))) not valid;

alter table "public"."stockai_receipt_lines" validate constraint "stockai_receipt_lines_counted_qty_check";

alter table "public"."stockai_receipt_lines" add constraint "stockai_receipt_lines_invoiced_qty_check" CHECK (((invoiced_qty > (0)::numeric) AND (invoiced_qty < (1000000000)::numeric))) not valid;

alter table "public"."stockai_receipt_lines" validate constraint "stockai_receipt_lines_invoiced_qty_check";

alter table "public"."stockai_receipt_lines" add constraint "stockai_receipt_lines_org_id_id_key" UNIQUE using index "stockai_receipt_lines_org_id_id_key";

alter table "public"."stockai_receipt_lines" add constraint "stockai_receipt_lines_org_id_item_id_fkey" FOREIGN KEY (org_id, item_id) REFERENCES public.stockai_items(org_id, id) not valid;

alter table "public"."stockai_receipt_lines" validate constraint "stockai_receipt_lines_org_id_item_id_fkey";

alter table "public"."stockai_receipt_lines" add constraint "stockai_receipt_lines_org_id_unit_id_receipt_id_fkey" FOREIGN KEY (org_id, unit_id, receipt_id) REFERENCES public.stockai_receipts(org_id, unit_id, id) not valid;

alter table "public"."stockai_receipt_lines" validate constraint "stockai_receipt_lines_org_id_unit_id_receipt_id_fkey";

alter table "public"."stockai_receipt_lines" add constraint "stockai_receipt_lines_receipt_id_item_id_key" UNIQUE using index "stockai_receipt_lines_receipt_id_item_id_key";

alter table "public"."stockai_receipt_lines" add constraint "stockai_receipt_lines_unit_price_cents_check" CHECK (((unit_price_cents >= 0) AND (unit_price_cents < '100000000000'::bigint))) not valid;

alter table "public"."stockai_receipt_lines" validate constraint "stockai_receipt_lines_unit_price_cents_check";

alter table "public"."stockai_receipts" add constraint "stockai_receipts_approved_by_fkey" FOREIGN KEY (approved_by) REFERENCES auth.users(id) not valid;

alter table "public"."stockai_receipts" validate constraint "stockai_receipts_approved_by_fkey";

alter table "public"."stockai_receipts" add constraint "stockai_receipts_counted_by_fkey" FOREIGN KEY (counted_by) REFERENCES auth.users(id) not valid;

alter table "public"."stockai_receipts" validate constraint "stockai_receipts_counted_by_fkey";

alter table "public"."stockai_receipts" add constraint "stockai_receipts_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) not valid;

alter table "public"."stockai_receipts" validate constraint "stockai_receipts_created_by_fkey";

alter table "public"."stockai_receipts" add constraint "stockai_receipts_invoice_number_check" CHECK (((length(TRIM(BOTH FROM invoice_number)) >= 1) AND (length(TRIM(BOTH FROM invoice_number)) <= 44))) not valid;

alter table "public"."stockai_receipts" validate constraint "stockai_receipts_invoice_number_check";

alter table "public"."stockai_receipts" add constraint "stockai_receipts_org_id_fkey" FOREIGN KEY (org_id) REFERENCES public.stockai_orgs(id) not valid;

alter table "public"."stockai_receipts" validate constraint "stockai_receipts_org_id_fkey";

alter table "public"."stockai_receipts" add constraint "stockai_receipts_org_id_id_key" UNIQUE using index "stockai_receipts_org_id_id_key";

alter table "public"."stockai_receipts" add constraint "stockai_receipts_org_id_request_id_key" UNIQUE using index "stockai_receipts_org_id_request_id_key";

alter table "public"."stockai_receipts" add constraint "stockai_receipts_org_id_supplier_id_fkey" FOREIGN KEY (org_id, supplier_id) REFERENCES public.stockai_suppliers(org_id, id) not valid;

alter table "public"."stockai_receipts" validate constraint "stockai_receipts_org_id_supplier_id_fkey";

alter table "public"."stockai_receipts" add constraint "stockai_receipts_org_id_unit_id_fkey" FOREIGN KEY (org_id, unit_id) REFERENCES public.stockai_units(org_id, id) not valid;

alter table "public"."stockai_receipts" validate constraint "stockai_receipts_org_id_unit_id_fkey";

alter table "public"."stockai_receipts" add constraint "stockai_receipts_org_id_unit_id_id_key" UNIQUE using index "stockai_receipts_org_id_unit_id_id_key";

alter table "public"."stockai_receipts" add constraint "stockai_receipts_status_check" CHECK ((status = ANY (ARRAY['counting'::text, 'pending_approval'::text, 'closed'::text]))) not valid;

alter table "public"."stockai_receipts" validate constraint "stockai_receipts_status_check";

alter table "public"."stockai_receipts" add constraint "stockai_receipts_unit_id_supplier_id_invoice_number_key" UNIQUE using index "stockai_receipts_unit_id_supplier_id_invoice_number_key";

alter table "public"."stockai_stock_movements" add constraint "stockai_stock_movements_check" CHECK ((((kind = 'entry'::text) AND (qty_base >= (0)::numeric) AND (reverses_id IS NULL)) OR ((kind = 'reversal'::text) AND (qty_base <= (0)::numeric) AND (reverses_id IS NOT NULL)))) not valid;

alter table "public"."stockai_stock_movements" validate constraint "stockai_stock_movements_check";

alter table "public"."stockai_stock_movements" add constraint "stockai_stock_movements_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) not valid;

alter table "public"."stockai_stock_movements" validate constraint "stockai_stock_movements_created_by_fkey";

alter table "public"."stockai_stock_movements" add constraint "stockai_stock_movements_kind_check" CHECK ((kind = ANY (ARRAY['entry'::text, 'reversal'::text]))) not valid;

alter table "public"."stockai_stock_movements" validate constraint "stockai_stock_movements_kind_check";

alter table "public"."stockai_stock_movements" add constraint "stockai_stock_movements_org_id_item_id_fkey" FOREIGN KEY (org_id, item_id) REFERENCES public.stockai_items(org_id, id) not valid;

alter table "public"."stockai_stock_movements" validate constraint "stockai_stock_movements_org_id_item_id_fkey";

alter table "public"."stockai_stock_movements" add constraint "stockai_stock_movements_org_id_receipt_line_id_fkey" FOREIGN KEY (org_id, receipt_line_id) REFERENCES public.stockai_receipt_lines(org_id, id) not valid;

alter table "public"."stockai_stock_movements" validate constraint "stockai_stock_movements_org_id_receipt_line_id_fkey";

alter table "public"."stockai_stock_movements" add constraint "stockai_stock_movements_org_id_unit_id_fkey" FOREIGN KEY (org_id, unit_id) REFERENCES public.stockai_units(org_id, id) not valid;

alter table "public"."stockai_stock_movements" validate constraint "stockai_stock_movements_org_id_unit_id_fkey";

alter table "public"."stockai_stock_movements" add constraint "stockai_stock_movements_receipt_line_id_kind_key" UNIQUE using index "stockai_stock_movements_receipt_line_id_kind_key";

alter table "public"."stockai_stock_movements" add constraint "stockai_stock_movements_reverses_id_fkey" FOREIGN KEY (reverses_id) REFERENCES public.stockai_stock_movements(id) not valid;

alter table "public"."stockai_stock_movements" validate constraint "stockai_stock_movements_reverses_id_fkey";

alter table "public"."stockai_stock_movements" add constraint "stockai_stock_movements_reverses_id_key" UNIQUE using index "stockai_stock_movements_reverses_id_key";

alter table "public"."stockai_supplier_claims" add constraint "stockai_supplier_claims_amount_cents_check" CHECK ((amount_cents > 0)) not valid;

alter table "public"."stockai_supplier_claims" validate constraint "stockai_supplier_claims_amount_cents_check";

alter table "public"."stockai_supplier_claims" add constraint "stockai_supplier_claims_org_id_receipt_line_id_fkey" FOREIGN KEY (org_id, receipt_line_id) REFERENCES public.stockai_receipt_lines(org_id, id) not valid;

alter table "public"."stockai_supplier_claims" validate constraint "stockai_supplier_claims_org_id_receipt_line_id_fkey";

alter table "public"."stockai_supplier_claims" add constraint "stockai_supplier_claims_org_id_supplier_id_fkey" FOREIGN KEY (org_id, supplier_id) REFERENCES public.stockai_suppliers(org_id, id) not valid;

alter table "public"."stockai_supplier_claims" validate constraint "stockai_supplier_claims_org_id_supplier_id_fkey";

alter table "public"."stockai_supplier_claims" add constraint "stockai_supplier_claims_org_id_unit_id_fkey" FOREIGN KEY (org_id, unit_id) REFERENCES public.stockai_units(org_id, id) not valid;

alter table "public"."stockai_supplier_claims" validate constraint "stockai_supplier_claims_org_id_unit_id_fkey";

alter table "public"."stockai_supplier_claims" add constraint "stockai_supplier_claims_qty_base_check" CHECK ((qty_base > (0)::numeric)) not valid;

alter table "public"."stockai_supplier_claims" validate constraint "stockai_supplier_claims_qty_base_check";

alter table "public"."stockai_supplier_claims" add constraint "stockai_supplier_claims_receipt_line_id_key" UNIQUE using index "stockai_supplier_claims_receipt_line_id_key";

alter table "public"."stockai_supplier_claims" add constraint "stockai_supplier_claims_status_check" CHECK ((status = ANY (ARRAY['open'::text, 'acknowledged'::text, 'settled'::text, 'written_off'::text]))) not valid;

alter table "public"."stockai_supplier_claims" validate constraint "stockai_supplier_claims_status_check";

alter table "public"."stockai_suppliers" add constraint "stockai_suppliers_name_check" CHECK (((length(TRIM(BOTH FROM name)) >= 1) AND (length(TRIM(BOTH FROM name)) <= 120))) not valid;

alter table "public"."stockai_suppliers" validate constraint "stockai_suppliers_name_check";

alter table "public"."stockai_suppliers" add constraint "stockai_suppliers_org_id_fkey" FOREIGN KEY (org_id) REFERENCES public.stockai_orgs(id) not valid;

alter table "public"."stockai_suppliers" validate constraint "stockai_suppliers_org_id_fkey";

alter table "public"."stockai_suppliers" add constraint "stockai_suppliers_org_id_id_key" UNIQUE using index "stockai_suppliers_org_id_id_key";

alter table "public"."stockai_suppliers" add constraint "stockai_suppliers_org_id_name_key" UNIQUE using index "stockai_suppliers_org_id_name_key";

alter table "public"."stockai_units" add constraint "stockai_units_name_check" CHECK (((length(TRIM(BOTH FROM name)) >= 1) AND (length(TRIM(BOTH FROM name)) <= 80))) not valid;

alter table "public"."stockai_units" validate constraint "stockai_units_name_check";

alter table "public"."stockai_units" add constraint "stockai_units_org_id_fkey" FOREIGN KEY (org_id) REFERENCES public.stockai_orgs(id) not valid;

alter table "public"."stockai_units" validate constraint "stockai_units_org_id_fkey";

alter table "public"."stockai_units" add constraint "stockai_units_org_id_id_key" UNIQUE using index "stockai_units_org_id_id_key";

alter table "public"."stockai_units" add constraint "stockai_units_org_id_name_key" UNIQUE using index "stockai_units_org_id_name_key";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION stockai_private.stockai_approve_receipt(p_receipt uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare r stockai_receipts;
begin
 select * into r from stockai_receipts where id=p_receipt for update;
 if not found or not stockai_private.can_access(r.org_id,r.unit_id,array['owner','manager','unit_manager','implementer']) then raise exception 'Sem permissão.' using errcode='42501'; end if;
 if r.status='closed' then return; end if;
 if r.status<>'pending_approval' then raise exception 'Recebimento não está aguardando aprovação.'; end if;
 perform stockai_private.finalize_receipt(r.id);
end; $function$
;

CREATE OR REPLACE FUNCTION stockai_private.blind_receipt(p_receipt uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare r stockai_receipts; result jsonb;
begin
 select * into r from stockai_receipts where id=p_receipt;
 if not found or not stockai_private.can_access(r.org_id,r.unit_id,array['owner','manager','unit_manager','operator','implementer']) then raise exception 'Sem permissão.' using errcode='42501'; end if;
 select jsonb_build_object('id',r.id,'supplier',s.name,'unit',u.name,'status',r.status,'lines',
   (select jsonb_agg(jsonb_build_object('id',l.id,'name',i.name,'uom',i.base_uom) order by i.name)
    from stockai_receipt_lines l join stockai_items i on i.id=l.item_id where l.receipt_id=r.id)) into result
 from stockai_suppliers s,stockai_units u where s.id=r.supplier_id and u.id=r.unit_id;
 return result;
end; $function$
;

CREATE OR REPLACE FUNCTION stockai_private.bootstrap(p_org_name text, p_unit_name text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_org uuid; v_unit uuid;
begin
 if auth.uid() is null then raise exception 'Autenticação necessária.' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
 if exists(select 1 from stockai_memberships where user_id=auth.uid() and revoked_at is null) then raise exception 'Usuário já possui uma organização.'; end if;
 insert into stockai_orgs(name) values(trim(p_org_name)) returning id into v_org;
 insert into stockai_units(org_id,name) values(v_org,trim(p_unit_name)) returning id into v_unit;
 insert into stockai_memberships(org_id,user_id,role) values(v_org,auth.uid(),'owner');
 return v_unit;
end; $function$
;

CREATE OR REPLACE FUNCTION stockai_private.can_access(p_org uuid, p_unit uuid DEFAULT NULL::uuid, p_roles text[] DEFAULT NULL::text[])
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
 select auth.uid() is not null and exists (
 select 1 from public.stockai_memberships m where m.user_id=auth.uid() and m.org_id=p_org
 and m.revoked_at is null and (m.expires_at is null or m.expires_at>now())
 and (p_unit is null or m.unit_id is null or m.unit_id=p_unit)
 and (p_roles is null or m.role=any(p_roles))
 );
$function$
;

CREATE OR REPLACE FUNCTION stockai_private.stockai_create_receipt(p_unit uuid, p_supplier text, p_invoice text, p_lines jsonb, p_request uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_org uuid; v_supplier uuid; v_receipt uuid; v_item uuid; l jsonb;
begin
 select org_id into v_org from stockai_units where id=p_unit;
 if v_org is null or not stockai_private.can_access(v_org,p_unit,array['owner','manager','unit_manager','implementer']) then raise exception 'Sem permissão.' using errcode='42501'; end if;
 if p_request is null or p_lines is null or jsonb_typeof(p_lines)<>'array' or jsonb_array_length(p_lines) not between 1 and 100 then raise exception 'Informe entre 1 e 100 itens.'; end if;
 perform pg_advisory_xact_lock(hashtextextended(v_org::text||p_request::text,0));
 select id into v_receipt from stockai_receipts where org_id=v_org and request_id=p_request;
 if found then return v_receipt; end if;
 insert into stockai_suppliers(org_id,name) values(v_org,trim(p_supplier)) on conflict(org_id,name) do update set name=excluded.name returning id into v_supplier;
 insert into stockai_receipts(org_id,unit_id,supplier_id,invoice_number,request_id,created_by) values(v_org,p_unit,v_supplier,trim(p_invoice),p_request,auth.uid()) returning id into v_receipt;
 for l in select value from jsonb_array_elements(p_lines) loop
   if jsonb_typeof(l->'quantity')<>'number' or jsonb_typeof(l->'price_cents')<>'number' or (l->>'price_cents')::numeric<>trunc((l->>'price_cents')::numeric) then raise exception 'Quantidade ou preço inválido.'; end if;
   insert into stockai_items(org_id,name,base_uom) values(v_org,trim(l->>'name'),l->>'uom') on conflict(org_id,name,base_uom) do update set name=excluded.name returning id into v_item;
   insert into stockai_receipt_lines(org_id,unit_id,receipt_id,item_id,invoiced_qty,unit_price_cents)
   values(v_org,p_unit,v_receipt,v_item,(l->>'quantity')::numeric,(l->>'price_cents')::bigint);
 end loop;
 insert into stockai_audit_events(org_id,unit_id,actor_id,receipt_id,kind) values(v_org,p_unit,auth.uid(),v_receipt,'receipt_created');
 return v_receipt;
end; $function$
;

CREATE OR REPLACE FUNCTION stockai_private.finalize_receipt(p_receipt uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare r stockai_receipts;
begin
 select * into r from stockai_receipts where id=p_receipt for update;
 if r.status='closed' then return; end if;
 if exists(select 1 from stockai_receipt_lines where receipt_id=r.id and counted_qty is null) then raise exception 'Contagem incompleta.'; end if;
 insert into stockai_stock_movements(org_id,unit_id,item_id,receipt_line_id,qty_base,unit_cost_cents,created_by)
 select org_id,unit_id,item_id,id,counted_qty,unit_price_cents,auth.uid() from stockai_receipt_lines where receipt_id=r.id and counted_qty>0;
 insert into stockai_supplier_claims(org_id,unit_id,supplier_id,receipt_line_id,amount_cents,qty_base)
 select org_id,unit_id,r.supplier_id,id,credit_cents,invoiced_qty-counted_qty from stockai_receipt_lines where receipt_id=r.id and credit_cents>0;
 update stockai_receipts set status='closed',approved_by=auth.uid(),closed_at=now() where id=r.id;
 insert into stockai_audit_events(org_id,unit_id,actor_id,receipt_id,kind) values(r.org_id,r.unit_id,auth.uid(),r.id,'receipt_closed');
end; $function$
;

CREATE OR REPLACE FUNCTION stockai_private.immutable_record()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin raise exception 'Registro imutável: use uma operação de estorno.'; end;
$function$
;

CREATE OR REPLACE FUNCTION stockai_private.protect_fiscal()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
 if (new.org_id,new.unit_id,new.receipt_id,new.item_id,new.invoiced_qty,new.unit_price_cents) is distinct from
 (old.org_id,old.unit_id,old.receipt_id,old.item_id,old.invoiced_qty,old.unit_price_cents) then raise exception 'Documento fiscal imutável.'; end if;
 return new;
end; $function$
;

CREATE OR REPLACE FUNCTION stockai_private.submit_count(p_receipt uuid, p_counts jsonb)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare r stockai_receipts; l stockai_receipt_lines; v_qty numeric; v_divergent boolean := false;
begin
 select * into r from stockai_receipts where id=p_receipt for update;
 if not found or not stockai_private.can_access(r.org_id,r.unit_id,array['owner','manager','unit_manager','operator','implementer']) then raise exception 'Sem permissão.' using errcode='42501'; end if;
 if r.status<>'counting' then raise exception 'Recebimento já conferido.'; end if;
 if p_counts is null or jsonb_typeof(p_counts)<>'object' then raise exception 'Contagem inválida.'; end if;
 if (select count(*) from jsonb_object_keys(p_counts))<>(select count(*) from stockai_receipt_lines where receipt_id=r.id) then raise exception 'Informe todos os itens, sem duplicações.'; end if;
 for l in select * from stockai_receipt_lines where receipt_id=r.id loop
   if not (p_counts ? l.id::text) or jsonb_typeof(p_counts->l.id::text)<>'number' then raise exception 'Contagem incompleta.'; end if;
   v_qty := (p_counts->>l.id::text)::numeric;
   if v_qty<0 or v_qty>=1000000000 or v_qty<>round(v_qty,4) then raise exception 'Quantidade inválida.'; end if;
   v_divergent:=v_divergent or v_qty<>l.invoiced_qty;
   update stockai_receipt_lines set counted_qty=v_qty,payable_cents=round(least(v_qty,invoiced_qty)*unit_price_cents),
   credit_cents=round(invoiced_qty*unit_price_cents)-round(least(v_qty,invoiced_qty)*unit_price_cents) where id=l.id;
 end loop;
 update stockai_receipts set counted_by=auth.uid(),status='pending_approval' where id=r.id;
 insert into stockai_audit_events(org_id,unit_id,actor_id,receipt_id,kind,payload) values(r.org_id,r.unit_id,auth.uid(),r.id,'receipt_counted',jsonb_build_object('divergent',v_divergent));
 if not v_divergent then perform stockai_private.finalize_receipt(r.id); return 'closed'; end if;
 return 'pending_approval';
end; $function$
;

CREATE OR REPLACE FUNCTION public.stockai_approve_receipt(p_receipt uuid)
 RETURNS void
 LANGUAGE sql
 SET search_path TO 'public'
AS $function$ select stockai_private.stockai_approve_receipt(p_receipt); $function$
;

CREATE OR REPLACE FUNCTION public.stockai_bootstrap_organization(p_org_name text, p_unit_name text)
 RETURNS uuid
 LANGUAGE sql
 SET search_path TO 'public'
AS $function$ select stockai_private.bootstrap(p_org_name,p_unit_name); $function$
;

CREATE OR REPLACE FUNCTION public.stockai_create_receipt(p_unit uuid, p_supplier text, p_invoice text, p_lines jsonb, p_request uuid)
 RETURNS uuid
 LANGUAGE sql
 SET search_path TO 'public'
AS $function$ select stockai_private.stockai_create_receipt(p_unit,p_supplier,p_invoice,p_lines,p_request); $function$
;

CREATE OR REPLACE FUNCTION public.stockai_get_blind_receipt(p_receipt uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$ select stockai_private.blind_receipt(p_receipt); $function$
;

CREATE OR REPLACE FUNCTION public.stockai_submit_receipt_count(p_receipt uuid, p_counts jsonb)
 RETURNS text
 LANGUAGE sql
 SET search_path TO 'public'
AS $function$ select stockai_private.submit_count(p_receipt,p_counts); $function$
;

grant select on table "public"."stockai_audit_events" to "authenticated";

grant delete on table "public"."stockai_audit_events" to "service_role";

grant insert on table "public"."stockai_audit_events" to "service_role";

grant references on table "public"."stockai_audit_events" to "service_role";

grant select on table "public"."stockai_audit_events" to "service_role";

grant trigger on table "public"."stockai_audit_events" to "service_role";

grant truncate on table "public"."stockai_audit_events" to "service_role";

grant update on table "public"."stockai_audit_events" to "service_role";

grant select on table "public"."stockai_items" to "authenticated";

grant delete on table "public"."stockai_items" to "service_role";

grant insert on table "public"."stockai_items" to "service_role";

grant references on table "public"."stockai_items" to "service_role";

grant select on table "public"."stockai_items" to "service_role";

grant trigger on table "public"."stockai_items" to "service_role";

grant truncate on table "public"."stockai_items" to "service_role";

grant update on table "public"."stockai_items" to "service_role";

grant select on table "public"."stockai_memberships" to "authenticated";

grant delete on table "public"."stockai_memberships" to "service_role";

grant insert on table "public"."stockai_memberships" to "service_role";

grant references on table "public"."stockai_memberships" to "service_role";

grant select on table "public"."stockai_memberships" to "service_role";

grant trigger on table "public"."stockai_memberships" to "service_role";

grant truncate on table "public"."stockai_memberships" to "service_role";

grant update on table "public"."stockai_memberships" to "service_role";

grant select on table "public"."stockai_orgs" to "authenticated";

grant delete on table "public"."stockai_orgs" to "service_role";

grant insert on table "public"."stockai_orgs" to "service_role";

grant references on table "public"."stockai_orgs" to "service_role";

grant select on table "public"."stockai_orgs" to "service_role";

grant trigger on table "public"."stockai_orgs" to "service_role";

grant truncate on table "public"."stockai_orgs" to "service_role";

grant update on table "public"."stockai_orgs" to "service_role";

grant select on table "public"."stockai_receipt_lines" to "authenticated";

grant delete on table "public"."stockai_receipt_lines" to "service_role";

grant insert on table "public"."stockai_receipt_lines" to "service_role";

grant references on table "public"."stockai_receipt_lines" to "service_role";

grant select on table "public"."stockai_receipt_lines" to "service_role";

grant trigger on table "public"."stockai_receipt_lines" to "service_role";

grant truncate on table "public"."stockai_receipt_lines" to "service_role";

grant update on table "public"."stockai_receipt_lines" to "service_role";

grant select on table "public"."stockai_receipts" to "authenticated";

grant delete on table "public"."stockai_receipts" to "service_role";

grant insert on table "public"."stockai_receipts" to "service_role";

grant references on table "public"."stockai_receipts" to "service_role";

grant select on table "public"."stockai_receipts" to "service_role";

grant trigger on table "public"."stockai_receipts" to "service_role";

grant truncate on table "public"."stockai_receipts" to "service_role";

grant update on table "public"."stockai_receipts" to "service_role";

grant select on table "public"."stockai_stock_movements" to "authenticated";

grant delete on table "public"."stockai_stock_movements" to "service_role";

grant insert on table "public"."stockai_stock_movements" to "service_role";

grant references on table "public"."stockai_stock_movements" to "service_role";

grant select on table "public"."stockai_stock_movements" to "service_role";

grant trigger on table "public"."stockai_stock_movements" to "service_role";

grant truncate on table "public"."stockai_stock_movements" to "service_role";

grant update on table "public"."stockai_stock_movements" to "service_role";

grant select on table "public"."stockai_supplier_claims" to "authenticated";

grant delete on table "public"."stockai_supplier_claims" to "service_role";

grant insert on table "public"."stockai_supplier_claims" to "service_role";

grant references on table "public"."stockai_supplier_claims" to "service_role";

grant select on table "public"."stockai_supplier_claims" to "service_role";

grant trigger on table "public"."stockai_supplier_claims" to "service_role";

grant truncate on table "public"."stockai_supplier_claims" to "service_role";

grant update on table "public"."stockai_supplier_claims" to "service_role";

grant select on table "public"."stockai_suppliers" to "authenticated";

grant delete on table "public"."stockai_suppliers" to "service_role";

grant insert on table "public"."stockai_suppliers" to "service_role";

grant references on table "public"."stockai_suppliers" to "service_role";

grant select on table "public"."stockai_suppliers" to "service_role";

grant trigger on table "public"."stockai_suppliers" to "service_role";

grant truncate on table "public"."stockai_suppliers" to "service_role";

grant update on table "public"."stockai_suppliers" to "service_role";

grant select on table "public"."stockai_units" to "authenticated";

grant delete on table "public"."stockai_units" to "service_role";

grant insert on table "public"."stockai_units" to "service_role";

grant references on table "public"."stockai_units" to "service_role";

grant select on table "public"."stockai_units" to "service_role";

grant trigger on table "public"."stockai_units" to "service_role";

grant truncate on table "public"."stockai_units" to "service_role";

grant update on table "public"."stockai_units" to "service_role";


  create policy "audit_manager_read"
  on "public"."stockai_audit_events"
  as permissive
  for select
  to authenticated
using (stockai_private.can_access(org_id, unit_id, ARRAY['owner'::text, 'manager'::text, 'unit_manager'::text, 'implementer'::text]));



  create policy "stockai_items_read"
  on "public"."stockai_items"
  as permissive
  for select
  to authenticated
using (stockai_private.can_access(org_id));



  create policy "stockai_memberships_self"
  on "public"."stockai_memberships"
  as permissive
  for select
  to authenticated
using (((user_id = ( SELECT auth.uid() AS uid)) AND (revoked_at IS NULL) AND ((expires_at IS NULL) OR (expires_at > now()))));



  create policy "stockai_orgs_read"
  on "public"."stockai_orgs"
  as permissive
  for select
  to authenticated
using (stockai_private.can_access(id));



  create policy "lines_manager_read"
  on "public"."stockai_receipt_lines"
  as permissive
  for select
  to authenticated
using (stockai_private.can_access(org_id, unit_id, ARRAY['owner'::text, 'manager'::text, 'unit_manager'::text, 'implementer'::text]));



  create policy "stockai_receipts_manager_read"
  on "public"."stockai_receipts"
  as permissive
  for select
  to authenticated
using (stockai_private.can_access(org_id, unit_id, ARRAY['owner'::text, 'manager'::text, 'unit_manager'::text, 'implementer'::text]));



  create policy "movements_manager_read"
  on "public"."stockai_stock_movements"
  as permissive
  for select
  to authenticated
using (stockai_private.can_access(org_id, unit_id, ARRAY['owner'::text, 'manager'::text, 'unit_manager'::text, 'implementer'::text]));



  create policy "claims_manager_read"
  on "public"."stockai_supplier_claims"
  as permissive
  for select
  to authenticated
using (stockai_private.can_access(org_id, unit_id, ARRAY['owner'::text, 'manager'::text, 'unit_manager'::text, 'implementer'::text]));



  create policy "stockai_suppliers_read"
  on "public"."stockai_suppliers"
  as permissive
  for select
  to authenticated
using (stockai_private.can_access(org_id));



  create policy "stockai_units_read"
  on "public"."stockai_units"
  as permissive
  for select
  to authenticated
using (stockai_private.can_access(org_id, id));


CREATE TRIGGER audit_immutable BEFORE DELETE OR UPDATE ON public.stockai_audit_events FOR EACH ROW EXECUTE FUNCTION stockai_private.immutable_record();

CREATE TRIGGER lines_fiscal_immutable BEFORE UPDATE ON public.stockai_receipt_lines FOR EACH ROW EXECUTE FUNCTION stockai_private.protect_fiscal();

CREATE TRIGGER lines_no_delete BEFORE DELETE ON public.stockai_receipt_lines FOR EACH ROW EXECUTE FUNCTION stockai_private.immutable_record();

CREATE TRIGGER movements_immutable BEFORE DELETE OR UPDATE ON public.stockai_stock_movements FOR EACH ROW EXECUTE FUNCTION stockai_private.immutable_record();



-- Explicit ACLs: schema-diff output does not preserve all function/schema privileges.
revoke all on schema stockai_private from public;
grant usage on schema stockai_private to authenticated;
revoke all on public.stockai_orgs,public.stockai_units,public.stockai_memberships,public.stockai_suppliers,public.stockai_items,public.stockai_receipts,public.stockai_receipt_lines,public.stockai_stock_movements,public.stockai_supplier_claims,public.stockai_audit_events from anon,authenticated;
grant select on public.stockai_orgs,public.stockai_units,public.stockai_memberships,public.stockai_suppliers,public.stockai_items,public.stockai_receipts,public.stockai_receipt_lines,public.stockai_stock_movements,public.stockai_supplier_claims,public.stockai_audit_events to authenticated;
revoke execute on all functions in schema stockai_private from public,anon,authenticated;
grant execute on function stockai_private.can_access(uuid,uuid,text[]),stockai_private.bootstrap(text,text),stockai_private.stockai_create_receipt(uuid,text,text,jsonb,uuid),stockai_private.blind_receipt(uuid),stockai_private.submit_count(uuid,jsonb),stockai_private.stockai_approve_receipt(uuid) to authenticated;
revoke execute on function public.stockai_bootstrap_organization(text,text),public.stockai_create_receipt(uuid,text,text,jsonb,uuid),public.stockai_get_blind_receipt(uuid),public.stockai_submit_receipt_count(uuid,jsonb),public.stockai_approve_receipt(uuid) from public,anon;
grant execute on function public.stockai_bootstrap_organization(text,text),public.stockai_create_receipt(uuid,text,text,jsonb,uuid),public.stockai_get_blind_receipt(uuid),public.stockai_submit_receipt_count(uuid,jsonb),public.stockai_approve_receipt(uuid) to authenticated;
