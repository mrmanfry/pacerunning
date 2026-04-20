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
      consents: {
        Row: {
          accepted_at: string
          c1: boolean
          c2: boolean
          c3: boolean
          id: string
          user_id: string
        }
        Insert: {
          accepted_at?: string
          c1: boolean
          c2: boolean
          c3: boolean
          id?: string
          user_id: string
        }
        Update: {
          accepted_at?: string
          c1?: boolean
          c2?: boolean
          c3?: boolean
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      plans: {
        Row: {
          adjusted_estimate: number | null
          created_at: string
          id: string
          target: number
          updated_at: string
          user_id: string
          weeks: Json
        }
        Insert: {
          adjusted_estimate?: number | null
          created_at?: string
          id?: string
          target: number
          updated_at?: string
          user_id: string
          weeks: Json
        }
        Update: {
          adjusted_estimate?: number | null
          created_at?: string
          id?: string
          target?: number
          updated_at?: string
          user_id?: string
          weeks?: Json
        }
        Relationships: []
      }
      profiles: {
        Row: {
          age: number
          created_at: string
          current_best: number
          days_until_race: number
          id: string
          level: string
          sex: string
          target_time: number
          updated_at: string
          weekly_freq: number
          weight: number
        }
        Insert: {
          age: number
          created_at?: string
          current_best: number
          days_until_race: number
          id: string
          level: string
          sex: string
          target_time: number
          updated_at?: string
          weekly_freq: number
          weight: number
        }
        Update: {
          age?: number
          created_at?: string
          current_best?: number
          days_until_race?: number
          id?: string
          level?: string
          sex?: string
          target_time?: number
          updated_at?: string
          weekly_freq?: number
          weight?: number
        }
        Relationships: []
      }
      workout_logs: {
        Row: {
          cadence: number | null
          distance: number
          duration: number
          hr_avg: number
          hr_max: number | null
          id: string
          logged_at: string
          notes: string | null
          rpe: number
          safety_overridden: boolean | null
          session_idx: number | null
          session_name: string
          session_type: string
          user_id: string
          week_idx: number | null
        }
        Insert: {
          cadence?: number | null
          distance: number
          duration: number
          hr_avg: number
          hr_max?: number | null
          id?: string
          logged_at?: string
          notes?: string | null
          rpe: number
          safety_overridden?: boolean | null
          session_idx?: number | null
          session_name: string
          session_type: string
          user_id: string
          week_idx?: number | null
        }
        Update: {
          cadence?: number | null
          distance?: number
          duration?: number
          hr_avg?: number
          hr_max?: number | null
          id?: string
          logged_at?: string
          notes?: string | null
          rpe?: number
          safety_overridden?: boolean | null
          session_idx?: number | null
          session_name?: string
          session_type?: string
          user_id?: string
          week_idx?: number | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
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
