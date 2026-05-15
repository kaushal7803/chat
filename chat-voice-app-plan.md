# Chat & Voice Call App — Full Implementation Plan
> **Stack:** Next.js 14 (App Router) · MongoDB + Mongoose · NextAuth.js · Socket.io · WebRTC  
> **Purpose:** AI-assisted coding reference — paste relevant sections as context when working with an AI coding assistant

---

## Table of Contents
1. [Project Overview](#1-project-overview)
2. [Folder Structure](#2-folder-structure)
3. [Environment Variables](#3-environment-variables)
4. [Dependencies](#4-dependencies)
5. [Database Models](#5-database-models)
6. [Google Auth Setup](#6-google-auth-setup)
7. [NextAuth Configuration](#7-nextauth-configuration)
8. [Custom Socket.io Server](#8-custom-socketio-server)
9. [API Routes](#9-api-routes)
10. [Socket.io Client (Chat)](#10-socketio-client-chat)
11. [WebRTC Voice Calls](#11-webrtc-voice-calls)
12. [UI Pages & Components](#12-ui-pages--components)
13. [Auth Guards & Middleware](#13-auth-guards--middleware)
14. [Local Development Setup](#14-local-development-setup)
15. [Testing Checklist](#15-testing-checklist)
16. [Common Errors & Fixes](#16-common-errors--fixes)
17. [Build Order](#17-build-order)

---

## 1. Project Overview

### What we're building
- Real-time **text chat** between users in named rooms
- **Voice calls** (1-to-1) using WebRTC peer-to-peer audio
- **Google Sign-In** via NextAuth.js (no username/password)
- Fully testable on **localhost**

### Architecture summary
```
Browser (Next.js)
  ↕ HTTP          → Next.js API Routes  → MongoDB
  ↕ WebSocket     → Socket.io Server    (same Node process)
  ↕ WebRTC P2P   → Direct audio stream between peers
                    (signaling goes through Socket.io)
```

### Key design decisions
- Single Node.js process runs both Next.js and Socket.io (via custom server)
- NextAuth handles session; JWT token is attached to Socket.io handshake for auth
- WebRTC signaling (offer/answer/ICE) is routed through Socket.io events
- MongoDB stores users, rooms, and messages; sessions are stored in MongoDB too

---

## 2. Folder Structure

```
/
├── app/
│   ├── layout.tsx                    # Root layout — SessionProvider wrapper
│   ├── page.tsx                      # Landing / login page
│   ├── chat/
│   │   ├── page.tsx                  # Room list
│   │   └── [roomId]/
│   │       └── page.tsx              # Chat room + voice call
│   └── api/
│       ├── auth/
│       │   └── [...nextauth]/
│       │       └── route.ts          # NextAuth handler
│       ├── rooms/
│       │   └── route.ts              # GET list, POST create
│       ├── rooms/[roomId]/
│       │   └── route.ts              # GET single room, DELETE
│       └── messages/
│           └── route.ts              # GET history, POST (REST fallback)
├── components/
│   ├── ChatWindow.tsx                # Message list + input
│   ├── RoomList.tsx                  # Sidebar with rooms
│   ├── VoiceCall.tsx                 # WebRTC call UI
│   ├── IncomingCall.tsx              # Ringing overlay
│   └── UserAvatar.tsx               # Profile picture
├── lib/
│   ├── db.ts                         # MongoDB connection (cached)
│   ├── socket.ts                     # Socket.io singleton (client-side)
│   └── auth.ts                       # NextAuth options (shared config)
├── models/
│   ├── User.ts
│   ├── Room.ts
│   └── Message.ts
├── hooks/
│   ├── useSocket.ts                  # Socket.io connection hook
│   ├── useChat.ts                    # Chat messages hook
│   └── useVoiceCall.ts               # WebRTC call hook
├── types/
│   └── index.ts                      # Shared TypeScript types
├── server.ts                         # Custom Node server (Next.js + Socket.io)
├── middleware.ts                     # Route protection
├── .env.local                        # Secrets (never commit)
├── .env.example                      # Template (commit this)
└── package.json
```

---

## 3. Environment Variables

### `.env.local` (never commit)
```env
# App
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=                        # generate: openssl rand -base64 32

# Google OAuth
GOOGLE_CLIENT_ID=xxxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=xxxx

# MongoDB
MONGODB_URI=mongodb://localhost:27017/chatapp
# OR Atlas: mongodb+srv://user:pass@cluster.mongodb.net/chatapp

# Socket.io (optional, defaults to same origin)
NEXT_PUBLIC_SOCKET_URL=http://localhost:3000
```

### `.env.example` (commit this)
```env
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=your-random-secret-here
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
MONGODB_URI=mongodb://localhost:27017/chatapp
NEXT_PUBLIC_SOCKET_URL=http://localhost:3000
```

---

## 4. Dependencies

### Install command
```bash
npx create-next-app@latest chatapp --typescript --tailwind --app
cd chatapp

# Core
npm install next-auth mongoose socket.io socket.io-client

# Utilities
npm install date-fns uuid

# Dev
npm install -D tsx @types/uuid
```

### `package.json` scripts
```json
{
  "scripts": {
    "dev": "tsx server.ts",
    "build": "next build",
    "start": "NODE_ENV=production tsx server.ts",
    "lint": "next lint"
  }
}
```

> **Important:** `npm run dev` must use `tsx server.ts` (not `next dev`) so Socket.io runs in the same process.

---

## 5. Database Models

### `models/User.ts`
```typescript
import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IUser extends Document {
  email: string;
  name: string;
  image?: string;
  googleId: string;
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema = new Schema<IUser>(
  {
    email: { type: String, required: true, unique: true, lowercase: true },
    name: { type: String, required: true },
    image: { type: String },
    googleId: { type: String, required: true, unique: true },
  },
  { timestamps: true }
);

const User: Model<IUser> =
  mongoose.models.User || mongoose.model<IUser>('User', UserSchema);

export default User;
```

### `models/Room.ts`
```typescript
import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IRoom extends Document {
  name: string;
  description?: string;
  members: mongoose.Types.ObjectId[];
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const RoomSchema = new Schema<IRoom>(
  {
    name: { type: String, required: true, unique: true, trim: true },
    description: { type: String },
    members: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

const Room: Model<IRoom> =
  mongoose.models.Room || mongoose.model<IRoom>('Room', RoomSchema);

export default Room;
```

### `models/Message.ts`
```typescript
import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IMessage extends Document {
  roomId: mongoose.Types.ObjectId;
  sender: mongoose.Types.ObjectId;
  content: string;
  type: 'text' | 'system';
  createdAt: Date;
}

const MessageSchema = new Schema<IMessage>(
  {
    roomId: { type: Schema.Types.ObjectId, ref: 'Room', required: true },
    sender: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    content: { type: String, required: true },
    type: { type: String, enum: ['text', 'system'], default: 'text' },
  },
  { timestamps: true }
);

// Index for fast room message queries
MessageSchema.index({ roomId: 1, createdAt: -1 });

const Message: Model<IMessage> =
  mongoose.models.Message || mongoose.model<IMessage>('Message', MessageSchema);

export default Message;
```

### `lib/db.ts`
```typescript
import mongoose from 'mongoose';

const MONGODB_URI = process.env.MONGODB_URI!;

if (!MONGODB_URI) {
  throw new Error('MONGODB_URI is not defined in .env.local');
}

// Cached connection — prevents multiple connections on hot reload
declare global {
  var _mongooseCache: { conn: typeof mongoose | null; promise: Promise<typeof mongoose> | null };
}

let cached = global._mongooseCache;

if (!cached) {
  cached = global._mongooseCache = { conn: null, promise: null };
}

export async function connectDB() {
  if (cached.conn) return cached.conn;

  if (!cached.promise) {
    cached.promise = mongoose
      .connect(MONGODB_URI, { bufferCommands: false })
      .then((m) => m);
  }

  cached.conn = await cached.promise;
  return cached.conn;
}
```

---

## 6. Google Auth Setup

### Steps in Google Cloud Console
1. Go to https://console.cloud.google.com
2. Create a new project (or select existing)
3. Navigate to **APIs & Services → OAuth consent screen**
   - User type: **External**
   - Fill in app name, support email, developer email
   - Scopes: add `email`, `profile`, `openid`
   - Add yourself as a test user
4. Navigate to **APIs & Services → Credentials**
   - Click **Create Credentials → OAuth 2.0 Client ID**
   - Application type: **Web application**
   - Authorized JavaScript origins: `http://localhost:3000`
   - Authorized redirect URIs: `http://localhost:3000/api/auth/callback/google`
5. Copy **Client ID** and **Client Secret** to `.env.local`

> **Note:** For production, add your production domain to both origins and redirect URIs.

---

## 7. NextAuth Configuration

### `lib/auth.ts` (shared config)
```typescript
import { NextAuthOptions } from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';
import { connectDB } from './db';
import User from '@/models/User';

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],
  session: {
    strategy: 'jwt',
  },
  callbacks: {
    async signIn({ user, account }) {
      if (account?.provider !== 'google') return false;

      try {
        await connectDB();
        await User.findOneAndUpdate(
          { googleId: account.providerAccountId },
          {
            email: user.email,
            name: user.name,
            image: user.image,
            googleId: account.providerAccountId,
          },
          { upsert: true, new: true }
        );
        return true;
      } catch (error) {
        console.error('SignIn error:', error);
        return false;
      }
    },
    async jwt({ token, account }) {
      // Persist the user's MongoDB _id in the token
      if (account) {
        await connectDB();
        const dbUser = await User.findOne({ googleId: account.providerAccountId });
        if (dbUser) token.userId = dbUser._id.toString();
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.userId) {
        (session.user as any).id = token.userId;
      }
      return session;
    },
  },
  pages: {
    signIn: '/',        // Redirect to home page for sign-in
    error: '/',         // Redirect errors to home
  },
  secret: process.env.NEXTAUTH_SECRET,
};
```

### `app/api/auth/[...nextauth]/route.ts`
```typescript
import NextAuth from 'next-auth';
import { authOptions } from '@/lib/auth';

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };
```

### `app/layout.tsx` — wrap with SessionProvider
```typescript
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import SessionProvider from '@/components/SessionProvider';

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  return (
    <html lang="en">
      <body>
        <SessionProvider session={session}>
          {children}
        </SessionProvider>
      </body>
    </html>
  );
}
```

### `components/SessionProvider.tsx`
```typescript
'use client';
import { SessionProvider as NextAuthSessionProvider } from 'next-auth/react';

export default function SessionProvider({
  children,
  session,
}: {
  children: React.ReactNode;
  session: any;
}) {
  return <NextAuthSessionProvider session={session}>{children}</NextAuthSessionProvider>;
}
```

---

## 8. Custom Socket.io Server

### `server.ts`
```typescript
import { createServer } from 'http';
import { Server, Socket } from 'socket.io';
import next from 'next';
import { connectDB } from './lib/db';
import Message from './models/Message';

const dev = process.env.NODE_ENV !== 'production';
const app = next({ dev });
const handle = app.getRequestHandler();

// Track online users: socketId → { userId, roomId }
const onlineUsers = new Map<string, { userId: string; name: string }>();

app.prepare().then(async () => {
  await connectDB();

  const httpServer = createServer((req, res) => handle(req, res));
  const io = new Server(httpServer, {
    cors: { origin: process.env.NEXTAUTH_URL || 'http://localhost:3000' },
  });

  io.on('connection', (socket: Socket) => {
    console.log('Socket connected:', socket.id);

    // ── Room management ──────────────────────────────────────────────
    socket.on('join:room', ({ roomId, userId, name }) => {
      socket.join(roomId);
      onlineUsers.set(socket.id, { userId, name });
      socket.to(roomId).emit('user:joined', { userId, name });
    });

    socket.on('leave:room', ({ roomId }) => {
      socket.leave(roomId);
    });

    // ── Chat messages ─────────────────────────────────────────────────
    socket.on('chat:message', async ({ roomId, senderId, content, senderName, senderImage }) => {
      try {
        const message = await Message.create({
          roomId,
          sender: senderId,
          content,
          type: 'text',
        });

        const payload = {
          _id: message._id.toString(),
          roomId,
          senderId,
          senderName,
          senderImage,
          content,
          createdAt: message.createdAt,
        };

        io.to(roomId).emit('chat:message', payload);
      } catch (err) {
        console.error('Message save error:', err);
        socket.emit('error', { message: 'Failed to send message' });
      }
    });

    // ── Typing indicators ─────────────────────────────────────────────
    socket.on('user:typing', ({ roomId, userId, name, isTyping }) => {
      socket.to(roomId).emit('user:typing', { userId, name, isTyping });
    });

    // ── WebRTC Signaling ─────────────────────────────────────────────
    // Offer: caller → callee
    socket.on('call:offer', ({ to, from, offer, callerName, callerImage }) => {
      io.to(to).emit('call:incoming', { from, offer, callerName, callerImage });
    });

    // Answer: callee → caller
    socket.on('call:answer', ({ to, answer }) => {
      io.to(to).emit('call:answer', { answer });
    });

    // ICE candidates: both directions
    socket.on('call:ice', ({ to, candidate }) => {
      io.to(to).emit('call:ice', { candidate, from: socket.id });
    });

    // Call rejected
    socket.on('call:reject', ({ to }) => {
      io.to(to).emit('call:rejected');
    });

    // Call ended
    socket.on('call:end', ({ to }) => {
      io.to(to).emit('call:ended');
    });

    // ── Disconnect ───────────────────────────────────────────────────
    socket.on('disconnect', () => {
      onlineUsers.delete(socket.id);
      console.log('Socket disconnected:', socket.id);
    });
  });

  httpServer.listen(3000, () => {
    console.log('> Ready on http://localhost:3000');
  });
});
```

---

## 9. API Routes

### `app/api/rooms/route.ts`
```typescript
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { connectDB } from '@/lib/db';
import Room from '@/models/Room';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  await connectDB();
  const rooms = await Room.find().sort({ createdAt: -1 }).populate('createdBy', 'name image');
  return NextResponse.json(rooms);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { name, description } = await req.json();
  if (!name?.trim()) return NextResponse.json({ error: 'Room name required' }, { status: 400 });

  await connectDB();

  const userId = (session.user as any).id;
  const room = await Room.create({
    name: name.trim(),
    description,
    createdBy: userId,
    members: [userId],
  });

  return NextResponse.json(room, { status: 201 });
}
```

### `app/api/messages/route.ts`
```typescript
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { connectDB } from '@/lib/db';
import Message from '@/models/Message';

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const roomId = searchParams.get('roomId');
  const limit = parseInt(searchParams.get('limit') || '50');
  const before = searchParams.get('before'); // for pagination

  if (!roomId) return NextResponse.json({ error: 'roomId required' }, { status: 400 });

  await connectDB();

  const query: any = { roomId };
  if (before) query.createdAt = { $lt: new Date(before) };

  const messages = await Message.find(query)
    .sort({ createdAt: -1 })
    .limit(limit)
    .populate('sender', 'name image')
    .lean();

  return NextResponse.json(messages.reverse());
}
```

---

## 10. Socket.io Client (Chat)

### `lib/socket.ts` — singleton
```typescript
import { io, Socket } from 'socket.io-client';

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    socket = io(process.env.NEXT_PUBLIC_SOCKET_URL || '', {
      autoConnect: false,
    });
  }
  return socket;
}
```

### `hooks/useChat.ts`
```typescript
'use client';
import { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { getSocket } from '@/lib/socket';

export interface ChatMessage {
  _id: string;
  senderId: string;
  senderName: string;
  senderImage?: string;
  content: string;
  createdAt: string;
}

export function useChat(roomId: string) {
  const { data: session } = useSession();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const socket = getSocket();

  // Load message history on mount
  useEffect(() => {
    fetch(`/api/messages?roomId=${roomId}`)
      .then((r) => r.json())
      .then((data) => {
        setMessages(
          data.map((m: any) => ({
            _id: m._id,
            senderId: m.sender._id,
            senderName: m.sender.name,
            senderImage: m.sender.image,
            content: m.content,
            createdAt: m.createdAt,
          }))
        );
      });
  }, [roomId]);

  // Connect socket and join room
  useEffect(() => {
    if (!session?.user) return;

    const user = session.user as any;
    if (!socket.connected) socket.connect();

    socket.emit('join:room', { roomId, userId: user.id, name: user.name });

    socket.on('chat:message', (msg: ChatMessage) => {
      setMessages((prev) => [...prev, msg]);
    });

    socket.on('user:typing', ({ name, isTyping }: { name: string; isTyping: boolean }) => {
      setTypingUsers((prev) =>
        isTyping ? [...new Set([...prev, name])] : prev.filter((n) => n !== name)
      );
    });

    return () => {
      socket.emit('leave:room', { roomId });
      socket.off('chat:message');
      socket.off('user:typing');
    };
  }, [roomId, session]);

  const sendMessage = useCallback(
    (content: string) => {
      if (!session?.user || !content.trim()) return;
      const user = session.user as any;
      socket.emit('chat:message', {
        roomId,
        senderId: user.id,
        senderName: user.name,
        senderImage: user.image,
        content: content.trim(),
      });
    },
    [roomId, session, socket]
  );

  const sendTyping = useCallback(
    (isTyping: boolean) => {
      if (!session?.user) return;
      const user = session.user as any;
      socket.emit('user:typing', { roomId, userId: user.id, name: user.name, isTyping });
    },
    [roomId, session, socket]
  );

  return { messages, typingUsers, sendMessage, sendTyping };
}
```

---

## 11. WebRTC Voice Calls

### How it works (step by step)
```
Caller                          Socket.io               Callee
  |                                 |                      |
  |-- call:offer (SDP + to) ------->|                      |
  |                                 |-- call:incoming ---->|
  |                                 |                      | (user accepts)
  |                                 |<-- call:answer ------|
  |<-- call:answer -----------------|                      |
  |                                 |                      |
  |<-- call:ice (candidates) ------>| (both directions)    |
  |                                 |                      |
  |====== Direct P2P audio stream ========================|
```

### ICE Server config
```typescript
// For localhost testing — Google's free STUN is enough
const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    // Add TURN for cross-network calls in production:
    // { urls: 'turn:your-server:3478', username: 'user', credential: 'pass' }
  ],
};
```

### `hooks/useVoiceCall.ts`
```typescript
'use client';
import { useState, useRef, useCallback, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { getSocket } from '@/lib/socket';

const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
};

export type CallState = 'idle' | 'calling' | 'incoming' | 'connected';

export function useVoiceCall() {
  const { data: session } = useSession();
  const socket = getSocket();
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);

  const [callState, setCallState] = useState<CallState>('idle');
  const [callTarget, setCallTarget] = useState<string | null>(null); // socket ID of peer
  const [incomingCall, setIncomingCall] = useState<{
    from: string;
    offer: RTCSessionDescriptionInit;
    callerName: string;
    callerImage?: string;
  } | null>(null);

  const cleanup = useCallback(() => {
    pcRef.current?.close();
    pcRef.current = null;
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;
    setCallState('idle');
    setCallTarget(null);
    setIncomingCall(null);
  }, []);

  const createPC = useCallback(() => {
    const pc = new RTCPeerConnection(ICE_SERVERS);

    pc.onicecandidate = ({ candidate }) => {
      if (candidate && callTarget) {
        socket.emit('call:ice', { to: callTarget, candidate });
      }
    };

    pc.ontrack = ({ streams }) => {
      if (remoteAudioRef.current) {
        remoteAudioRef.current.srcObject = streams[0];
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') setCallState('connected');
      if (['disconnected', 'failed', 'closed'].includes(pc.connectionState)) cleanup();
    };

    pcRef.current = pc;
    return pc;
  }, [callTarget, socket, cleanup]);

  // ── Start a call ───────────────────────────────────────────────────
  const startCall = useCallback(
    async (targetSocketId: string) => {
      if (!session?.user) return;
      const user = session.user as any;

      setCallTarget(targetSocketId);
      setCallState('calling');

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      localStreamRef.current = stream;

      const pc = createPC();
      stream.getTracks().forEach((t) => pc.addTrack(t, stream));

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      socket.emit('call:offer', {
        to: targetSocketId,
        from: socket.id,
        offer,
        callerName: user.name,
        callerImage: user.image,
      });
    },
    [session, socket, createPC]
  );

  // ── Accept incoming call ───────────────────────────────────────────
  const acceptCall = useCallback(async () => {
    if (!incomingCall) return;

    setCallTarget(incomingCall.from);
    setCallState('connected');

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    localStreamRef.current = stream;

    const pc = createPC();
    stream.getTracks().forEach((t) => pc.addTrack(t, stream));

    await pc.setRemoteDescription(new RTCSessionDescription(incomingCall.offer));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    socket.emit('call:answer', { to: incomingCall.from, answer });
    setIncomingCall(null);
  }, [incomingCall, socket, createPC]);

  // ── Reject / End call ─────────────────────────────────────────────
  const rejectCall = useCallback(() => {
    if (incomingCall) socket.emit('call:reject', { to: incomingCall.from });
    cleanup();
  }, [incomingCall, socket, cleanup]);

  const endCall = useCallback(() => {
    if (callTarget) socket.emit('call:end', { to: callTarget });
    cleanup();
  }, [callTarget, socket, cleanup]);

  // ── Socket event listeners ─────────────────────────────────────────
  useEffect(() => {
    socket.on('call:incoming', (data) => {
      setIncomingCall(data);
      setCallState('incoming');
    });

    socket.on('call:answer', async ({ answer }) => {
      await pcRef.current?.setRemoteDescription(new RTCSessionDescription(answer));
    });

    socket.on('call:ice', async ({ candidate }) => {
      try {
        await pcRef.current?.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (e) {
        console.error('ICE candidate error:', e);
      }
    });

    socket.on('call:rejected', cleanup);
    socket.on('call:ended', cleanup);

    return () => {
      socket.off('call:incoming');
      socket.off('call:answer');
      socket.off('call:ice');
      socket.off('call:rejected');
      socket.off('call:ended');
    };
  }, [socket, cleanup]);

  return {
    callState,
    incomingCall,
    remoteAudioRef,
    startCall,
    acceptCall,
    rejectCall,
    endCall,
  };
}
```

---

## 12. UI Pages & Components

### `app/page.tsx` — Landing / Login
```typescript
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { redirect } from 'next/navigation';
import SignInButton from '@/components/SignInButton';

export default async function HomePage() {
  const session = await getServerSession(authOptions);
  if (session) redirect('/chat');

  return (
    <main className="min-h-screen flex items-center justify-center">
      <div className="text-center space-y-6">
        <h1 className="text-4xl font-bold">ChatApp</h1>
        <p className="text-gray-500">Sign in to start chatting</p>
        <SignInButton />
      </div>
    </main>
  );
}
```

### `components/SignInButton.tsx`
```typescript
'use client';
import { signIn } from 'next-auth/react';

export default function SignInButton() {
  return (
    <button
      onClick={() => signIn('google', { callbackUrl: '/chat' })}
      className="flex items-center gap-3 px-6 py-3 bg-white border border-gray-200 rounded-lg shadow-sm hover:shadow-md transition"
    >
      {/* Google SVG icon */}
      <svg width="20" height="20" viewBox="0 0 24 24">
        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
      </svg>
      Continue with Google
    </button>
  );
}
```

### `app/chat/page.tsx` — Room List
```typescript
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { connectDB } from '@/lib/db';
import Room from '@/models/Room';
import RoomList from '@/components/RoomList';

export default async function ChatPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect('/');

  await connectDB();
  const rooms = await Room.find().sort({ createdAt: -1 }).populate('createdBy', 'name').lean();

  return <RoomList initialRooms={JSON.parse(JSON.stringify(rooms))} />;
}
```

### Component responsibilities
| Component | Responsibilities |
|---|---|
| `RoomList.tsx` | Display rooms, create new room form, navigate to room |
| `ChatWindow.tsx` | Message feed, input box, typing indicator, scroll to bottom |
| `VoiceCall.tsx` | Call button, active call controls (mute/end), audio element |
| `IncomingCall.tsx` | Ringing overlay with accept/reject buttons |
| `UserAvatar.tsx` | Profile picture with fallback initials |

---

## 13. Auth Guards & Middleware

### `middleware.ts`
```typescript
export { default } from 'next-auth/middleware';

export const config = {
  matcher: ['/chat/:path*', '/api/rooms/:path*', '/api/messages/:path*'],
};
```

> This single file protects all `/chat` pages and API routes — unauthenticated users are redirected to the sign-in page automatically.

### Server-side guard (in Server Components)
```typescript
const session = await getServerSession(authOptions);
if (!session) redirect('/');
```

### Client-side guard (in Client Components)
```typescript
const { data: session, status } = useSession();
if (status === 'loading') return <Spinner />;
if (!session) return <SignInButton />;
```

---

## 14. Local Development Setup

### Prerequisites
- Node.js 18+
- MongoDB installed locally OR MongoDB Atlas account (free tier)
- Google Cloud project with OAuth credentials

### Start MongoDB locally
```bash
# macOS (Homebrew)
brew services start mongodb-community

# Ubuntu
sudo systemctl start mongod

# Docker (easiest)
docker run -d -p 27017:27017 --name mongo mongo:7
```

### First-time setup
```bash
git clone <your-repo>
cd chatapp
npm install
cp .env.example .env.local
# Fill in .env.local with your secrets
npm run dev
```

### Verify it's working
1. Open http://localhost:3000 — should show landing page
2. Click "Continue with Google" — should redirect to Google and back
3. Should land on `/chat` with room list
4. Create a room — check MongoDB:
   ```bash
   mongosh chatapp
   db.rooms.find().pretty()
   ```

### Test chat with two users
- Open two different browser profiles (Chrome profile 1 + profile 2)
- Sign in with different Google accounts in each
- Join the same room — messages should appear in both

### Test voice call locally
- Two tabs on localhost share the same network → STUN is enough, no TURN needed
- Click "Call" in one tab → accept in the other tab → should hear audio

---

## 15. Testing Checklist

### Auth
- [ ] Google sign-in redirects correctly and creates user in MongoDB
- [ ] Session persists on page refresh
- [ ] Unauthenticated users are redirected from `/chat` to `/`
- [ ] Sign-out clears session and redirects to home

### Chat
- [ ] Messages appear in real-time in both browser tabs
- [ ] Message history loads on room join (from MongoDB)
- [ ] Typing indicator shows/hides correctly
- [ ] Long messages don't break the UI
- [ ] Messages persist after page refresh

### Voice Call
- [ ] Microphone permission prompt appears
- [ ] Incoming call notification shows (ringing state)
- [ ] Accepting the call establishes audio
- [ ] Rejecting shows "call rejected" to caller
- [ ] Ending call cleans up on both sides
- [ ] No audio after call ends (tracks stopped)

### Edge cases
- [ ] Disconnecting socket mid-call handles gracefully
- [ ] Joining a room that doesn't exist returns 404
- [ ] Creating a room with a duplicate name returns an error
- [ ] Empty messages are not sent

---

## 16. Common Errors & Fixes

| Error | Cause | Fix |
|---|---|---|
| `NEXTAUTH_SECRET is not defined` | Missing env var | Run `openssl rand -base64 32` and add to `.env.local` |
| `OAuthCallback: redirect_uri_mismatch` | Google Console misconfigured | Add `http://localhost:3000/api/auth/callback/google` to authorized redirect URIs |
| `MongooseError: buffering timed out` | MongoDB not running | Start MongoDB with `brew services start mongodb-community` |
| `Socket.io not connecting` | Running `next dev` instead of custom server | Use `npm run dev` which runs `tsx server.ts` |
| `RTCPeerConnection failed` | ICE candidates not exchanging | Ensure both peers have joined Socket.io before calling `startCall` |
| `getUserMedia: NotAllowedError` | Mic permission denied | Allow microphone in browser settings and on `http://localhost` (allowed by default) |
| `Cannot read properties of null (reading 'connect')` | Socket singleton not initialized | Check `lib/socket.ts` is imported only client-side (inside `'use client'` components) |
| `Module not found: Can't resolve 'fs'` | Server-only code imported in client component | Move DB/model imports to Server Components or API Routes only |

---

## 17. Build Order

Follow this order — each phase is independently testable before moving to the next.

```
Phase 1: Project scaffold
  ✓ Create Next.js app
  ✓ Install dependencies
  ✓ Set up folder structure
  ✓ Configure .env.local

Phase 2: Database
  ✓ MongoDB connection (lib/db.ts)
  ✓ User, Room, Message models
  ✓ Verify connection with mongosh

Phase 3: Google Auth
  ✓ Google Cloud Console setup
  ✓ NextAuth config (lib/auth.ts)
  ✓ API route (/api/auth/[...nextauth])
  ✓ SessionProvider in layout
  ✓ Sign-in button on home page
  ✓ Test: sign in → user appears in MongoDB

Phase 4: Middleware + Route Protection
  ✓ middleware.ts protecting /chat routes
  ✓ Test: unauthenticated access redirects

Phase 5: API Routes
  ✓ GET/POST /api/rooms
  ✓ GET /api/messages?roomId=xxx
  ✓ Test with Postman or curl

Phase 6: Custom Server + Socket.io
  ✓ server.ts with Next.js + Socket.io
  ✓ Update package.json dev script
  ✓ Implement Socket.io events
  ✓ Test: wscat or socket.io-client test script

Phase 7: Chat UI
  ✓ Room list page
  ✓ Chat window component
  ✓ useChat hook
  ✓ Test: two browser tabs, real-time messages

Phase 8: Voice Calls
  ✓ useVoiceCall hook
  ✓ VoiceCall component
  ✓ IncomingCall overlay
  ✓ Test: call between two browser profiles

Phase 9: Polish
  ✓ Typing indicators
  ✓ Online presence
  ✓ Message timestamps
  ✓ Mobile responsive layout
  ✓ Error states and loading skeletons
```

---

## AI Coding Tips

When using this plan with an AI assistant:

- **Give one phase at a time** — paste the relevant section + "implement this" rather than the whole file
- **Share model schemas first** — AI generates better code when it knows the data shape
- **Paste error messages in full** — include the stack trace, not just the error text
- **Specify what's already working** — "Auth is done, now help me with Socket.io"
- **Ask for types first** — get TypeScript interfaces before component code to avoid mismatches

---

*Generated for Next.js 14 · NextAuth.js v4 · Socket.io v4 · MongoDB 7 · WebRTC (browser-native)*
