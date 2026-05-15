'use client';
import { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { getSocket } from '@/lib/socket';
import { ChatMessage, OnlineMember } from '@/types';

export function useChat(roomId: string) {
  const { data: session } = useSession();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const [onlineMembers, setOnlineMembers] = useState<OnlineMember[]>([]);
  
  // Safe access only client-side
  const socket = getSocket();

  // Load message history on mount
  useEffect(() => {
    if (!roomId) return;

    fetch(`/api/messages?roomId=${roomId}`)
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setMessages(
            data.map((m: any) => ({
              _id: m._id,
              senderId: m.sender?._id || 'unknown',
              senderName: m.sender?.name || 'Deleted User',
              senderImage: m.sender?.image,
              content: m.content,
              createdAt: m.createdAt,
            }))
          );
        } else {
          console.error('Invalid message response:', data);
        }
      })
      .catch(error => console.error('Error loading messages:', error));
  }, [roomId]);

  // Connect socket and join room
  useEffect(() => {
    if (!session?.user || !socket || !roomId) return;

    const user = session.user as any;
    if (!socket.connected) socket.connect();

    socket.emit('join:room', { roomId, userId: user.id, name: user.name });

    const handleChatMessage = (msg: ChatMessage) => {
      setMessages((prev) => [...prev, msg]);
    };

    const handleUserTyping = ({ name, isTyping }: { name: string; isTyping: boolean }) => {
      setTypingUsers((prev) =>
        isTyping ? [...new Set([...prev, name])] : prev.filter((n) => n !== name)
      );
    };

    const handleRoomUsers = (users: OnlineMember[]) => {
      console.log('Updated room active users:', users);
      setOnlineMembers(users);
    };

    socket.on('chat:message', handleChatMessage);
    socket.on('user:typing', handleUserTyping);
    socket.on('room:users', handleRoomUsers);

    return () => {
      socket.emit('leave:room', { roomId });
      socket.off('chat:message', handleChatMessage);
      socket.off('user:typing', handleUserTyping);
      socket.off('room:users', handleRoomUsers);
    };
  }, [roomId, session, socket]);

  const sendMessage = useCallback(
    (content: string) => {
      if (!session?.user || !content.trim() || !socket) return;
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
      if (!session?.user || !socket) return;
      const user = session.user as any;
      socket.emit('user:typing', { roomId, userId: user.id, name: user.name, isTyping });
    },
    [roomId, session, socket]
  );

  return { messages, typingUsers, onlineMembers, sendMessage, sendTyping };
}
