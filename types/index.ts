// Shared frontend models & schemas

export interface ChatMessage {
  _id: string;
  senderId: string;
  senderName: string;
  senderImage?: string;
  content: string;
  type: 'text' | 'system' | 'image' | 'file';
  fileUrl?: string;
  isEdited?: boolean;
  reactions?: Array<{
    emoji: string;
    users: string[]; // array of userIds
  }>;
  createdAt: string;
}

export interface Room {
  _id: string;
  name: string;
  description?: string;
  isDM?: boolean;
  members?: Array<{
    _id: string;
    name: string;
    image?: string;
    email?: string;
  }>;
  createdBy?: {
    name: string;
    image?: string;
  };
}

export interface OnlineMember {
  socketId: string;
  userId: string;
  name: string;
}

export type CallState = 'idle' | 'calling' | 'incoming' | 'connected';

export interface IncomingCallPayload {
  from: string;
  offer: RTCSessionDescriptionInit;
  callerName: string;
  callerImage?: string;
}
