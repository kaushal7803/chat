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
  
  const socket = getSocket();

  // 1. Load message history with full metadata expansion
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
              type: m.type || 'text',
              fileUrl: m.fileUrl,
              isEdited: m.isEdited,
              reactions: m.reactions || [],
              createdAt: m.createdAt,
            }))
          );
        } else {
          console.error('Invalid message response:', data);
        }
      })
      .catch(error => console.error('Error loading messages:', error));
  }, [roomId]);

  // 2. Live Socket Lifecycle Binding (Chat + Edits + Deletes + Reactions)
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
      setOnlineMembers(users);
    };

    // Inline Updates listeners
    const handleMessageEdited = ({ messageId, content }: { messageId: string; content: string }) => {
      setMessages((prev) =>
        prev.map((msg) => (msg._id === messageId ? { ...msg, content, isEdited: true } : msg))
      );
    };

    const handleMessageDeleted = ({ messageId }: { messageId: string }) => {
      setMessages((prev) =>
        prev.map((msg) => (msg._id === messageId ? { ...msg, content: '🚫 This message was deleted.', type: 'system' } : msg))
      );
    };

    const handleMessageReacted = ({ messageId, reactions }: { messageId: string; reactions: any[] }) => {
      setMessages((prev) =>
        prev.map((msg) => (msg._id === messageId ? { ...msg, reactions } : msg))
      );
    };

    // Register socket events
    socket.on('chat:message', handleChatMessage);
    socket.on('user:typing', handleUserTyping);
    socket.on('room:users', handleRoomUsers);
    socket.on('chat:message_edited', handleMessageEdited);
    socket.on('chat:message_deleted', handleMessageDeleted);
    socket.on('chat:message_reacted', handleMessageReacted);

    return () => {
      socket.emit('leave:room', { roomId });
      socket.off('chat:message', handleChatMessage);
      socket.off('user:typing', handleUserTyping);
      socket.off('room:users', handleRoomUsers);
      socket.off('chat:message_edited', handleMessageEdited);
      socket.off('chat:message_deleted', handleMessageDeleted);
      socket.off('chat:message_reacted', handleMessageReacted);
    };
  }, [roomId, session, socket]);

  // 3. Callback Actions
  const sendMessage = useCallback(
    (content: string, type: 'text' | 'image' | 'file' = 'text', fileUrl?: string) => {
      if (!session?.user || !socket) return;
      const user = session.user as any;
      
      socket.emit('chat:message', {
        roomId,
        senderId: user.id,
        senderName: user.name,
        senderImage: user.image,
        content: content.trim(),
        type,
        fileUrl,
      });
    },
    [roomId, session, socket]
  );

  const editMessage = useCallback(
    (messageId: string, newContent: string) => {
      if (!socket || !newContent.trim()) return;
      socket.emit('chat:edit_message', { roomId, messageId, content: newContent.trim() });
    },
    [roomId, socket]
  );

  const deleteMessage = useCallback(
    (messageId: string) => {
      if (!socket) return;
      socket.emit('chat:delete_message', { roomId, messageId });
    },
    [roomId, socket]
  );

  const reactToMessage = useCallback(
    (messageId: string, emoji: string) => {
      if (!session?.user || !socket) return;
      const user = session.user as any;
      socket.emit('chat:react_message', { roomId, messageId, emoji, userId: user.id });
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

  return { 
    messages, 
    typingUsers, 
    onlineMembers, 
    sendMessage, 
    editMessage, 
    deleteMessage, 
    reactToMessage, 
    sendTyping 
  };
}
