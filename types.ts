
export interface Message {
  id: string;
  senderId: string;
  senderName: string;
  targetId: string;
  text: string;
  timestamp: string;
}

export interface Contact {
  id: string;
  username: string;
  name: string;
  avatar: string;
  status: 'online' | 'offline' | 'busy';
  bio?: string;
}

export interface Group {
  id: string;
  name: string;
  avatar: string;
  description: string;
}

export interface Story {
  id: string;
  userId: string;
  userName: string;
  userAvatar: string;
  imageUrl: string;
  timestamp: string;
}

export interface UserProfile {
  id: string;
  username: string;
  name: string;
  avatar: string;
  bio: string;
  phoneNumber: string;
  theme: 'light' | 'dark';
}
