import { loadEnvConfig } from '@next/env';
// Synchronously bootstrap Next.js .env loading before server configurations initialize
loadEnvConfig(process.cwd());

import { createServer } from 'http';
import { Server, Socket } from 'socket.io';
import next from 'next';
import { connectDB } from './lib/db';
import Message from './models/Message';
import Room from './models/Room';
import PushSubscription from './models/PushSubscription';
import webpush from 'web-push';

const dev = process.env.NODE_ENV !== 'production';
const app = next({ dev });
const handle = app.getRequestHandler();

// Track online users within rooms: socketId → { userId, name, roomId }
const onlineUsers = new Map<string, { userId: string; name: string; roomId: string }>();

// GLOBAL PRESENCE TRACKING (Across all tabs/rooms)
const userSocketsGlobal = new Map<string, Set<string>>(); // userId -> Set<socketId>
const socketToUserGlobal = new Map<string, string>();      // socketId -> userId

// Async utility: Delivers push payloads to a target user's active browser devices
async function sendPushToUser(userId: string, payload: any) {
  try {
    const subscriptions = await PushSubscription.find({ userId });
    if (!subscriptions || subscriptions.length === 0) return;

    console.log(`[PushServer] Routing notice to ${userId} (${subscriptions.length} endpoints).`);
    const payloadString = JSON.stringify(payload);

    const dispatches = subscriptions.map(async (subDoc) => {
      try {
        const sub = {
          endpoint: subDoc.subscription.endpoint,
          keys: {
            p256dh: subDoc.subscription.keys.p256dh,
            auth: subDoc.subscription.keys.auth,
          },
        };
        await webpush.sendNotification(sub, payloadString);
      } catch (err: any) {
        // Automatically clean up expired/revoked browser endpoints!
        if (err.statusCode === 410 || err.statusCode === 404) {
          console.log(`[PushServer] Pruning dead endpoint for user ${userId}.`);
          await PushSubscription.deleteOne({ _id: subDoc._id });
        } else {
          console.error('[PushServer] Dispatch error:', err.message || err);
        }
      }
    });

    await Promise.all(dispatches);
  } catch (err) {
    console.error('[PushServer] Core dispatch pipeline failed:', err);
  }
}

app.prepare().then(async () => {
  try {
    await connectDB();
    console.log('> Connected to MongoDB for Custom Server');
  } catch (error) {
    console.error('> MongoDB Connection Error in Custom Server:', error);
  }

  // ── Native Web Push Initialization (Deferred until environment finishes load) ─────
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const contactEmail = process.env.VAPID_CONTACT_EMAIL || 'mailto:admin@chatapp.local';

  if (publicKey && privateKey) {
    webpush.setVapidDetails(contactEmail, publicKey, privateKey);
    console.log('> WebPush VAPID environment ready.');
  } else {
    console.warn('> WebPush initialization SKIPPED: VAPID credentials missing.');
  }

  const httpServer = createServer((req, res) => handle(req, res));
  
  const io = new Server(httpServer, {
    cors: {
      origin: process.env.NEXTAUTH_URL || 'http://localhost:3000',
      methods: ['GET', 'POST'],
    },
  });

  io.on('connection', (socket: Socket) => {
    console.log('Socket connected:', socket.id);

    // ── Global Presence ──────────────────────────────────────────────
    socket.on('presence:register', ({ userId }) => {
      if (!userId) return;
      
      socketToUserGlobal.set(socket.id, userId);
      
      if (!userSocketsGlobal.has(userId)) {
        userSocketsGlobal.set(userId, new Set());
        // First tab open for this user — broadcast dynamic ONLINE status globally
        io.emit('user:global_online', { userId });
      }
      userSocketsGlobal.get(userId)!.add(socket.id);
      
      // Synchronize initial state back to the new client
      socket.emit('presence:initial', Array.from(userSocketsGlobal.keys()));
      console.log(`[Global] User registered: ${userId}. Sockets: ${userSocketsGlobal.get(userId)!.size}`);
    });

    // ── Room management ──────────────────────────────────────────────
    socket.on('join:room', ({ roomId, userId, name }) => {
      socket.join(roomId);
      
      // Track user with room information
      onlineUsers.set(socket.id, { userId, name, roomId });

      // Persist membership dynamically for push notification aggregation
      Room.findByIdAndUpdate(roomId, { $addToSet: { members: userId } })
        .exec()
        .catch((err) => console.error('[Server] Membership sync error:', err));
      
      // Notify others in this room
      socket.to(roomId).emit('user:joined', { 
        socketId: socket.id, 
        userId, 
        name 
      });

      // Send CURRENT active participants to the new joiner
      const activeUsersInRoom: Array<{ socketId: string, userId: string, name: string }> = [];
      
      // Get socket IDs currently in the room from socket.io
      const socketIdsInRoom = io.sockets.adapter.rooms.get(roomId);
      if (socketIdsInRoom) {
        for (const id of socketIdsInRoom) {
          const user = onlineUsers.get(id);
          if (user) {
            activeUsersInRoom.push({
              socketId: id,
              userId: user.userId,
              name: user.name
            });
          }
        }
      }
      
      // Emit only to the joining user
      socket.emit('room:users', activeUsersInRoom);
      
      // Broadcast list to ALL in room to ensure state matches
      io.to(roomId).emit('room:users', activeUsersInRoom);

      console.log(`User ${name} (${socket.id}) joined room ${roomId}. Users inside:`, activeUsersInRoom.length);
    });

    socket.on('leave:room', ({ roomId }) => {
      socket.leave(roomId);
      const user = onlineUsers.get(socket.id);
      onlineUsers.delete(socket.id);
      
      // Re-emit updated users list
      const activeUsersInRoom: Array<{ socketId: string, userId: string, name: string }> = [];
      const socketIdsInRoom = io.sockets.adapter.rooms.get(roomId);
      if (socketIdsInRoom) {
        for (const id of socketIdsInRoom) {
          const userInRoom = onlineUsers.get(id);
          if (userInRoom) {
            activeUsersInRoom.push({
              socketId: id,
              userId: userInRoom.userId,
              name: userInRoom.name
            });
          }
        }
      }
      io.to(roomId).emit('room:users', activeUsersInRoom);
      
      if (user) {
        socket.to(roomId).emit('user:left', { socketId: socket.id, userId: user.userId });
      }
      console.log(`Socket ${socket.id} left room ${roomId}`);
    });

    // ── Chat messages ─────────────────────────────────────────────────
    socket.on('chat:message', async ({ roomId, senderId, content, senderName, senderImage, type = 'text', fileUrl }) => {
      try {
        const message = await Message.create({
          roomId,
          sender: senderId,
          content,
          type,
          fileUrl,
        });

        const payload = {
          _id: message._id.toString(),
          roomId,
          senderId,
          senderName,
          senderImage,
          content,
          type,
          fileUrl,
          isEdited: false,
          reactions: [],
          createdAt: message.createdAt,
        };

        io.to(roomId).emit('chat:message', payload);

        // 📦 Web Push Integration: Deliver native alerts to offline members or members in other channels
        (async () => {
          try {
            const room = await Room.findById(roomId).lean();
            if (!room || !room.members) return;

            // Identify users currently in this specific room's Socket group
            const activeUsersInThisRoom = new Set<string>();
            const activeSocketIds = io.sockets.adapter.rooms.get(roomId);
            if (activeSocketIds) {
              for (const sid of activeSocketIds) {
                const tracking = onlineUsers.get(sid);
                if (tracking) activeUsersInThisRoom.add(tracking.userId);
              }
            }

            // Polish visual payload for DMs vs. Public Channels
            const isDM = room.isDM || room.name.startsWith('dm:');
            const displayTitle = isDM ? senderName : `${senderName} in #${room.name}`;
            
            let displayBody = content;
            if (type === 'image') displayBody = '📷 Sent a photo';
            else if (type === 'file') displayBody = '📁 Sent a file attachment';

            const noticePayload = {
              title: displayTitle,
              body: displayBody,
              icon: senderImage || '/avatar-placeholder.png',
              url: `/chat/${roomId}`,
              tag: `chat-room-${roomId}`,
            };

            // Deliver exclusively to other members who aren't currently focusing this room viewport
            for (const member of room.members) {
              const targetId = member.toString();
              if (targetId !== senderId && !activeUsersInThisRoom.has(targetId)) {
                await sendPushToUser(targetId, noticePayload);
              }
            }
          } catch (pushErr) {
            console.error('[Push Dispatcher] Failed background query:', pushErr);
          }
        })();
      } catch (err) {
        console.error('Message save error:', err);
        socket.emit('error', { message: 'Failed to send message' });
      }
    });

    // Edit Message
    socket.on('chat:edit_message', async ({ roomId, messageId, content }) => {
      try {
        await Message.findByIdAndUpdate(messageId, {
          content,
          isEdited: true,
        });

        io.to(roomId).emit('chat:message_edited', { messageId, content });
      } catch (err) {
        console.error('Message edit error:', err);
      }
    });

    // Delete Message (Mask as system)
    socket.on('chat:delete_message', async ({ roomId, messageId }) => {
      try {
        await Message.findByIdAndUpdate(messageId, {
          content: '🚫 This message was deleted.',
          type: 'system',
          $unset: { fileUrl: 1 }
        });

        io.to(roomId).emit('chat:message_deleted', { messageId });
      } catch (err) {
        console.error('Message delete error:', err);
      }
    });

    // React to Message
    socket.on('chat:react_message', async ({ roomId, messageId, emoji, userId }) => {
      try {
        const message = await Message.findById(messageId);
        if (!message) return;

        // Initialize reactions array if missing
        if (!message.reactions) message.reactions = [];

        const existingReaction = message.reactions.find(r => r.emoji === emoji);

        if (existingReaction) {
          const userIndex = existingReaction.users.indexOf(userId);
          if (userIndex > -1) {
            // User already reacted, so TOGGLE OFF (pull user)
            existingReaction.users.splice(userIndex, 1);
          } else {
            // User has not reacted, TOGGLE ON (push user)
            existingReaction.users.push(userId);
          }

          // If user count for this reaction is now zero, clean it up
          if (existingReaction.users.length === 0) {
            message.reactions = message.reactions.filter(r => r.emoji !== emoji);
          }
        } else {
          // Add fresh reaction array entry
          message.reactions.push({ emoji, users: [userId] });
        }

        await message.save();

        // Map model output to string array structure for frontend
        const serializedReactions = message.reactions.map(r => ({
          emoji: r.emoji,
          users: r.users.map(id => id.toString())
        }));

        io.to(roomId).emit('chat:message_reacted', { messageId, reactions: serializedReactions });
      } catch (err) {
        console.error('Reaction error:', err);
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

      // 📞 Native Push Delivery: Ring the callee's devices instantly
      const recipient = onlineUsers.get(to);
      if (recipient) {
        sendPushToUser(recipient.userId, {
          title: `Incoming Video Call`,
          body: `${callerName} is calling you. Tap to answer!`,
          icon: callerImage || '/avatar-placeholder.png',
          url: `/chat/${recipient.roomId}`,
          tag: `call-incoming`,
        });
      }
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
      // 1. Handle Global Presence Clean up
      const userId = socketToUserGlobal.get(socket.id);
      if (userId) {
        const socketSet = userSocketsGlobal.get(userId);
        if (socketSet) {
          socketSet.delete(socket.id);
          
          if (socketSet.size === 0) {
            userSocketsGlobal.delete(userId);
            // Last tab closed — User went COMPLETELY offline globally!
            io.emit('user:global_offline', { userId });
            console.log(`[Global] User went offline: ${userId}`);
          }
        }
        socketToUserGlobal.delete(socket.id);
      }

      // 2. Handle Room clean up
      const user = onlineUsers.get(socket.id);
      if (user) {
        const { roomId } = user;
        onlineUsers.delete(socket.id);
        
        // Notify room members
        socket.to(roomId).emit('user:left', { socketId: socket.id, userId: user.userId });
        
        // Re-emit room users
        const activeUsersInRoom: Array<{ socketId: string, userId: string, name: string }> = [];
        const socketIdsInRoom = io.sockets.adapter.rooms.get(roomId);
        if (socketIdsInRoom) {
          for (const id of socketIdsInRoom) {
            const userInRoom = onlineUsers.get(id);
            if (userInRoom) {
              activeUsersInRoom.push({
                socketId: id,
                userId: userInRoom.userId,
                name: userInRoom.name
              });
            }
          }
        }
        io.to(roomId).emit('room:users', activeUsersInRoom);
      }
      console.log('Socket disconnected:', socket.id);
    });
  });

  const PORT = process.env.PORT || 3000;
  httpServer.listen(PORT, () => {
    console.log(`> Ready on http://localhost:${PORT}`);
  });
});
