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
            foreignKeyName: "stockai_audit_events_org_id_unit_id_receipt_id_fkey"
            columns: ["org_id", "unit_id", "receipt_id"]
            isOneToOne: false
            referencedRelation: "stockai_receipts"
            referencedColumns: ["org_id", "unit_id", "id"]
          },
        ]
      }
      stockai_items: {
        Row: {
          base_uom: string
          created_at: string
          id: string
          is_active: boolean
          name: string
          org_id: string
        }
        Insert: {
          base_uom: string
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          org_id: string
        }
        Update: {
          base_uom?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          org_id?: string
        }
        Relationships: [
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
      stockai_receipt_lines: {
        Row: {
          counted_qty: number | null
          credit_cents: number | null
          id: string
          invoiced_qty: number
          item_id: string
          org_id: string
          payable_cents: number | null
          receipt_id: string
          unit_id: string
          unit_price_cents: number
        }
        Insert: {
          counted_qty?: number | null
          credit_cents?: number | null
          id?: string
          invoiced_qty: number
          item_id: string
          org_id: string
          payable_cents?: number | null
          receipt_id: string
          unit_id: string
          unit_price_cents: number
        }
        Update: {
          counted_qty?: number | null
          credit_cents?: number | null
          id?: string
          invoiced_qty?: number
          item_id?: string
          org_id?: string
          payable_cents?: number | null
          receipt_id?: string
          unit_id?: string
          unit_price_cents?: number
        }
        Relationships: [
          {
            foreignKeyName: "stockai_receipt_lines_org_id_item_id_fkey"
            columns: ["org_id", "item_id"]
            isOneToOne: false
            referencedRelation: "stockai_items"
            referencedColumns: ["org_id", "id"]
          },
          {
            foreignKeyName: "stockai_receipt_lines_org_id_unit_id_receipt_id_fkey"
            columns: ["org_id", "unit_id", "receipt_id"]
            isOneToOne: false
            referencedRelation: "stockai_receipts"
            referencedColumns: ["org_id", "unit_id", "id"]
          },
        ]
      }
      stockai_receipts: {
        Row: {
          approved_by: string | null
          closed_at: string | null
          counted_by: string | null
          created_at: string
          created_by: string
          id: string
          invoice_number: string
          org_id: string
          request_id: string
          status: string
          supplier_id: string
          unit_id: string
        }
        Insert: {
          approved_by?: string | null
          closed_at?: string | null
          counted_by?: string | null
          created_at?: string
          created_by: string
          id?: string
          invoice_number: string
          org_id: string
          request_id: string
          status?: string
          supplier_id: string
          unit_id: string
        }
        Update: {
          approved_by?: string | null
          closed_at?: string | null
          counted_by?: string | null
          created_at?: string
          created_by?: string
          id?: string
          invoice_number?: string
          org_id?: string
          request_id?: string
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
          name: string
          org_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_central?: boolean
          name: string
          org_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_central?: boolean
          name?: string
          org_id?: string
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      stockai_approve_receipt: {
        Args: { p_receipt: string }
        Returns: undefined
      }
      stockai_bootstrap_organization: {
        Args: { p_org_name: string; p_unit_name: string }
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
      stockai_get_blind_receipt: { Args: { p_receipt: string }; Returns: Json }
      stockai_submit_receipt_count: {
        Args: { p_counts: Json; p_receipt: string }
        Returns: string
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
