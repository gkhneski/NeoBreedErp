export type CompanyStatus = "active" | "suspended" | "archived";
export type CompanyUserRole = "company_admin" | "company_user";
export type MaterialType = "raw" | "finished";
export type RecipeStatus = "draft" | "published" | "archived";
export type RecipeMode = "quantity" | "percentage";

type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          full_name: string | null;
          email: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          full_name?: string | null;
          email?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          full_name?: string | null;
          email?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      platform_admins: {
        Row: {
          user_id: string;
          created_at: string;
        };
        Insert: { user_id: string; created_at?: string };
        Update: { user_id?: string; created_at?: string };
        Relationships: [];
      };
      companies: {
        Row: {
          id: string;
          name: string;
          tax_number: string | null;
          contact_name: string | null;
          contact_email: string | null;
          contact_phone: string | null;
          address: string | null;
          package_id: string | null;
          status: CompanyStatus;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
          created_by: string | null;
          updated_by: string | null;
        };
        Insert: {
          id?: string;
          name: string;
          tax_number?: string | null;
          contact_name?: string | null;
          contact_email?: string | null;
          contact_phone?: string | null;
          address?: string | null;
          package_id?: string | null;
          status?: CompanyStatus;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
          created_by?: string | null;
          updated_by?: string | null;
        };
        Update: {
          id?: string;
          name?: string;
          tax_number?: string | null;
          contact_name?: string | null;
          contact_email?: string | null;
          contact_phone?: string | null;
          address?: string | null;
          package_id?: string | null;
          status?: CompanyStatus;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
          created_by?: string | null;
          updated_by?: string | null;
        };
        Relationships: [];
      };
      company_users: {
        Row: {
          user_id: string;
          company_id: string;
          role: CompanyUserRole;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
        };
        Insert: {
          user_id: string;
          company_id: string;
          role: CompanyUserRole;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Update: {
          user_id?: string;
          company_id?: string;
          role?: CompanyUserRole;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Relationships: [];
      };
      packages: {
        Row: {
          id: string;
          name: string;
          description: string | null;
          user_limit: number;
          feature_flags: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          description?: string | null;
          user_limit?: number;
          feature_flags?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          description?: string | null;
          user_limit?: number;
          feature_flags?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      platform_audit_log: {
        Row: {
          id: string;
          actor_id: string | null;
          action: string;
          target_table: string | null;
          target_id: string | null;
          diff: Json | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          actor_id?: string | null;
          action: string;
          target_table?: string | null;
          target_id?: string | null;
          diff?: Json | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          actor_id?: string | null;
          action?: string;
          target_table?: string | null;
          target_id?: string | null;
          diff?: Json | null;
          created_at?: string;
        };
        Relationships: [];
      };
      materials: {
        Row: {
          id: string;
          company_id: string;
          code: string;
          name: string;
          type: MaterialType;
          base_uom: string;
          density: number | null;
          notes: string | null;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
          created_by: string | null;
          updated_by: string | null;
        };
        Insert: {
          id?: string;
          company_id: string;
          code: string;
          name: string;
          type: MaterialType;
          base_uom: string;
          density?: number | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
          created_by?: string | null;
          updated_by?: string | null;
        };
        Update: {
          id?: string;
          company_id?: string;
          code?: string;
          name?: string;
          type?: MaterialType;
          base_uom?: string;
          density?: number | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
          created_by?: string | null;
          updated_by?: string | null;
        };
        Relationships: [];
      };
      recipes: {
        Row: {
          id: string;
          company_id: string;
          finished_material_id: string;
          code: string;
          name: string;
          version: number;
          status: RecipeStatus;
          mode: RecipeMode;
          yield_quantity: number;
          yield_uom: string;
          notes: string | null;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
          created_by: string | null;
          updated_by: string | null;
        };
        Insert: {
          id?: string;
          company_id: string;
          finished_material_id: string;
          code: string;
          name: string;
          version?: number;
          status?: RecipeStatus;
          mode: RecipeMode;
          yield_quantity: number;
          yield_uom: string;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
          created_by?: string | null;
          updated_by?: string | null;
        };
        Update: {
          id?: string;
          company_id?: string;
          finished_material_id?: string;
          code?: string;
          name?: string;
          version?: number;
          status?: RecipeStatus;
          mode?: RecipeMode;
          yield_quantity?: number;
          yield_uom?: string;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
          created_by?: string | null;
          updated_by?: string | null;
        };
        Relationships: [];
      };
      recipe_items: {
        Row: {
          id: string;
          company_id: string;
          recipe_id: string;
          material_id: string;
          position: number;
          quantity: number;
          uom: string;
          percentage: number | null;
          active: boolean;
          notes: string | null;
          created_at: string;
          updated_at: string;
          created_by: string | null;
          updated_by: string | null;
        };
        Insert: {
          id?: string;
          company_id: string;
          recipe_id: string;
          material_id: string;
          position: number;
          quantity: number;
          uom: string;
          percentage?: number | null;
          active?: boolean;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
          updated_by?: string | null;
        };
        Update: {
          id?: string;
          company_id?: string;
          recipe_id?: string;
          material_id?: string;
          position?: number;
          quantity?: number;
          uom?: string;
          percentage?: number | null;
          active?: boolean;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
          updated_by?: string | null;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

export type Profile = Database["public"]["Tables"]["profiles"]["Row"];
export type Company = Database["public"]["Tables"]["companies"]["Row"];
export type CompanyUser = Database["public"]["Tables"]["company_users"]["Row"];
export type Package = Database["public"]["Tables"]["packages"]["Row"];
export type PlatformAdmin =
  Database["public"]["Tables"]["platform_admins"]["Row"];
export type PlatformAuditLog =
  Database["public"]["Tables"]["platform_audit_log"]["Row"];
export type Material = Database["public"]["Tables"]["materials"]["Row"];
export type Recipe = Database["public"]["Tables"]["recipes"]["Row"];
export type RecipeItem = Database["public"]["Tables"]["recipe_items"]["Row"];
