export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      stockai_audit_events: {
        Row: {
          actor_id: string
          created_at: string
          id: string
          kind: string
          org_id: string
          payload: Json
          receipt_id: string
          unit_id: string
        }
        Insert: {
          actor_id: string
          created_at?: string
          id?: string
          kind: string
          org_id: string
          payload?: Json
          receipt_id: string
          unit_id: string
        }
        Update: {
          actor_id?: string
          created_at?: string
          id?: string
          kind?: string
          org_id?: string
          payload?: Json
          receipt_id?: string
          unit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stockai_audit_receipt_history"
            columns: ["org_id", "receipt_id"]
            isOneToOne: false
            referencedRelation: "stockai_receipts"
            referencedColumns: ["org_id", "id"]
          },
        ]
      }
      stockai_items: {
        Row: {
          base_uom: string
          category_id: string | null
          composes_cmv: boolean | null
          created_at: string
          id: string
          internal_code: string
          is_active: boolean
          name: string
          org_id: string
          source_references: Json
        }
        Insert: {
          base_uom: string
          category_id?: string | null
          composes_cmv?: boolean | null
          created_at?: string
          id?: string
          internal_code?: string
          is_active?: boolean
          name: string
          org_id: string
          source_references?: Json
        }
        Update: {
          base_uom?: string
          category_id?: string | null
          composes_cmv?: boolean | null
          created_at?: string
          id?: string
          internal_code?: string
          is_active?: boolean
          name?: string
          org_id?: string
          source_references?: Json
        }
        Relationships: [
          {
            foreignKeyName: "stockai_items_category_scope"
            columns: ["org_id", "category_id"]
            isOneToOne: false
            referencedRelation: "stockai_product_categories"
            referencedColumns: ["org_id", "id"]
          },
          {
            foreignKeyName: "stockai_items_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "stockai_orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      stockai_memberships: {
        Row: {
          created_at: string
          expires_at: string | null
          id: string
          org_id: string
          revoked_at: string | null
          role: string
          unit_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          expires_at?: string | null
          id?: string
          org_id: string
          revoked_at?: string | null
          role: string
          unit_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string | null
          id?: string
          org_id?: string
          revoked_at?: string | null
          role?: string
          unit_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stockai_memberships_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "stockai_orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stockai_memberships_org_id_unit_id_fkey"
            columns: ["org_id", "unit_id"]
            isOneToOne: false
            referencedRelation: "stockai_units"
            referencedColumns: ["org_id", "id"]
          },
        ]
      }
      stockai_nfe_documents: {
        Row: {
          created_at: string
          org_id: string
          raw_xml: string
          receipt_id: string
          unit_id: string
        }
        Insert: {
          created_at?: string
          org_id: string
          raw_xml: string
          receipt_id: string
          unit_id: string
        }
        Update: {
          created_at?: string
          org_id?: string
          raw_xml?: string
          receipt_id?: string
          unit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stockai_nfe_receipt_history"
            columns: ["org_id", "receipt_id"]
            isOneToOne: false
            referencedRelation: "stockai_receipts"
            referencedColumns: ["org_id", "id"]
          },
        ]
      }
      stockai_order_lines: {
        Row: {
          dispatched_qty: number | null
          id: string
          item_id: string
          item_name: string
          order_id: string
          org_id: string
          requested_qty: number
          uom: string
        }
        Insert: {
          dispatched_qty?: number | null
          id?: string
          item_id: string
          item_name: string
          order_id: string
          org_id: string
          requested_qty: number
          uom: string
        }
        Update: {
          dispatched_qty?: number | null
          id?: string
          item_id?: string
          item_name?: string
          order_id?: string
          org_id?: string
          requested_qty?: number
          uom?: string
        }
        Relationships: [
          {
            foreignKeyName: "stockai_order_lines_org_id_item_id_fkey"
            columns: ["org_id", "item_id"]
            isOneToOne: false
            referencedRelation: "stockai_items"
            referencedColumns: ["org_id", "id"]
          },
          {
            foreignKeyName: "stockai_order_lines_org_id_order_id_fkey"
            columns: ["org_id", "order_id"]
            isOneToOne: false
            referencedRelation: "stockai_orders"
            referencedColumns: ["org_id", "id"]
          },
        ]
      }
      stockai_order_movements: {
        Row: {
          created_at: string
          created_by: string
          id: string
          item_id: string
          order_line_id: string
          org_id: string
          qty_base: number
          unit_cost_cents: number
          unit_id: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          item_id: string
          order_line_id: string
          org_id: string
          qty_base: number
          unit_cost_cents: number
          unit_id: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          item_id?: string
          order_line_id?: string
          org_id?: string
          qty_base?: number
          unit_cost_cents?: number
          unit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stockai_order_movements_org_id_item_id_fkey"
            columns: ["org_id", "item_id"]
            isOneToOne: false
            referencedRelation: "stockai_items"
            referencedColumns: ["org_id", "id"]
          },
          {
            foreignKeyName: "stockai_order_movements_org_id_order_line_id_fkey"
            columns: ["org_id", "order_line_id"]
            isOneToOne: false
            referencedRelation: "stockai_order_lines"
            referencedColumns: ["org_id", "id"]
          },
          {
            foreignKeyName: "stockai_order_movements_org_id_unit_id_fkey"
            columns: ["org_id", "unit_id"]
            isOneToOne: false
            referencedRelation: "stockai_units"
            referencedColumns: ["org_id", "id"]
          },
        ]
      }
      stockai_orders: {
        Row: {
          cancelled_at: string | null
          cancelled_by: string | null
          created_at: string
          created_by: string
          delivery_notes: string | null
          destination_id: string
          destination_name: string
          dispatched_at: string | null
          dispatched_by: string | null
          id: string
          kitchen: string
          needed_on: string
          notes: string
          org_id: string
          received_at: string | null
          received_by: string | null
          receiver_name: string | null
          request_id: string
          signature: Json | null
          source_id: string
          source_name: string
          status: string
        }
        Insert: {
          cancelled_at?: string | null
          cancelled_by?: string | null
          created_at?: string
          created_by: string
          delivery_notes?: string | null
          destination_id: string
          destination_name: string
          dispatched_at?: string | null
          dispatched_by?: string | null
          id?: string
          kitchen: string
          needed_on: string
          notes?: string
          org_id: string
          received_at?: string | null
          received_by?: string | null
          receiver_name?: string | null
          request_id: string
          signature?: Json | null
          source_id: string
          source_name: string
          status?: string
        }
        Update: {
          cancelled_at?: string | null
          cancelled_by?: string | null
          created_at?: string
          created_by?: string
          delivery_notes?: string | null
          destination_id?: string
          destination_name?: string
          dispatched_at?: string | null
          dispatched_by?: string | null
          id?: string
          kitchen?: string
          needed_on?: string
          notes?: string
          org_id?: string
          received_at?: string | null
          received_by?: string | null
          receiver_name?: string | null
          request_id?: string
          signature?: Json | null
          source_id?: string
          source_name?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "stockai_orders_org_id_destination_id_fkey"
            columns: ["org_id", "destination_id"]
            isOneToOne: false
            referencedRelation: "stockai_units"
            referencedColumns: ["org_id", "id"]
          },
          {
            foreignKeyName: "stockai_orders_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "stockai_orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stockai_orders_org_id_source_id_fkey"
            columns: ["org_id", "source_id"]
            isOneToOne: false
            referencedRelation: "stockai_units"
            referencedColumns: ["org_id", "id"]
          },
        ]
      }
      stockai_orgs: {
        Row: {
          created_at: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      stockai_payable_events: {
        Row: {
          actor_id: string | null
          after_data: Json
          before_data: Json | null
          created_at: string
          id: string
          kind: string
          org_id: string
          payable_id: string
        }
        Insert: {
          actor_id?: string | null
          after_data: Json
          before_data?: Json | null
          created_at?: string
          id?: string
          kind: string
          org_id: string
          payable_id: string
        }
        Update: {
          actor_id?: string | null
          after_data?: Json
          before_data?: Json | null
          created_at?: string
          id?: string
          kind?: string
          org_id?: string
          payable_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stockai_payable_events_org_id_payable_id_fkey"
            columns: ["org_id", "payable_id"]
            isOneToOne: false
            referencedRelation: "stockai_payables"
            referencedColumns: ["org_id", "id"]
          },
        ]
      }
      stockai_payable_installments: {
        Row: {
          amount_cents: number
          due_on: string | null
          id: string
          org_id: string
          paid_on: string | null
          payable_id: string
          sequence: number
        }
        Insert: {
          amount_cents: number
          due_on?: string | null
          id?: string
          org_id: string
          paid_on?: string | null
          payable_id: string
          sequence: number
        }
        Update: {
          amount_cents?: number
          due_on?: string | null
          id?: string
          org_id?: string
          paid_on?: string | null
          payable_id?: string
          sequence?: number
        }
        Relationships: [
          {
            foreignKeyName: "stockai_payable_installments_org_id_payable_id_fkey"
            columns: ["org_id", "payable_id"]
            isOneToOne: false
            referencedRelation: "stockai_payables"
            referencedColumns: ["org_id", "id"]
          },
        ]
      }
      stockai_payables: {
        Row: {
          cancelled: boolean
          created_at: string
          creditor_name: string
          description: string
          document_number: string | null
          id: string
          inbox_id: string | null
          issued_on: string | null
          notes: string
          org_id: string
          receipt_id: string | null
          review_note: string | null
          revision: number
          source: string
          source_key: string
          supplier_id: string | null
          total_cents: number
          unit_id: string
          updated_at: string
        }
        Insert: {
          cancelled?: boolean
          created_at?: string
          creditor_name: string
          description: string
          document_number?: string | null
          id?: string
          inbox_id?: string | null
          issued_on?: string | null
          notes?: string
          org_id: string
          receipt_id?: string | null
          review_note?: string | null
          revision?: number
          source: string
          source_key: string
          supplier_id?: string | null
          total_cents: number
          unit_id: string
          updated_at?: string
        }
        Update: {
          cancelled?: boolean
          created_at?: string
          creditor_name?: string
          description?: string
          document_number?: string | null
          id?: string
          inbox_id?: string | null
          issued_on?: string | null
          notes?: string
          org_id?: string
          receipt_id?: string | null
          review_note?: string | null
          revision?: number
          source?: string
          source_key?: string
          supplier_id?: string | null
          total_cents?: number
          unit_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stockai_payables_inbox_id_fkey"
            columns: ["inbox_id"]
            isOneToOne: false
            referencedRelation: "stockai_xml_inbox"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stockai_payables_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "stockai_orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stockai_payables_org_id_receipt_id_fkey"
            columns: ["org_id", "receipt_id"]
            isOneToOne: false
            referencedRelation: "stockai_receipts"
            referencedColumns: ["org_id", "id"]
          },
          {
            foreignKeyName: "stockai_payables_org_id_supplier_id_fkey"
            columns: ["org_id", "supplier_id"]
            isOneToOne: false
            referencedRelation: "stockai_suppliers"
            referencedColumns: ["org_id", "id"]
          },
          {
            foreignKeyName: "stockai_payables_org_id_unit_id_fkey"
            columns: ["org_id", "unit_id"]
            isOneToOne: false
            referencedRelation: "stockai_units"
            referencedColumns: ["org_id", "id"]
          },
        ]
      }
      stockai_product_categories: {
        Row: {
          created_at: string
          id: string
          name: string
          org_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          org_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          org_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stockai_product_categories_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "stockai_orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      stockai_product_links: {
        Row: {
          factor: number
          id: string
          item_id: string
          org_id: string
          source_unit: string
          supplier_code: string
          supplier_tax_id: string
          updated_at: string
          updated_by: string
        }
        Insert: {
          factor: number
          id?: string
          item_id: string
          org_id: string
          source_unit: string
          supplier_code: string
          supplier_tax_id: string
          updated_at?: string
          updated_by: string
        }
        Update: {
          factor?: number
          id?: string
          item_id?: string
          org_id?: string
          source_unit?: string
          supplier_code?: string
          supplier_tax_id?: string
          updated_at?: string
          updated_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "stockai_product_links_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "stockai_orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stockai_product_links_org_id_item_id_fkey"
            columns: ["org_id", "item_id"]
            isOneToOne: false
            referencedRelation: "stockai_items"
            referencedColumns: ["org_id", "id"]
          },
        ]
      }
      stockai_receipt_lines: {
        Row: {
          counted_qty: number | null
          credit_cents: number | null
          fiscal_total_cents: number | null
          id: string
          invoiced_qty: number
          is_active: boolean
          item_id: string
          org_id: string
          payable_cents: number | null
          receipt_id: string
          source_data: Json | null
          source_item_number: number | null
          unit_id: string
          unit_price_cents: number
        }
        Insert: {
          counted_qty?: number | null
          credit_cents?: number | null
          fiscal_total_cents?: number | null
          id?: string
          invoiced_qty: number
          is_active?: boolean
          item_id: string
          org_id: string
          payable_cents?: number | null
          receipt_id: string
          source_data?: Json | null
          source_item_number?: number | null
          unit_id: string
          unit_price_cents: number
        }
        Update: {
          counted_qty?: number | null
          credit_cents?: number | null
          fiscal_total_cents?: number | null
          id?: string
          invoiced_qty?: number
          is_active?: boolean
          item_id?: string
          org_id?: string
          payable_cents?: number | null
          receipt_id?: string
          source_data?: Json | null
          source_item_number?: number | null
          unit_id?: string
          unit_price_cents?: number
        }
        Relationships: [
          {
            foreignKeyName: "stockai_lines_receipt_history"
            columns: ["org_id", "receipt_id"]
            isOneToOne: false
            referencedRelation: "stockai_receipts"
            referencedColumns: ["org_id", "id"]
          },
          {
            foreignKeyName: "stockai_lines_unit_history"
            columns: ["org_id", "unit_id"]
            isOneToOne: false
            referencedRelation: "stockai_units"
            referencedColumns: ["org_id", "id"]
          },
          {
            foreignKeyName: "stockai_receipt_lines_org_id_item_id_fkey"
            columns: ["org_id", "item_id"]
            isOneToOne: false
            referencedRelation: "stockai_items"
            referencedColumns: ["org_id", "id"]
          },
        ]
      }
      stockai_receipt_revisions: {
        Row: {
          actor_id: string
          after_data: Json
          before_data: Json
          created_at: string
          id: string
          org_id: string
          reason: string
          receipt_id: string
          request_id: string
          version: number
        }
        Insert: {
          actor_id: string
          after_data: Json
          before_data: Json
          created_at?: string
          id?: string
          org_id: string
          reason: string
          receipt_id: string
          request_id: string
          version: number
        }
        Update: {
          actor_id?: string
          after_data?: Json
          before_data?: Json
          created_at?: string
          id?: string
          org_id?: string
          reason?: string
          receipt_id?: string
          request_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "stockai_receipt_revisions_org_id_receipt_id_fkey"
            columns: ["org_id", "receipt_id"]
            isOneToOne: false
            referencedRelation: "stockai_receipts"
            referencedColumns: ["org_id", "id"]
          },
        ]
      }
      stockai_receipts: {
        Row: {
          access_key: string | null
          approved_by: string | null
          closed_at: string | null
          counted_by: string | null
          created_at: string
          created_by: string
          id: string
          invoice_number: string
          invoice_series: string | null
          invoice_total_cents: number | null
          issued_at: string | null
          notes: string
          org_id: string
          request_id: string
          revision: number
          status: string
          supplier_id: string
          unit_id: string
        }
        Insert: {
          access_key?: string | null
          approved_by?: string | null
          closed_at?: string | null
          counted_by?: string | null
          created_at?: string
          created_by: string
          id?: string
          invoice_number: string
          invoice_series?: string | null
          invoice_total_cents?: number | null
          issued_at?: string | null
          notes?: string
          org_id: string
          request_id: string
          revision?: number
          status?: string
          supplier_id: string
          unit_id: string
        }
        Update: {
          access_key?: string | null
          approved_by?: string | null
          closed_at?: string | null
          counted_by?: string | null
          created_at?: string
          created_by?: string
          id?: string
          invoice_number?: string
          invoice_series?: string | null
          invoice_total_cents?: number | null
          issued_at?: string | null
          notes?: string
          org_id?: string
          request_id?: string
          revision?: number
          status?: string
          supplier_id?: string
          unit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stockai_receipts_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "stockai_orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stockai_receipts_org_id_supplier_id_fkey"
            columns: ["org_id", "supplier_id"]
            isOneToOne: false
            referencedRelation: "stockai_suppliers"
            referencedColumns: ["org_id", "id"]
          },
          {
            foreignKeyName: "stockai_receipts_org_id_unit_id_fkey"
            columns: ["org_id", "unit_id"]
            isOneToOne: false
            referencedRelation: "stockai_units"
            referencedColumns: ["org_id", "id"]
          },
        ]
      }
      stockai_stock_movements: {
        Row: {
          created_at: string
          created_by: string
          id: string
          item_id: string
          kind: string
          org_id: string
          qty_base: number
          receipt_line_id: string
          reverses_id: string | null
          unit_cost_cents: number
          unit_id: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          item_id: string
          kind?: string
          org_id: string
          qty_base: number
          receipt_line_id: string
          reverses_id?: string | null
          unit_cost_cents: number
          unit_id: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          item_id?: string
          kind?: string
          org_id?: string
          qty_base?: number
          receipt_line_id?: string
          reverses_id?: string | null
          unit_cost_cents?: number
          unit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stockai_stock_movements_org_id_item_id_fkey"
            columns: ["org_id", "item_id"]
            isOneToOne: false
            referencedRelation: "stockai_items"
            referencedColumns: ["org_id", "id"]
          },
          {
            foreignKeyName: "stockai_stock_movements_org_id_receipt_line_id_fkey"
            columns: ["org_id", "receipt_line_id"]
            isOneToOne: false
            referencedRelation: "stockai_receipt_lines"
            referencedColumns: ["org_id", "id"]
          },
          {
            foreignKeyName: "stockai_stock_movements_org_id_unit_id_fkey"
            columns: ["org_id", "unit_id"]
            isOneToOne: false
            referencedRelation: "stockai_units"
            referencedColumns: ["org_id", "id"]
          },
          {
            foreignKeyName: "stockai_stock_movements_reverses_id_fkey"
            columns: ["reverses_id"]
            isOneToOne: true
            referencedRelation: "stockai_stock_movements"
            referencedColumns: ["id"]
          },
        ]
      }
      stockai_supplier_claims: {
        Row: {
          amount_cents: number
          created_at: string
          id: string
          org_id: string
          qty_base: number
          receipt_line_id: string
          status: string
          supplier_id: string
          unit_id: string
        }
        Insert: {
          amount_cents: number
          created_at?: string
          id?: string
          org_id: string
          qty_base: number
          receipt_line_id: string
          status?: string
          supplier_id: string
          unit_id: string
        }
        Update: {
          amount_cents?: number
          created_at?: string
          id?: string
          org_id?: string
          qty_base?: number
          receipt_line_id?: string
          status?: string
          supplier_id?: string
          unit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stockai_supplier_claims_org_id_receipt_line_id_fkey"
            columns: ["org_id", "receipt_line_id"]
            isOneToOne: false
            referencedRelation: "stockai_receipt_lines"
            referencedColumns: ["org_id", "id"]
          },
          {
            foreignKeyName: "stockai_supplier_claims_org_id_supplier_id_fkey"
            columns: ["org_id", "supplier_id"]
            isOneToOne: false
            referencedRelation: "stockai_suppliers"
            referencedColumns: ["org_id", "id"]
          },
          {
            foreignKeyName: "stockai_supplier_claims_org_id_unit_id_fkey"
            columns: ["org_id", "unit_id"]
            isOneToOne: false
            referencedRelation: "stockai_units"
            referencedColumns: ["org_id", "id"]
          },
        ]
      }
      stockai_suppliers: {
        Row: {
          address: string | null
          aliases: string[]
          contact_name: string | null
          created_at: string
          email: string | null
          id: string
          legal_name: string | null
          name: string
          notes: string | null
          org_id: string
          phone: string | null
          reference_labels: string[]
          review_note: string | null
          revision: number
          source_name: string | null
          source_references: Json
          tax_id: string | null
        }
        Insert: {
          address?: string | null
          aliases?: string[]
          contact_name?: string | null
          created_at?: string
          email?: string | null
          id?: string
          legal_name?: string | null
          name: string
          notes?: string | null
          org_id: string
          phone?: string | null
          reference_labels?: string[]
          review_note?: string | null
          revision?: number
          source_name?: string | null
          source_references?: Json
          tax_id?: string | null
        }
        Update: {
          address?: string | null
          aliases?: string[]
          contact_name?: string | null
          created_at?: string
          email?: string | null
          id?: string
          legal_name?: string | null
          name?: string
          notes?: string | null
          org_id?: string
          phone?: string | null
          reference_labels?: string[]
          review_note?: string | null
          revision?: number
          source_name?: string | null
          source_references?: Json
          tax_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stockai_suppliers_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "stockai_orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      stockai_units: {
        Row: {
          created_at: string
          id: string
          is_central: boolean
          legal_name: string | null
          name: string
          org_id: string
          tax_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          is_central?: boolean
          legal_name?: string | null
          name: string
          org_id: string
          tax_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          is_central?: boolean
          legal_name?: string | null
          name?: string
          org_id?: string
          tax_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stockai_units_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "stockai_orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      stockai_xml_inbox: {
        Row: {
          content_hash: string | null
          created_at: string
          filename: string
          id: string
          message: string
          org_id: string | null
          raw_xml: string
          receipt_id: string | null
          request_id: string
          status: string
          unit_id: string | null
          uploaded_by: string
        }
        Insert: {
          content_hash?: string | null
          created_at?: string
          filename: string
          id?: string
          message?: string
          org_id?: string | null
          raw_xml: string
          receipt_id?: string | null
          request_id: string
          status?: string
          unit_id?: string | null
          uploaded_by: string
        }
        Update: {
          content_hash?: string | null
          created_at?: string
          filename?: string
          id?: string
          message?: string
          org_id?: string | null
          raw_xml?: string
          receipt_id?: string | null
          request_id?: string
          status?: string
          unit_id?: string | null
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "stockai_xml_inbox_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "stockai_orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stockai_xml_inbox_org_id_unit_id_fkey"
            columns: ["org_id", "unit_id"]
            isOneToOne: false
            referencedRelation: "stockai_units"
            referencedColumns: ["org_id", "id"]
          },
          {
            foreignKeyName: "stockai_xml_inbox_receipt_id_fkey"
            columns: ["receipt_id"]
            isOneToOne: false
            referencedRelation: "stockai_receipts"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      stockai_approve_receipt: {
        Args: { p_receipt: string }
        Returns: undefined
      }
      stockai_auto_identify_xml: {
        Args: { p_id: string; p_unit: string }
        Returns: Json
      }
      stockai_bootstrap_organization: {
        Args: { p_org_name: string; p_unit_name: string }
        Returns: string
      }
      stockai_cancel_order: { Args: { p_order: string }; Returns: undefined }
      stockai_create_order: {
        Args: {
          p_destination: string
          p_kitchen: string
          p_lines: Json
          p_needed: string
          p_notes: string
          p_request: string
          p_source: string
        }
        Returns: string
      }
      stockai_create_receipt: {
        Args: {
          p_invoice: string
          p_lines: Json
          p_request: string
          p_supplier: string
          p_unit: string
        }
        Returns: string
      }
      stockai_dispatch_order: {
        Args: { p_lines: Json; p_order: string }
        Returns: undefined
      }
      stockai_edit_receipt: {
        Args: {
          p_expected: number
          p_header: Json
          p_lines: Json
          p_reason: string
          p_receipt: string
          p_request: string
        }
        Returns: undefined
      }
      stockai_get_blind_receipt: { Args: { p_receipt: string }; Returns: Json }
      stockai_get_receipt_conference: {
        Args: { p_receipt: string }
        Returns: Json
      }
      stockai_identify_xml: {
        Args: {
          p_id: string
          p_invoice: Json
          p_lines: Json
          p_remember?: boolean
          p_unit: string
        }
        Returns: string
      }
      stockai_import_nfe: {
        Args: {
          p_invoice: Json
          p_lines: Json
          p_request: string
          p_unit: string
          p_xml: string
        }
        Returns: string
      }
      stockai_order_units: { Args: never; Returns: Json }
      stockai_queue_xml: {
        Args: { p_filename: string; p_request: string; p_xml: string }
        Returns: string
      }
      stockai_receive_order: {
        Args: {
          p_name: string
          p_notes: string
          p_order: string
          p_signature: Json
        }
        Returns: undefined
      }
      stockai_register_company: {
        Args: {
          p_legal_name: string
          p_name: string
          p_new_org?: boolean
          p_org?: string
          p_tax_id: string
          p_unit?: string
        }
        Returns: string
      }
      stockai_save_category: {
        Args: { p_id?: string; p_name: string; p_org: string }
        Returns: string
      }
      stockai_save_payable: {
        Args: {
          p_data?: Json
          p_id?: string
          p_request?: string
          p_revision?: number
        }
        Returns: string
      }
      stockai_save_product: {
        Args: {
          p_category?: string
          p_cmv?: boolean
          p_id?: string
          p_name: string
          p_org: string
          p_uom: string
        }
        Returns: string
      }
      stockai_save_product_code: {
        Args: {
          p_category?: string
          p_cmv?: boolean
          p_code: string
          p_id?: string
          p_name: string
          p_org: string
          p_uom: string
        }
        Returns: string
      }
      stockai_save_supplier: {
        Args: {
          p_data: Json
          p_id?: string
          p_org: string
          p_revision?: number
        }
        Returns: string
      }
      stockai_stock_balances: {
        Args: never
        Returns: {
          item_id: string
          name: string
          quantity: number
          unit_id: string
          uom: string
          value_cents: number
        }[]
      }
      stockai_submit_receipt_count: {
        Args: { p_counts: Json; p_receipt: string }
        Returns: string
      }
      stockai_xml_pending: {
        Args: { p_id: string; p_message: string; p_unit?: string }
        Returns: undefined
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
