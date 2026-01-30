
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
  is_verified: boolean;
  is_admin: boolean;
  is_banned: boolean;
  booster_until: string | null;
  suspended_until: string | null;
  created_at: string;
}

export interface Chat {
  id: string;
  phone?: string;
  is_verified?: boolean;
}

export interface Group {
  id: string;
  name: string;
  description?: string;
  created_by: string;
  created_at: string;
}
