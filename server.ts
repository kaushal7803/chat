import { createServer } from 'http';
import { Server, Socket } from 'socket.io';
import next from 'next';
import { connectDB } from './lib/db';
import Message from './models/Message';

const dev = process.env.NODE_ENV !== 'production';
const app = next({ dev });
const handle = app.getRequestHandler();

// Track online users: socketId → { userId, name, roomId }
const onlineUsers = new Map<string, { userId: string; name: string; roomId: string }>();

app.prepare().then(async () => {
  try {
    await connectDB();
    console.log('> Connected to MongoDB for Custom Server');
  } catch (error) {
    console.error('> MongoDB Connection Error in Custom Server:', error);
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

    // ── Room management ──────────────────────────────────────────────
    socket.on('join:room', ({ roomId, userId, name }) => {
      socket.join(roomId);
      
      // Track user with room information
      onlineUsers.set(socket.id, { userId, name, roomId });
      
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
