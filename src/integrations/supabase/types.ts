export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      agent_logs: {
        Row: {
          action: string
          agent: Database["public"]["Enums"]["agent_name"]
          created_at: string
          id: string
          payload: Json | null
          status: string
          user_id: string
        }
        Insert: {
          action: string
          agent: Database["public"]["Enums"]["agent_name"]
          created_at?: string
          id?: string
          payload?: Json | null
          status?: string
          user_id: string
        }
        Update: {
          action?: string
          agent?: Database["public"]["Enums"]["agent_name"]
          created_at?: string
          id?: string
          payload?: Json | null
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      business_data: {
        Row: {
          created_at: string
          file_name: string
          id: string
          parsed_json: Json | null
          raw_csv: string | null
          summary: Json | null
          type: Database["public"]["Enums"]["business_data_type"]
          user_id: string
        }
        Insert: {
          created_at?: string
          file_name: string
          id?: string
          parsed_json?: Json | null
          raw_csv?: string | null
          summary?: Json | null
          type: Database["public"]["Enums"]["business_data_type"]
          user_id: string
        }
        Update: {
          created_at?: string
          file_name?: string
          id?: string
          parsed_json?: Json | null
          raw_csv?: string | null
          summary?: Json | null
          type?: Database["public"]["Enums"]["business_data_type"]
          user_id?: string
        }
        Relationships: []
      }
      customer_tickets: {
        Row: {
          ai_reply: string | null
          channel: Database["public"]["Enums"]["ticket_channel"]
          created_at: string
          customer_handle: string
          external_id: string | null
          id: string
          message: string
          status: Database["public"]["Enums"]["ticket_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          ai_reply?: string | null
          channel: Database["public"]["Enums"]["ticket_channel"]
          created_at?: string
          customer_handle: string
          external_id?: string | null
          id?: string
          message: string
          status?: Database["public"]["Enums"]["ticket_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          ai_reply?: string | null
          channel?: Database["public"]["Enums"]["ticket_channel"]
          created_at?: string
          customer_handle?: string
          external_id?: string | null
          id?: string
          message?: string
          status?: Database["public"]["Enums"]["ticket_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      pending_orders: {
        Row: {
          created_at: string
          customer_handle: string | null
          id: string
          product_id: string | null
          product_name: string
          qty: number
          status: Database["public"]["Enums"]["order_status"]
          ticket_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          customer_handle?: string | null
          id?: string
          product_id?: string | null
          product_name: string
          qty?: number
          status?: Database["public"]["Enums"]["order_status"]
          ticket_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          customer_handle?: string | null
          id?: string
          product_id?: string | null
          product_name?: string
          qty?: number
          status?: Database["public"]["Enums"]["order_status"]
          ticket_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pending_orders_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_catalog"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pending_orders_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "customer_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      product_catalog: {
        Row: {
          created_at: string
          description: string | null
          id: string
          image_url: string | null
          name: string
          price: number | null
          stock: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          name: string
          price?: number | null
          stock?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          name?: string
          price?: number | null
          stock?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          business_name: string | null
          created_at: string
          display_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          business_name?: string | null
          created_at?: string
          display_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          business_name?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      social_posts: {
        Row: {
          caption: string
          created_at: string
          external_post_id: string | null
          hashtags: string[] | null
          id: string
          image_url: string | null
          platform: string
          product_id: string | null
          scheduled_at: string | null
          status: Database["public"]["Enums"]["post_status"]
          user_id: string
        }
        Insert: {
          caption: string
          created_at?: string
          external_post_id?: string | null
          hashtags?: string[] | null
          id?: string
          image_url?: string | null
          platform: string
          product_id?: string | null
          scheduled_at?: string | null
          status?: Database["public"]["Enums"]["post_status"]
          user_id: string
        }
        Update: {
          caption?: string
          created_at?: string
          external_post_id?: string | null
          hashtags?: string[] | null
          id?: string
          image_url?: string | null
          platform?: string
          product_id?: string | null
          scheduled_at?: string | null
          status?: Database["public"]["Enums"]["post_status"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "social_posts_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_catalog"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      agent_name: "finn" | "mira" | "cara"
      business_data_type: "expense" | "earning" | "inventory"
      order_status: "pending" | "approved" | "rejected" | "fulfilled"
      post_status: "draft" | "scheduled" | "published"
      ticket_channel: "whatsapp" | "shopee" | "telegram"
      ticket_status: "open" | "replied" | "closed"
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
    Enums: {
      agent_name: ["finn", "mira", "cara"],
      business_data_type: ["expense", "earning", "inventory"],
      order_status: ["pending", "approved", "rejected", "fulfilled"],
      post_status: ["draft", "scheduled", "published"],
      ticket_channel: ["whatsapp", "shopee", "telegram"],
      ticket_status: ["open", "replied", "closed"],
    },
  },
} as const
