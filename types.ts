
export interface Message {
  id: string;
  sender_id: string;
  receiver_id: string;
  content: string;
  created_at: string;
}

export interface UserProfile {
  id: string;
  phone: string;
  display_name?: string;
  avatar_url?: string;
  bio?: string;
  is_verified: boolean;
  is_admin: boolean;
  is_banned: boolean;
  booster_until: string | null;
  suspended_until: string | null;
  created_at: string;
}

/**
 * Chat interface updated to include avatar_url.
 * This resolves property access errors on lines 299, 391, and 453 of App.tsx.
 */
export interface Chat {
  id: string;
  phone?: string;
  display_name?: string;
  avatar_url?: string;
  is_verified?: boolean;
  status?: 'pending' | 'accepted';
}

export interface Group {
  id: string;
  name: string;
  description?: string;
  created_by: string;
  created_at: string;
}

export interface Contact {
  id: string;
  user_id: string;
  contact_id: string;
  status: 'accepted' | 'pending' | 'blocked';
  created_at: string;
}