// Shared frontend models & schemas

export interface ChatMessage {
  _id: string;
  senderId: string;
  senderName: string;
  senderImage?: string;
  content: string;
  createdAt: string;
}

export interface Room {
  _id: string;
  name: string;
  description?: string;
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
