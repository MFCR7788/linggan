export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      users: {
        Row: {
          id: string;
          phone: string | null;
          username: string | null;
          avatar_url: string | null;
          plan: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          phone?: string | null;
          username?: string | null;
          avatar_url?: string | null;
          plan?: string;
        };
        Update: {
          id?: string;
          phone?: string | null;
          username?: string | null;
          avatar_url?: string | null;
          plan?: string;
        };
      };
      categories: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          icon: string | null;
          color: string | null;
          is_default: boolean;
          sort_order: number | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          name: string;
          icon?: string | null;
          color?: string | null;
          is_default?: boolean;
          sort_order?: number | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          name?: string;
          icon?: string | null;
          color?: string | null;
          is_default?: boolean;
          sort_order?: number | null;
        };
      };
      tags: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          color: string | null;
          created_at: string;
        };
        Insert: {
          user_id: string;
          name: string;
          color?: string | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          name?: string;
          color?: string | null;
        };
      };
      schedules: {
        Row: {
          id: string;
          user_id: string;
          title: string;
          description: string | null;
          scheduled_at: string;
          location: string | null;
          color: string | null;
          status: string;
          remind_before: number | null;
          source_content_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          title: string;
          description?: string | null;
          scheduled_at: string;
          location?: string | null;
          color?: string | null;
          status?: string;
          remind_before?: number | null;
          source_content_id?: string | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          title?: string;
          description?: string | null;
          scheduled_at?: string;
          location?: string | null;
          color?: string | null;
          status?: string;
          remind_before?: number | null;
          source_content_id?: string | null;
        };
      };
      content_items: {
        Row: {
          id: string;
          user_id: string;
          type: string;
          category_id: string | null;
          title: string | null;
          original_text: string | null;
          ai_summary: string | null;
          ai_key_points: string[] | null;
          ai_reuse_score: number | null;
          ai_creation_suggestions: string[] | null;
          source_url: string | null;
          source_platform: string | null;
          media_urls: string[] | null;
          voice_url: string | null;
          thumbnail_url: string | null;
          is_shared: boolean;
          status: string;
          analysis_status: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          type: string;
          category_id?: string | null;
          title?: string | null;
          original_text?: string | null;
          ai_summary?: string | null;
          ai_key_points?: string[] | null;
          ai_reuse_score?: number | null;
          ai_creation_suggestions?: string[] | null;
          source_url?: string | null;
          source_platform?: string | null;
          media_urls?: string[] | null;
          voice_url?: string | null;
          thumbnail_url?: string | null;
          is_shared?: boolean;
          status?: string;
          analysis_status?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          type?: string;
          category_id?: string | null;
          title?: string | null;
          original_text?: string | null;
          ai_summary?: string | null;
          ai_key_points?: string[] | null;
          ai_reuse_score?: number | null;
          ai_creation_suggestions?: string[] | null;
          source_url?: string | null;
          source_platform?: string | null;
          media_urls?: string[] | null;
          voice_url?: string | null;
          thumbnail_url?: string | null;
          is_shared?: boolean;
          status?: string;
          analysis_status?: string;
        };
      };
    };
  };
}
