export type Database = {
  public: {
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type
    Views: {};
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type
    Functions: {};
    Tables: {
      users: {
        Row: {
          id: string;
          email: string;
          email_provider: string;
          connected_account_id: string | null;
          encrypted_password: string | null;
          last_scan: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          email: string;
          email_provider: string;
          connected_account_id?: string | null;
          encrypted_password?: string | null;
          last_scan?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          email?: string;
          email_provider?: string;
          connected_account_id?: string | null;
          encrypted_password?: string | null;
          last_scan?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      emails: {
        Row: {
          id: string;
          user_id: string;
          email_id: string;
          sender: string;
          sender_name: string;
          subject: string;
          snippet: string;
          category: 'important' | 'clutter' | 'bundle';
          importance_reason: string | null;
          bundle_id: string | null;
          timestamp: string;
          is_read: boolean;
          has_attachment: boolean;
          is_archived: boolean;
          is_deleted: boolean;
          list_unsubscribe: string | null;
          list_unsubscribe_post: boolean;
          list_id: string | null;
          is_protected: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          email_id: string;
          sender: string;
          sender_name?: string;
          subject: string;
          snippet?: string;
          category?: 'important' | 'clutter' | 'bundle';
          importance_reason?: string | null;
          bundle_id?: string | null;
          timestamp: string;
          is_read?: boolean;
          has_attachment?: boolean;
          is_archived?: boolean;
          is_deleted?: boolean;
          list_unsubscribe?: string | null;
          list_unsubscribe_post?: boolean;
          list_id?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          email_id?: string;
          sender?: string;
          sender_name?: string;
          subject?: string;
          snippet?: string;
          category?: 'important' | 'clutter' | 'bundle';
          importance_reason?: string | null;
          bundle_id?: string | null;
          timestamp?: string;
          is_read?: boolean;
          has_attachment?: boolean;
          is_archived?: boolean;
          is_deleted?: boolean;
          list_unsubscribe?: string | null;
          list_unsubscribe_post?: boolean;
          list_id?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      sender_actions: {
        Row: {
          id: string;
          user_id: string;
          sender: string;
          unsubscribe_status: 'unsubscribed' | 'link_opened' | null;
          unsubscribed_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          sender: string;
          unsubscribe_status?: 'unsubscribed' | 'link_opened' | null;
          unsubscribed_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          sender?: string;
          unsubscribe_status?: 'unsubscribed' | 'link_opened' | null;
          unsubscribed_at?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      subscriptions: {
        Row: {
          user_id: string;
          stripe_customer_id: string | null;
          stripe_subscription_id: string | null;
          subscription_status: string;
          plan: 'monthly' | 'annual' | null;
          current_period_end: string | null;
          cancel_at_period_end: boolean;
          created_at: string;
          updated_at: string;
        };
        // Written only by edge functions (service role); users can read.
        Insert: never;
        Update: never;
        Relationships: [];
      };
      usage_monthly: {
        Row: {
          user_id: string;
          period_start: string;
          emails_cleaned: number;
          updated_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      bundles: {
        Row: {
          id: string;
          user_id: string;
          sender: string;
          bundle_type: string;
          count: number;
          example_subjects: string[];
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          sender: string;
          bundle_type: string;
          count?: number;
          example_subjects?: string[];
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          sender?: string;
          bundle_type?: string;
          count?: number;
          example_subjects?: string[];
          created_at?: string;
        };
        Relationships: [];
      };
    };
  };
};

export type User = Database['public']['Tables']['users']['Row'];
export type Email = Database['public']['Tables']['emails']['Row'];
export type Bundle = Database['public']['Tables']['bundles']['Row'];
export type SenderAction = Database['public']['Tables']['sender_actions']['Row'];
export type Subscription = Database['public']['Tables']['subscriptions']['Row'];
export type UsageMonthly = Database['public']['Tables']['usage_monthly']['Row'];
