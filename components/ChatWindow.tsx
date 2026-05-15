'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useSession } from 'next-auth/react';
import { format } from 'date-fns';
import UserAvatar from './UserAvatar';
import { ChatMessage, OnlineMember } from '@/types';

interface ChatWindowProps {
  roomId: string;
  roomName: string;
  messages: ChatMessage[];
  typingUsers: string[];
  onlineMembers: OnlineMember[];
  sendMessage: (content: string) => void;
  sendTyping: (isTyping: boolean) => void;
  onStartCall: (targetSocketId: string) => void;
  isCallActive: boolean;
}

export default function ChatWindow({
  roomId,
  roomName,
  messages,
  typingUsers,
  onlineMembers,
  sendMessage,
  sendTyping,
  onStartCall,
  isCallActive,
}: ChatWindowProps) {
  const { data: session } = useSession();
  const [inputText, setInputText] = useState('');
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Filter online members to only show OTHERS (not current user)
  const otherOnlineMembers = onlineMembers.filter(
    (member) => member.userId !== (session?.user as any)?.id
  );

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // Auto scroll to bottom when messages or typing state changes
  useEffect(() => {
    scrollToBottom();
  }, [messages, typingUsers]);

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim()) return;

    sendMessage(inputText);
    setInputText('');
    
    // Immediately stop typing
    sendTyping(false);
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputText(e.target.value);
    
    // Handle typing indicator
    sendTyping(true);

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    typingTimeoutRef.current = setTimeout(() => {
      sendTyping(false);
    }, 2000);
  };

  const formatMessageTime = (dateStr: string) => {
    try {
      return format(new Date(dateStr), 'h:mm a');
    } catch (e) {
      return '';
    }
  };

  return (
    <div className="flex-1 h-full flex flex-col bg-white dark:bg-zinc-950 relative">
      
      {/* Chat Header */}
      <div className="px-6 py-4 border-b border-slate-200 dark:border-zinc-800 flex items-center justify-between bg-white/80 dark:bg-zinc-900/80 backdrop-blur-md z-10">
        <div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <span className="text-indigo-500 text-xl">#</span>
            {roomName}
          </h2>
          <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
            {onlineMembers.length} active right now
          </p>
        </div>

        {/* Online Users and Actions */}
        <div className="flex items-center gap-4">
          {otherOnlineMembers.length > 0 && (
            <div className="flex items-center -space-x-2">
              {otherOnlineMembers.slice(0, 3).map((member) => (
                <div key={member.socketId} className="relative" title={`${member.name} is Online`}>
                  <UserAvatar name={member.name} size="sm" className="border-2 border-white dark:border-zinc-900" />
                  <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-emerald-500 rounded-full border-2 border-white dark:border-zinc-900"></span>
                </div>
              ))}
              {otherOnlineMembers.length > 3 && (
                <div className="w-8 h-8 rounded-full bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-slate-300 text-xs font-bold flex items-center justify-center border-2 border-white dark:border-zinc-900 z-10">
                  +{otherOnlineMembers.length - 3}
                </div>
              )}
            </div>
          )}

          {/* Voice Call Controls */}
          {otherOnlineMembers.length > 0 && !isCallActive && (
            <div className="flex items-center gap-2 border-l border-slate-200 dark:border-zinc-800 pl-4">
              <span className="text-xs font-bold text-slate-400 uppercase dark:text-zinc-500 hidden md:inline">Call:</span>
              {otherOnlineMembers.map((member) => (
                <button
                  key={member.socketId}
                  onClick={() => onStartCall(member.socketId)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/30 dark:hover:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400 rounded-full text-xs font-bold transition cursor-pointer"
                  title={`Start voice call with ${member.name}`}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.94.72l.54 2.21a1 1 0 01-.24.97l-2.41 2.41a15.58 15.58 0 006.77 6.77l2.41-2.41a1 1 0 01.97-.24l2.21.54a1 1 0 01.72.94V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                  </svg>
                  <span className="hidden lg:inline">{member.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Message Scroll Feed */}
      <div className="flex-1 overflow-y-auto px-6 py-6 space-y-4 bg-slate-50/50 dark:bg-zinc-950/30">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center opacity-70 py-10">
            <div className="w-16 h-16 rounded-2xl bg-slate-100 dark:bg-zinc-800 flex items-center justify-center text-slate-400 mb-3">
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
            </div>
            <p className="text-slate-900 dark:text-white font-semibold text-sm">No messages yet</p>
            <p className="text-xs text-slate-500 dark:text-zinc-400 mt-1">Start the conversation below.</p>
          </div>
        ) : (
          messages.map((msg, idx) => {
            const isCurrentUser = msg.senderId === (session?.user as any)?.id;
            
            // Visual grouping: check if previous message was from same user within short time
            const prevMsg = messages[idx - 1];
            const isGrouped = prevMsg && prevMsg.senderId === msg.senderId;

            return (
              <div
                key={msg._id || idx}
                className={`flex gap-3 ${isCurrentUser ? 'justify-end' : 'justify-start'} ${isGrouped ? 'mt-1' : 'mt-4'}`}
              >
                {/* Avatar only for incoming messages not grouped */}
                {!isCurrentUser && (
                  <div className="w-8 flex-shrink-0">
                    {!isGrouped && (
                      <UserAvatar name={msg.senderName} image={msg.senderImage} size="sm" />
                    )}
                  </div>
                )}

                {/* Message Bubble Group */}
                <div className={`flex flex-col max-w-[70%] ${isCurrentUser ? 'items-end' : 'items-start'}`}>
                  {!isCurrentUser && !isGrouped && (
                    <span className="text-xs font-bold text-slate-600 dark:text-zinc-400 ml-1 mb-1">
                      {msg.senderName}
                    </span>
                  )}
                  
                  <div className="relative group flex items-end gap-2">
                    {isCurrentUser && (
                      <span className="text-[10px] text-slate-400 opacity-0 group-hover:opacity-100 transition mb-1 whitespace-nowrap">
                        {formatMessageTime(msg.createdAt)}
                      </span>
                    )}

                    <div className={`px-4 py-2.5 rounded-2xl text-sm break-words shadow-sm select-text ${
                      isCurrentUser 
                        ? 'bg-indigo-600 text-white rounded-br-sm' 
                        : 'bg-white dark:bg-zinc-900 text-slate-900 dark:text-zinc-100 border border-slate-200/60 dark:border-zinc-800 rounded-bl-sm'
                    }`}>
                      {msg.content}
                    </div>

                    {!isCurrentUser && (
                      <span className="text-[10px] text-slate-400 opacity-0 group-hover:opacity-100 transition mb-1 whitespace-nowrap">
                        {formatMessageTime(msg.createdAt)}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}

        {/* Typing Indicator Display */}
        {typingUsers.length > 0 && (
          <div className="flex gap-3 items-center mt-2 ml-11">
            <div className="bg-white dark:bg-zinc-900 py-2 px-4 rounded-full border border-slate-200/60 dark:border-zinc-800 flex items-center gap-1.5 shadow-sm">
              <div className="flex gap-1">
                <div className="w-1.5 h-1.5 bg-slate-400 dark:bg-zinc-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                <div className="w-1.5 h-1.5 bg-slate-400 dark:bg-zinc-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                <div className="w-1.5 h-1.5 bg-slate-400 dark:bg-zinc-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
              </div>
              <span className="text-xs font-medium text-slate-500 dark:text-zinc-400 italic">
                {typingUsers.length === 1 ? `${typingUsers[0]} is typing...` : 'Several people typing...'}
              </span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Message Input Form */}
      <div className="p-4 border-t border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 z-10">
        <form onSubmit={handleSend} className="flex gap-2 items-center max-w-5xl mx-auto">
          <div className="flex-1 relative">
            <input
              type="text"
              placeholder="Type your message..."
              value={inputText}
              onChange={handleInputChange}
              className="w-full px-4 py-3.5 bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-slate-900 dark:text-white rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition placeholder-slate-400 dark:placeholder-zinc-600"
            />
          </div>
          <button
            type="submit"
            disabled={!inputText.trim()}
            className="p-3.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-200 dark:disabled:bg-zinc-800 text-white disabled:text-slate-400 dark:disabled:text-zinc-600 rounded-xl shadow-md shadow-indigo-600/10 transition cursor-pointer"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
          </button>
        </form>
      </div>
    </div>
  );
}
