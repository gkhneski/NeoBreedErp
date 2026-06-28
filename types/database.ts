export type CompanyStatus = "active" | "suspended" | "archived";
export type CompanyUserRole =
  | "company_admin"
  | "production_manager"
  | "quality_manager"
  | "operator"
  | "viewer"
  | "company_user"
  | "regional_manager";
export type SalesOrderStatus =
  | "placed"
  | "confirmed"
  | "preparing"
  | "shipped"
  | "cancelled";
export type SalesOrderSource = "portal" | "rep" | "manual";
export type PurchaseOrderStatus = "draft" | "sent" | "received" | "cancelled";
export type CatalogAvailability = "out" | "low" | "in";
export type SiteContentStatus = "draft" | "published";
export type SiteFaqItem = { q: string; a: string };
export type AgentSessionStatus = "running" | "done" | "error";
export type AgentMessageKind = "briefing" | "agent" | "synthesis";
export type AgentActionKind =
  | "price"
  | "site_product"
  | "site_article"
  | "image"
  | "visibility"
  | "content";
export type AgentActionStatus = "proposed" | "applied" | "dismissed";
export type MaterialType = "raw" | "semi" | "finished";
export type RecipeStatus = "draft" | "published" | "archived";
export type RecipeMode = "quantity" | "percentage";
export type LotStatus = "quarantine" | "released" | "blocked";
export type LocationKind = "depot" | "shelf";
export type StockMovementKind = "receipt" | "issue" | "adjustment" | "transfer";
export type ProductionOrderStatus =
  | "draft"
  | "planned"
  | "in_progress"
  | "completed"
  | "closed"
  | "cancelled";
export type ProductionBatchStatus =
  | "in_progress"
  | "completed"
  | "closed"
  | "cancelled";
export type QualityCheckSubjectKind = "material_lot" | "production_batch";
export type QualityCheckStatus = "draft" | "passed" | "failed" | "cancelled";
export type QualityResultVerdict = "pending" | "pass" | "fail" | "na";
export type FileAttachmentSubjectKind = "material_lot" | "quality_check";
export type ShipmentChannel = "ecza" | "trendyol" | "hepsiburada" | "diger";
export type ShipmentStatus = "open" | "preparing" | "shipped" | "cancelled";
export type FileAttachmentKind =
  | "coa"
  | "msds"
  | "invoice"
  | "lab_report"
  | "other";
export type MarketplaceChannel = "trendyol" | "hepsiburada";
export type MarketplacePriceState = "normal" | "discounted" | "unknown";
export type MarketplaceSyncStatus = "never" | "pending" | "ok" | "failed";
export type MarketplacePriceEventKind = "discount" | "restore" | "manual";
export type MarketplacePriceEventStatus =
  | "pending"
  | "pushed"
  | "confirmed"
  | "failed"
  | "dismissed";

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
          units_per_pack: number;
          barcode: string | null;
          density: number | null;
          default_supplier_id: string | null;
          allergen_flags: Json;
          storage_conditions: string | null;
          regulatory_notes: string | null;
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
          units_per_pack?: number;
          barcode?: string | null;
          density?: number | null;
          default_supplier_id?: string | null;
          allergen_flags?: Json;
          storage_conditions?: string | null;
          regulatory_notes?: string | null;
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
          units_per_pack?: number;
          barcode?: string | null;
          density?: number | null;
          default_supplier_id?: string | null;
          allergen_flags?: Json;
          storage_conditions?: string | null;
          regulatory_notes?: string | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
          created_by?: string | null;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "materials_default_supplier_id_fkey";
            columns: ["default_supplier_id"];
            isOneToOne: false;
            referencedRelation: "suppliers";
            referencedColumns: ["id"];
          },
        ];
      };
      suppliers: {
        Row: {
          id: string;
          company_id: string;
          code: string;
          name: string;
          tax_number: string | null;
          email: string | null;
          phone: string | null;
          address: string | null;
          country: string | null;
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
          tax_number?: string | null;
          email?: string | null;
          phone?: string | null;
          address?: string | null;
          country?: string | null;
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
          tax_number?: string | null;
          email?: string | null;
          phone?: string | null;
          address?: string | null;
          country?: string | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
          created_by?: string | null;
          updated_by?: string | null;
        };
        Relationships: [];
      };
      customers: {
        Row: {
          id: string;
          company_id: string;
          code: string;
          name: string;
          tax_number: string | null;
          email: string | null;
          phone: string | null;
          address: string | null;
          country: string | null;
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
          tax_number?: string | null;
          email?: string | null;
          phone?: string | null;
          address?: string | null;
          country?: string | null;
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
          tax_number?: string | null;
          email?: string | null;
          phone?: string | null;
          address?: string | null;
          country?: string | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
          created_by?: string | null;
          updated_by?: string | null;
        };
        Relationships: [];
      };
      shipments: {
        Row: {
          id: string;
          company_id: string;
          code: string;
          channel: ShipmentChannel;
          customer_id: string | null;
          external_order_no: string | null;
          recipient: string | null;
          status: ShipmentStatus;
          carrier: string | null;
          tracking_no: string | null;
          notes: string | null;
          shipped_at: string | null;
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
          channel: ShipmentChannel;
          customer_id?: string | null;
          external_order_no?: string | null;
          recipient?: string | null;
          status?: ShipmentStatus;
          carrier?: string | null;
          tracking_no?: string | null;
          notes?: string | null;
          shipped_at?: string | null;
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
          channel?: ShipmentChannel;
          customer_id?: string | null;
          external_order_no?: string | null;
          recipient?: string | null;
          status?: ShipmentStatus;
          carrier?: string | null;
          tracking_no?: string | null;
          notes?: string | null;
          shipped_at?: string | null;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
          created_by?: string | null;
          updated_by?: string | null;
        };
        Relationships: [];
      };
      shipment_items: {
        Row: {
          id: string;
          company_id: string;
          shipment_id: string;
          lot_id: string;
          material_id: string;
          quantity: number;
          created_at: string;
          created_by: string | null;
        };
        Insert: {
          id?: string;
          company_id: string;
          shipment_id: string;
          lot_id: string;
          material_id: string;
          quantity: number;
          created_at?: string;
          created_by?: string | null;
        };
        Update: {
          id?: string;
          company_id?: string;
          shipment_id?: string;
          lot_id?: string;
          material_id?: string;
          quantity?: number;
          created_at?: string;
          created_by?: string | null;
        };
        Relationships: [];
      };
      locations: {
        Row: {
          id: string;
          company_id: string;
          code: string;
          name: string;
          kind: LocationKind;
          parent_id: string | null;
          is_default: boolean;
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
          kind?: LocationKind;
          parent_id?: string | null;
          is_default?: boolean;
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
          kind?: LocationKind;
          parent_id?: string | null;
          is_default?: boolean;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
          created_by?: string | null;
          updated_by?: string | null;
        };
        Relationships: [];
      };
      marketplace_connections: {
        Row: {
          id: string;
          company_id: string;
          channel: MarketplaceChannel;
          seller_id: string;
          api_key: string;
          api_secret: string;
          enabled: boolean;
          last_verified_at: string | null;
          created_at: string;
          updated_at: string;
          created_by: string | null;
          updated_by: string | null;
        };
        Insert: {
          id?: string;
          company_id: string;
          channel: MarketplaceChannel;
          seller_id: string;
          api_key: string;
          api_secret: string;
          enabled?: boolean;
          last_verified_at?: string | null;
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
          updated_by?: string | null;
        };
        Update: {
          id?: string;
          company_id?: string;
          channel?: MarketplaceChannel;
          seller_id?: string;
          api_key?: string;
          api_secret?: string;
          enabled?: boolean;
          last_verified_at?: string | null;
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
          updated_by?: string | null;
        };
        Relationships: [];
      };
      marketplace_listings: {
        Row: {
          id: string;
          company_id: string;
          channel: MarketplaceChannel;
          material_id: string;
          barcode: string;
          stock_code: string | null;
          title: string | null;
          normal_sale_price: number;
          normal_list_price: number | null;
          discount_price: number | null;
          discount_threshold_days: number | null;
          sync_stock: boolean;
          current_price_state: MarketplacePriceState;
          last_synced_at: string | null;
          last_batch_request_id: string | null;
          sync_status: MarketplaceSyncStatus;
          sync_error: string | null;
          applied_sale_price: number | null;
          content_batch_id: string | null;
          publish_status: "none" | "pending" | "approved" | "rejected";
          publish_error: string | null;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
          created_by: string | null;
          updated_by: string | null;
        };
        Insert: {
          id?: string;
          company_id: string;
          channel: MarketplaceChannel;
          material_id: string;
          barcode: string;
          stock_code?: string | null;
          title?: string | null;
          normal_sale_price: number;
          normal_list_price?: number | null;
          discount_price?: number | null;
          discount_threshold_days?: number | null;
          sync_stock?: boolean;
          current_price_state?: MarketplacePriceState;
          last_synced_at?: string | null;
          last_batch_request_id?: string | null;
          sync_status?: MarketplaceSyncStatus;
          sync_error?: string | null;
          applied_sale_price?: number | null;
          content_batch_id?: string | null;
          publish_status?: "none" | "pending" | "approved" | "rejected";
          publish_error?: string | null;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
          created_by?: string | null;
          updated_by?: string | null;
        };
        Update: {
          id?: string;
          company_id?: string;
          channel?: MarketplaceChannel;
          material_id?: string;
          barcode?: string;
          stock_code?: string | null;
          title?: string | null;
          normal_sale_price?: number;
          normal_list_price?: number | null;
          discount_price?: number | null;
          discount_threshold_days?: number | null;
          sync_stock?: boolean;
          current_price_state?: MarketplacePriceState;
          last_synced_at?: string | null;
          last_batch_request_id?: string | null;
          sync_status?: MarketplaceSyncStatus;
          sync_error?: string | null;
          applied_sale_price?: number | null;
          content_batch_id?: string | null;
          publish_status?: "none" | "pending" | "approved" | "rejected";
          publish_error?: string | null;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
          created_by?: string | null;
          updated_by?: string | null;
        };
        Relationships: [];
      };
      marketplace_discount_tiers: {
        Row: {
          id: string;
          company_id: string;
          max_days_left: number;
          discount_percent: number;
          created_at: string;
          updated_at: string;
          created_by: string | null;
          updated_by: string | null;
        };
        Insert: {
          id?: string;
          company_id: string;
          max_days_left: number;
          discount_percent: number;
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
          updated_by?: string | null;
        };
        Update: {
          id?: string;
          company_id?: string;
          max_days_left?: number;
          discount_percent?: number;
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
          updated_by?: string | null;
        };
        Relationships: [];
      };
      marketplace_remote_products: {
        Row: {
          id: string;
          company_id: string;
          channel: MarketplaceChannel;
          barcode: string;
          title: string | null;
          image_url: string | null;
          stock_code: string | null;
          sale_price: number | null;
          list_price: number | null;
          quantity: number | null;
          approved: boolean | null;
          on_sale: boolean | null;
          fetched_at: string;
        };
        Insert: {
          id?: string;
          company_id: string;
          channel: MarketplaceChannel;
          barcode: string;
          title?: string | null;
          image_url?: string | null;
          stock_code?: string | null;
          sale_price?: number | null;
          list_price?: number | null;
          quantity?: number | null;
          approved?: boolean | null;
          on_sale?: boolean | null;
          fetched_at?: string;
        };
        Update: {
          id?: string;
          company_id?: string;
          channel?: MarketplaceChannel;
          barcode?: string;
          title?: string | null;
          image_url?: string | null;
          stock_code?: string | null;
          sale_price?: number | null;
          list_price?: number | null;
          quantity?: number | null;
          approved?: boolean | null;
          on_sale?: boolean | null;
          fetched_at?: string;
        };
        Relationships: [];
      };
      marketplace_orders: {
        Row: {
          id: string;
          company_id: string;
          channel: MarketplaceChannel;
          order_number: string;
          status: string | null;
          customer_name: string | null;
          order_date: string | null;
          total_price: number | null;
          lines: Json | null;
          seen_at: string | null;
          created_at: string;
          fetched_at: string;
        };
        Insert: {
          id?: string;
          company_id: string;
          channel: MarketplaceChannel;
          order_number: string;
          status?: string | null;
          customer_name?: string | null;
          order_date?: string | null;
          total_price?: number | null;
          lines?: Json | null;
          seen_at?: string | null;
          created_at?: string;
          fetched_at?: string;
        };
        Update: {
          id?: string;
          company_id?: string;
          channel?: MarketplaceChannel;
          order_number?: string;
          status?: string | null;
          customer_name?: string | null;
          order_date?: string | null;
          total_price?: number | null;
          lines?: Json | null;
          seen_at?: string | null;
          created_at?: string;
          fetched_at?: string;
        };
        Relationships: [];
      };
      marketplace_price_events: {
        Row: {
          id: string;
          company_id: string;
          listing_id: string;
          kind: MarketplacePriceEventKind;
          old_price: number | null;
          new_price: number;
          status: MarketplacePriceEventStatus;
          batch_request_id: string | null;
          error: string | null;
          trigger_expiry_date: string | null;
          trigger_days_left: number | null;
          created_at: string;
          created_by: string | null;
          acted_at: string | null;
          acted_by: string | null;
        };
        Insert: {
          id?: string;
          company_id: string;
          listing_id: string;
          kind: MarketplacePriceEventKind;
          old_price?: number | null;
          new_price: number;
          status?: MarketplacePriceEventStatus;
          batch_request_id?: string | null;
          error?: string | null;
          trigger_expiry_date?: string | null;
          trigger_days_left?: number | null;
          created_at?: string;
          created_by?: string | null;
          acted_at?: string | null;
          acted_by?: string | null;
        };
        Update: {
          id?: string;
          company_id?: string;
          listing_id?: string;
          kind?: MarketplacePriceEventKind;
          old_price?: number | null;
          new_price?: number;
          status?: MarketplacePriceEventStatus;
          batch_request_id?: string | null;
          error?: string | null;
          trigger_expiry_date?: string | null;
          trigger_days_left?: number | null;
          created_at?: string;
          created_by?: string | null;
          acted_at?: string | null;
          acted_by?: string | null;
        };
        Relationships: [];
      };
      company_settings: {
        Row: {
          company_id: string;
          expiry_critical_days: number;
          expiry_warning_days: number;
          created_at: string;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          company_id: string;
          expiry_critical_days?: number;
          expiry_warning_days?: number;
          created_at?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          company_id?: string;
          expiry_critical_days?: number;
          expiry_warning_days?: number;
          created_at?: string;
          updated_at?: string;
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
      material_lots: {
        Row: {
          id: string;
          company_id: string;
          material_id: string;
          supplier_id: string | null;
          owner_customer_id: string | null;
          location_id: string | null;
          lot_number: string;
          received_at: string;
          expiry_date: string | null;
          unit_cost: number | null;
          currency: string | null;
          quantity_on_hand: number;
          status: LotStatus;
          coa_file_path: string | null;
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
          material_id: string;
          supplier_id?: string | null;
          owner_customer_id?: string | null;
          location_id?: string | null;
          lot_number: string;
          received_at?: string;
          expiry_date?: string | null;
          unit_cost?: number | null;
          currency?: string | null;
          quantity_on_hand?: number;
          status?: LotStatus;
          coa_file_path?: string | null;
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
          material_id?: string;
          supplier_id?: string | null;
          owner_customer_id?: string | null;
          location_id?: string | null;
          lot_number?: string;
          received_at?: string;
          expiry_date?: string | null;
          unit_cost?: number | null;
          currency?: string | null;
          quantity_on_hand?: number;
          status?: LotStatus;
          coa_file_path?: string | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
          created_by?: string | null;
          updated_by?: string | null;
        };
        Relationships: [];
      };
      stock_movements: {
        Row: {
          id: string;
          company_id: string;
          material_id: string;
          lot_id: string;
          batch_id: string | null;
          kind: StockMovementKind;
          quantity: number;
          unit_cost: number | null;
          reason: string | null;
          from_location_id: string | null;
          to_location_id: string | null;
          occurred_at: string;
          notes: string | null;
          created_at: string;
          created_by: string | null;
        };
        Insert: {
          id?: string;
          company_id: string;
          material_id: string;
          lot_id: string;
          batch_id?: string | null;
          kind: StockMovementKind;
          quantity: number;
          unit_cost?: number | null;
          reason?: string | null;
          from_location_id?: string | null;
          to_location_id?: string | null;
          occurred_at?: string;
          notes?: string | null;
          created_at?: string;
          created_by?: string | null;
        };
        Update: never;
        Relationships: [];
      };
      production_orders: {
        Row: {
          id: string;
          company_id: string;
          code: string;
          finished_material_id: string;
          recipe_id: string;
          customer_id: string | null;
          planned_quantity: number;
          planned_uom: string;
          status: ProductionOrderStatus;
          planned_start_at: string | null;
          planned_end_at: string | null;
          started_at: string | null;
          completed_at: string | null;
          closed_at: string | null;
          cancelled_at: string | null;
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
          finished_material_id: string;
          recipe_id: string;
          customer_id?: string | null;
          planned_quantity: number;
          planned_uom: string;
          status?: ProductionOrderStatus;
          planned_start_at?: string | null;
          planned_end_at?: string | null;
          started_at?: string | null;
          completed_at?: string | null;
          closed_at?: string | null;
          cancelled_at?: string | null;
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
          finished_material_id?: string;
          recipe_id?: string;
          customer_id?: string | null;
          planned_quantity?: number;
          planned_uom?: string;
          status?: ProductionOrderStatus;
          planned_start_at?: string | null;
          planned_end_at?: string | null;
          started_at?: string | null;
          completed_at?: string | null;
          closed_at?: string | null;
          cancelled_at?: string | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
          created_by?: string | null;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "production_orders_finished_material_id_fkey";
            columns: ["finished_material_id"];
            isOneToOne: false;
            referencedRelation: "materials";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "production_orders_recipe_id_fkey";
            columns: ["recipe_id"];
            isOneToOne: false;
            referencedRelation: "recipes";
            referencedColumns: ["id"];
          },
        ];
      };
      production_batches: {
        Row: {
          id: string;
          company_id: string;
          production_order_id: string;
          batch_number: string;
          recipe_id: string;
          output_lot_id: string | null;
          planned_quantity: number;
          actual_quantity: number | null;
          uom: string;
          status: ProductionBatchStatus;
          started_at: string | null;
          completed_at: string | null;
          closed_at: string | null;
          cancelled_at: string | null;
          cost_total: number | null;
          cost_currency: string | null;
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
          production_order_id: string;
          batch_number: string;
          recipe_id: string;
          output_lot_id?: string | null;
          planned_quantity: number;
          actual_quantity?: number | null;
          uom: string;
          status?: ProductionBatchStatus;
          started_at?: string | null;
          completed_at?: string | null;
          closed_at?: string | null;
          cancelled_at?: string | null;
          cost_total?: number | null;
          cost_currency?: string | null;
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
          production_order_id?: string;
          batch_number?: string;
          recipe_id?: string;
          output_lot_id?: string | null;
          planned_quantity?: number;
          actual_quantity?: number | null;
          uom?: string;
          status?: ProductionBatchStatus;
          started_at?: string | null;
          completed_at?: string | null;
          closed_at?: string | null;
          cancelled_at?: string | null;
          cost_total?: number | null;
          cost_currency?: string | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
          created_by?: string | null;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "production_batches_production_order_id_fkey";
            columns: ["production_order_id"];
            isOneToOne: false;
            referencedRelation: "production_orders";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "production_batches_recipe_id_fkey";
            columns: ["recipe_id"];
            isOneToOne: false;
            referencedRelation: "recipes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "production_batches_output_lot_id_fkey";
            columns: ["output_lot_id"];
            isOneToOne: false;
            referencedRelation: "material_lots";
            referencedColumns: ["id"];
          },
        ];
      };
      quality_checks: {
        Row: {
          id: string;
          company_id: string;
          code: string;
          subject_kind: QualityCheckSubjectKind;
          material_lot_id: string | null;
          production_batch_id: string | null;
          status: QualityCheckStatus;
          signed_by: string | null;
          signed_at: string | null;
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
          subject_kind: QualityCheckSubjectKind;
          material_lot_id?: string | null;
          production_batch_id?: string | null;
          status?: QualityCheckStatus;
          signed_by?: string | null;
          signed_at?: string | null;
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
          subject_kind?: QualityCheckSubjectKind;
          material_lot_id?: string | null;
          production_batch_id?: string | null;
          status?: QualityCheckStatus;
          signed_by?: string | null;
          signed_at?: string | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
          created_by?: string | null;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "quality_checks_material_lot_id_fkey";
            columns: ["material_lot_id"];
            isOneToOne: false;
            referencedRelation: "material_lots";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "quality_checks_production_batch_id_fkey";
            columns: ["production_batch_id"];
            isOneToOne: false;
            referencedRelation: "production_batches";
            referencedColumns: ["id"];
          },
        ];
      };
      quality_check_results: {
        Row: {
          id: string;
          company_id: string;
          quality_check_id: string;
          position: number;
          spec_name: string;
          spec_target: string | null;
          measured_value: string | null;
          verdict: QualityResultVerdict;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          company_id: string;
          quality_check_id: string;
          position: number;
          spec_name: string;
          spec_target?: string | null;
          measured_value?: string | null;
          verdict?: QualityResultVerdict;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          company_id?: string;
          quality_check_id?: string;
          position?: number;
          spec_name?: string;
          spec_target?: string | null;
          measured_value?: string | null;
          verdict?: QualityResultVerdict;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "quality_check_results_quality_check_id_fkey";
            columns: ["quality_check_id"];
            isOneToOne: false;
            referencedRelation: "quality_checks";
            referencedColumns: ["id"];
          },
        ];
      };
      cost_snapshots: {
        Row: {
          id: string;
          company_id: string;
          production_batch_id: string;
          material_id: string;
          lot_id: string;
          quantity: number;
          unit_cost: number | null;
          currency: string | null;
          line_cost: number | null;
          customer_owned: boolean;
          created_at: string;
          created_by: string | null;
        };
        Insert: {
          id?: string;
          company_id: string;
          production_batch_id: string;
          material_id: string;
          lot_id: string;
          quantity: number;
          unit_cost?: number | null;
          currency?: string | null;
          line_cost?: number | null;
          customer_owned?: boolean;
          created_at?: string;
          created_by?: string | null;
        };
        Update: never;
        Relationships: [
          {
            foreignKeyName: "cost_snapshots_production_batch_id_fkey";
            columns: ["production_batch_id"];
            isOneToOne: false;
            referencedRelation: "production_batches";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "cost_snapshots_material_id_fkey";
            columns: ["material_id"];
            isOneToOne: false;
            referencedRelation: "materials";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "cost_snapshots_lot_id_fkey";
            columns: ["lot_id"];
            isOneToOne: false;
            referencedRelation: "material_lots";
            referencedColumns: ["id"];
          },
        ];
      };
      file_attachments: {
        Row: {
          id: string;
          company_id: string;
          subject_kind: FileAttachmentSubjectKind;
          material_lot_id: string | null;
          quality_check_id: string | null;
          kind: FileAttachmentKind;
          storage_path: string;
          file_name: string;
          mime_type: string;
          size_bytes: number;
          notes: string | null;
          created_at: string;
          created_by: string | null;
        };
        Insert: {
          id?: string;
          company_id: string;
          subject_kind: FileAttachmentSubjectKind;
          material_lot_id?: string | null;
          quality_check_id?: string | null;
          kind: FileAttachmentKind;
          storage_path: string;
          file_name: string;
          mime_type: string;
          size_bytes: number;
          notes?: string | null;
          created_at?: string;
          created_by?: string | null;
        };
        Update: {
          id?: string;
          company_id?: string;
          subject_kind?: FileAttachmentSubjectKind;
          material_lot_id?: string | null;
          quality_check_id?: string | null;
          kind?: FileAttachmentKind;
          storage_path?: string;
          file_name?: string;
          mime_type?: string;
          size_bytes?: number;
          notes?: string | null;
          created_at?: string;
          created_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "file_attachments_material_lot_id_fkey";
            columns: ["material_lot_id"];
            isOneToOne: false;
            referencedRelation: "material_lots";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "file_attachments_quality_check_id_fkey";
            columns: ["quality_check_id"];
            isOneToOne: false;
            referencedRelation: "quality_checks";
            referencedColumns: ["id"];
          },
        ];
      };
      customer_users: {
        Row: {
          user_id: string;
          company_id: string;
          customer_id: string;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
        };
        Insert: {
          user_id: string;
          company_id: string;
          customer_id: string;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Update: {
          user_id?: string;
          company_id?: string;
          customer_id?: string;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Relationships: [];
      };
      product_catalog: {
        Row: {
          id: string;
          company_id: string;
          material_id: string;
          sale_price: number | null;
          is_listed: boolean;
          low_stock_threshold: number;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
          created_by: string | null;
          updated_by: string | null;
        };
        Insert: {
          id?: string;
          company_id: string;
          material_id: string;
          sale_price?: number | null;
          is_listed?: boolean;
          low_stock_threshold?: number;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
          created_by?: string | null;
          updated_by?: string | null;
        };
        Update: {
          id?: string;
          company_id?: string;
          material_id?: string;
          sale_price?: number | null;
          is_listed?: boolean;
          low_stock_threshold?: number;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
          created_by?: string | null;
          updated_by?: string | null;
        };
        Relationships: [];
      };
      sales_orders: {
        Row: {
          id: string;
          company_id: string;
          customer_id: string;
          code: string;
          status: SalesOrderStatus;
          source: SalesOrderSource;
          placed_by: string | null;
          seen_at: string | null;
          shipment_id: string | null;
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
          customer_id: string;
          code: string;
          status?: SalesOrderStatus;
          source: SalesOrderSource;
          placed_by?: string | null;
          seen_at?: string | null;
          shipment_id?: string | null;
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
          customer_id?: string;
          code?: string;
          status?: SalesOrderStatus;
          source?: SalesOrderSource;
          placed_by?: string | null;
          seen_at?: string | null;
          shipment_id?: string | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
          created_by?: string | null;
          updated_by?: string | null;
        };
        Relationships: [];
      };
      sales_order_items: {
        Row: {
          id: string;
          company_id: string;
          order_id: string;
          material_id: string;
          quantity: number;
          unit_price: number | null;
          created_at: string;
          created_by: string | null;
        };
        Insert: {
          id?: string;
          company_id: string;
          order_id: string;
          material_id: string;
          quantity: number;
          unit_price?: number | null;
          created_at?: string;
          created_by?: string | null;
        };
        Update: {
          id?: string;
          company_id?: string;
          order_id?: string;
          material_id?: string;
          quantity?: number;
          unit_price?: number | null;
          created_at?: string;
          created_by?: string | null;
        };
        Relationships: [];
      };
      site_product_pages: {
        Row: {
          id: string;
          company_id: string;
          material_id: string;
          slug: string;
          seo_title: string;
          seo_description: string;
          bullets: string[];
          keywords: string[];
          og_image_url: string | null;
          price_snapshot: number | null;
          barcode_snapshot: string | null;
          status: SiteContentStatus;
          published_at: string | null;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
          created_by: string | null;
          updated_by: string | null;
        };
        Insert: {
          id?: string;
          company_id: string;
          material_id: string;
          slug: string;
          seo_title: string;
          seo_description: string;
          bullets?: string[];
          keywords?: string[];
          og_image_url?: string | null;
          price_snapshot?: number | null;
          barcode_snapshot?: string | null;
          status?: SiteContentStatus;
          published_at?: string | null;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
          created_by?: string | null;
          updated_by?: string | null;
        };
        Update: {
          id?: string;
          company_id?: string;
          material_id?: string;
          slug?: string;
          seo_title?: string;
          seo_description?: string;
          bullets?: string[];
          keywords?: string[];
          og_image_url?: string | null;
          price_snapshot?: number | null;
          barcode_snapshot?: string | null;
          status?: SiteContentStatus;
          published_at?: string | null;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
          created_by?: string | null;
          updated_by?: string | null;
        };
        Relationships: [];
      };
      site_articles: {
        Row: {
          id: string;
          company_id: string;
          slug: string;
          title: string;
          excerpt: string | null;
          body_md: string;
          keywords: string[];
          faq: SiteFaqItem[];
          cover_image_url: string | null;
          related_material_ids: string[];
          status: SiteContentStatus;
          published_at: string | null;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
          created_by: string | null;
          updated_by: string | null;
        };
        Insert: {
          id?: string;
          company_id: string;
          slug: string;
          title: string;
          excerpt?: string | null;
          body_md?: string;
          keywords?: string[];
          faq?: SiteFaqItem[];
          cover_image_url?: string | null;
          related_material_ids?: string[];
          status?: SiteContentStatus;
          published_at?: string | null;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
          created_by?: string | null;
          updated_by?: string | null;
        };
        Update: {
          id?: string;
          company_id?: string;
          slug?: string;
          title?: string;
          excerpt?: string | null;
          body_md?: string;
          keywords?: string[];
          faq?: SiteFaqItem[];
          cover_image_url?: string | null;
          related_material_ids?: string[];
          status?: SiteContentStatus;
          published_at?: string | null;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
          created_by?: string | null;
          updated_by?: string | null;
        };
        Relationships: [];
      };
      agent_sessions: {
        Row: {
          id: string;
          company_id: string;
          status: AgentSessionStatus;
          focus: string | null;
          error: string | null;
          created_at: string;
          finished_at: string | null;
          created_by: string | null;
        };
        Insert: {
          id?: string;
          company_id: string;
          status?: AgentSessionStatus;
          focus?: string | null;
          error?: string | null;
          created_at?: string;
          finished_at?: string | null;
          created_by?: string | null;
        };
        Update: {
          id?: string;
          company_id?: string;
          status?: AgentSessionStatus;
          focus?: string | null;
          error?: string | null;
          created_at?: string;
          finished_at?: string | null;
          created_by?: string | null;
        };
        Relationships: [];
      };
      agent_messages: {
        Row: {
          id: string;
          company_id: string;
          session_id: string;
          seq: number;
          agent: string;
          model: string | null;
          kind: AgentMessageKind;
          content: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          company_id: string;
          session_id: string;
          seq: number;
          agent: string;
          model?: string | null;
          kind?: AgentMessageKind;
          content: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          company_id?: string;
          session_id?: string;
          seq?: number;
          agent?: string;
          model?: string | null;
          kind?: AgentMessageKind;
          content?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      agent_actions: {
        Row: {
          id: string;
          company_id: string;
          session_id: string;
          kind: AgentActionKind;
          ref: string | null;
          title: string;
          payload: Record<string, unknown>;
          status: AgentActionStatus;
          result: string | null;
          created_at: string;
          applied_at: string | null;
          applied_by: string | null;
        };
        Insert: {
          id?: string;
          company_id: string;
          session_id: string;
          kind: AgentActionKind;
          ref?: string | null;
          title: string;
          payload?: Record<string, unknown>;
          status?: AgentActionStatus;
          result?: string | null;
          created_at?: string;
          applied_at?: string | null;
          applied_by?: string | null;
        };
        Update: {
          id?: string;
          company_id?: string;
          session_id?: string;
          kind?: AgentActionKind;
          ref?: string | null;
          title?: string;
          payload?: Record<string, unknown>;
          status?: AgentActionStatus;
          result?: string | null;
          created_at?: string;
          applied_at?: string | null;
          applied_by?: string | null;
        };
        Relationships: [];
      };
      purchase_orders: {
        Row: {
          id: string;
          company_id: string;
          code: string;
          supplier_id: string | null;
          status: PurchaseOrderStatus;
          currency: string | null;
          notes: string | null;
          sent_at: string | null;
          received_at: string | null;
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
          supplier_id?: string | null;
          status?: PurchaseOrderStatus;
          currency?: string | null;
          notes?: string | null;
          sent_at?: string | null;
          received_at?: string | null;
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
          supplier_id?: string | null;
          status?: PurchaseOrderStatus;
          currency?: string | null;
          notes?: string | null;
          sent_at?: string | null;
          received_at?: string | null;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
          created_by?: string | null;
          updated_by?: string | null;
        };
        Relationships: [];
      };
      purchase_order_lines: {
        Row: {
          id: string;
          company_id: string;
          purchase_order_id: string;
          material_id: string;
          quantity: number;
          uom: string;
          unit_cost: number | null;
          received_quantity: number;
          created_at: string;
          created_by: string | null;
        };
        Insert: {
          id?: string;
          company_id: string;
          purchase_order_id: string;
          material_id: string;
          quantity: number;
          uom: string;
          unit_cost?: number | null;
          received_quantity?: number;
          created_at?: string;
          created_by?: string | null;
        };
        Update: {
          id?: string;
          company_id?: string;
          purchase_order_id?: string;
          material_id?: string;
          quantity?: number;
          uom?: string;
          unit_cost?: number | null;
          received_quantity?: number;
          created_at?: string;
          created_by?: string | null;
        };
        Relationships: [];
      };
    };
    Views: {
      buyer_catalog: {
        Row: {
          company_id: string;
          material_id: string;
          code: string;
          name: string;
          barcode: string | null;
          base_uom: string;
          sale_price: number | null;
          image_url: string | null;
          availability: CatalogAvailability;
        };
        Relationships: [];
      };
    };
    Functions: {
      create_lot_with_receipt: {
        Args: {
          p_company_id: string;
          p_material_id: string;
          p_supplier_id: string | null;
          p_lot_number: string;
          p_received_at: string | null;
          p_expiry_date: string | null;
          p_unit_cost: number | null;
          p_currency: string | null;
          p_quantity: number;
          p_notes: string | null;
          p_movement_notes: string | null;
          p_owner_customer_id?: string | null;
          p_status?: "quarantine" | "released";
          p_location_id?: string | null;
        };
        Returns: string;
      };
      create_receipt_document: {
        Args: {
          p_company_id: string;
          p_supplier_id: string | null;
          p_received_at: string | null;
          p_currency: string | null;
          p_doc_notes: string | null;
          p_lines: Json;
        };
        Returns: number;
      };
      ship_shipment: {
        Args: { p_company_id: string; p_shipment_id: string };
        Returns: undefined;
      };
      ensure_default_location: {
        Args: { p_company_id: string };
        Returns: string;
      };
      transfer_lot: {
        Args: {
          p_company_id: string;
          p_lot_id: string;
          p_to_location_id: string;
          p_notes?: string | null;
        };
        Returns: undefined;
      };
      start_production_order: {
        Args: {
          p_company_id: string;
          p_order_id: string;
          p_batch_number: string;
        };
        Returns: string;
      };
      complete_production_batch: {
        Args: {
          p_company_id: string;
          p_batch_id: string;
          p_actual_quantity: number;
          p_output_lot_number: string;
          p_output_expiry_date: string | null;
          p_consumed: Json;
          p_location_id?: string | null;
        };
        Returns: string;
      };
      sign_quality_check: {
        Args: {
          p_company_id: string;
          p_check_id: string;
          p_overall_verdict: "passed" | "failed";
        };
        Returns: string;
      };
      cancel_quality_check: {
        Args: {
          p_company_id: string;
          p_check_id: string;
        };
        Returns: undefined;
      };
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
export type Supplier = Database["public"]["Tables"]["suppliers"]["Row"];
export type MaterialLot = Database["public"]["Tables"]["material_lots"]["Row"];
export type StockMovement =
  Database["public"]["Tables"]["stock_movements"]["Row"];
export type ProductionOrder =
  Database["public"]["Tables"]["production_orders"]["Row"];
export type ProductionBatch =
  Database["public"]["Tables"]["production_batches"]["Row"];
export type QualityCheck =
  Database["public"]["Tables"]["quality_checks"]["Row"];
export type QualityCheckResult =
  Database["public"]["Tables"]["quality_check_results"]["Row"];
export type CostSnapshot =
  Database["public"]["Tables"]["cost_snapshots"]["Row"];
export type FileAttachment =
  Database["public"]["Tables"]["file_attachments"]["Row"];
