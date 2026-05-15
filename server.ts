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
