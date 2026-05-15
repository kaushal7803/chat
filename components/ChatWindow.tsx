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
  hasMore: boolean;
  isLoadingMore: boolean;
  fetchMoreMessages: () => Promise<void>;
  sendMessage: (content: string, type?: 'text' | 'image' | 'file', fileUrl?: string) => void;
  editMessage: (messageId: string, newContent: string) => void;
  deleteMessage: (messageId: string) => void;
  reactToMessage: (messageId: string, emoji: string) => void;
  sendTyping: (isTyping: boolean) => void;
  onStartCall: (targetSocketId: string) => void;
  isCallActive: boolean;
}

const QUICK_EMOJIS = ['👍', '❤️', '😂', '🎉', '😮', '😢'];

export default function ChatWindow({
  roomId,
  roomName,
  messages,
  typingUsers,
  onlineMembers,
  hasMore,
  isLoadingMore,
  fetchMoreMessages,
  sendMessage,
  editMessage,
  deleteMessage,
  reactToMessage,
  sendTyping,
  onStartCall,
  isCallActive,
}: ChatWindowProps) {
  const { data: session } = useSession();
  const currentUserId = (session?.user as any)?.id;
  
  const [inputText, setInputText] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  
  // Editing track state
  const [editingMsgId, setEditingMsgId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  
  // Lightbox state
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const loadMoreSentinelRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Track count and last ID to prevent prepend auto-scroll jumping!
  const prevMessagesCountRef = useRef(messages.length);
  const prevLastMessageIdRef = useRef(messages[messages.length - 1]?._id);

  // Filter online members to only show OTHERS (not current user)
  const otherOnlineMembers = onlineMembers.filter(
    (member) => member.userId !== currentUserId
  );

  const scrollToBottom = (behavior: ScrollBehavior = 'smooth') => {
    messagesEndRef.current?.scrollIntoView({ behavior });
  };

  // 🟢 NATIVE SCROLL SHIELD: Auto-scroll ONLY when new messages are appended,
  // preventing UI snap-backs when prepending historical content!
  useEffect(() => {
    const lastMsg = messages[messages.length - 1];
    
    if (prevMessagesCountRef.current === 0 && messages.length > 0) {
      // Initial room opening load
      scrollToBottom('auto');
    } else if (lastMsg && lastMsg._id !== prevLastMessageIdRef.current) {
      // New message arrived at the very bottom
      scrollToBottom('smooth');
    }

    prevMessagesCountRef.current = messages.length;
    prevLastMessageIdRef.current = lastMsg?._id;
  }, [messages]);

  // Auto-scroll when remote peer starts typing (adds temporary footer spacing)
  useEffect(() => {
    if (typingUsers.length > 0) {
      scrollToBottom('smooth');
    }
  }, [typingUsers]);

  // 🟢 INFINITE INTERSECTION SYSTEM: Listens for sentinel visibility
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !isLoadingMore) {
          // Store original scroll height before prepending to anchor placement manually if needed
          const container = scrollContainerRef.current;
          const originalScrollHeight = container ? container.scrollHeight : 0;

          fetchMoreMessages().then(() => {
            // Standard scroll anchor fallback verification
            setTimeout(() => {
              if (container) {
                const newScrollHeight = container.scrollHeight;
                const diff = newScrollHeight - originalScrollHeight;
                if (diff > 0) {
                  // Lock viewport scroll to match previous top offset
                  container.scrollTop = container.scrollTop + diff;
                }
              }
            }, 10);
          });
        }
      },
      { threshold: 0.1, root: scrollContainerRef.current }
    );

    const sentinel = loadMoreSentinelRef.current;
    if (sentinel) observer.observe(sentinel);

    return () => {
      if (sentinel) observer.unobserve(sentinel);
    };
  }, [fetchMoreMessages, hasMore, isLoadingMore]);

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

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const file = files[0];
    setIsUploading(true);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      
      if (res.ok) {
        // Auto-dispatch file payload through hook
        sendMessage(data.originalName, data.fileType, data.url);
      } else {
        alert(data.error || 'Upload failed');
      }
    } catch (error) {
      console.error('Error uploading file:', error);
      alert('Network error during upload.');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleSaveEdit = (msgId: string) => {
    if (!editText.trim()) return;
    editMessage(msgId, editText);
    setEditingMsgId(null);
    setEditText('');
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
      
      {/* 1. Chat Header */}
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

          {/* Media Action Overlay */}
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

      {/* 2. The Core Feed Display Container */}
      <div 
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto px-6 py-6 space-y-4 bg-slate-50/50 dark:bg-zinc-950/30 select-none"
        style={{ overflowAnchor: 'auto' }} // Activate browser-native smooth prepend anchoring!
      >
        {/* Sentinel Trigger: Automatically prompts loading block when scrolled into view */}
        {hasMore && (
          <div 
            ref={loadMoreSentinelRef} 
            className="w-full flex justify-center py-4 opacity-90 transition-opacity duration-200"
          >
            {isLoadingMore ? (
              <div className="flex items-center gap-2 bg-slate-100/80 dark:bg-zinc-900/80 border border-slate-200/50 dark:border-zinc-800 px-4 py-2 rounded-full shadow-sm backdrop-blur-md animate-pulse">
                <svg className="animate-spin h-4 w-4 text-indigo-500 dark:text-cyan-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <span className="text-[11px] font-bold tracking-wider text-slate-500 dark:text-zinc-400 uppercase">Syncing historical feeds...</span>
              </div>
            ) : (
              <span className="text-[9px] font-semibold text-slate-400/80 dark:text-zinc-600 uppercase tracking-widest">▲ Scroll upward to pull history ▲</span>
            )}
          </div>
        )}
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
            const isCurrentUser = msg.senderId === currentUserId;
            const messageType = msg.type || 'text';
            const isSystem = messageType === 'system';
            
            const prevMsg = messages[idx - 1];
            const isGrouped = prevMsg && prevMsg.senderId === msg.senderId && !isSystem;

            if (isSystem) {
              return (
                <div key={msg._id || idx} className="flex justify-center w-full my-2 select-text">
                  <span className="px-3 py-1 rounded-full bg-slate-100 dark:bg-zinc-900/80 border border-slate-200/50 dark:border-zinc-800 text-[11px] font-semibold text-slate-500 dark:text-zinc-400 flex items-center gap-1.5">
                    {msg.content}
                  </span>
                </div>
              );
            }

            const userHasReacted = (emoji: string) => {
              const reaction = msg.reactions?.find(r => r.emoji === emoji);
              return reaction?.users.includes(currentUserId) || false;
            };

            return (
              <div
                key={msg._id || idx}
                className={`flex gap-3 ${isCurrentUser ? 'justify-end' : 'justify-start'} ${isGrouped ? 'mt-1' : 'mt-4'}`}
              >
                {/* Incoming Avatars */}
                {!isCurrentUser && (
                  <div className="w-8 flex-shrink-0">
                    {!isGrouped && (
                      <UserAvatar name={msg.senderName} image={msg.senderImage} size="sm" />
                    )}
                  </div>
                )}

                {/* Content Wrapper */}
                <div className={`flex flex-col max-w-[70%] ${isCurrentUser ? 'items-end' : 'items-start'}`}>
                  {!isCurrentUser && !isGrouped && (
                    <span className="text-xs font-bold text-slate-600 dark:text-zinc-400 ml-1 mb-1">
                      {msg.senderName}
                    </span>
                  )}
                  
                  <div className="relative group/bubble flex items-center gap-2 select-text">
                    
                    {/* ── RIGHT-HOVER ACTIONS (Incoming Message) ── */}
                    {!isCurrentUser && (
                      <div className="flex gap-1 items-center opacity-0 group-hover/bubble:opacity-100 transition-opacity duration-150 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 shadow-lg rounded-full px-1.5 py-0.5 z-10 translate-x-2">
                        {QUICK_EMOJIS.slice(0, 4).map(e => (
                          <button 
                            key={e} 
                            onClick={() => msg._id && reactToMessage(msg._id, e)}
                            className={`hover:scale-125 text-sm p-0.5 transition cursor-pointer rounded-full ${userHasReacted(e) ? 'bg-indigo-50 dark:bg-indigo-950/50' : ''}`}
                          >
                            {e}
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Time Stamp (Left) */}
                    {isCurrentUser && (
                      <span className="text-[10px] text-slate-400 opacity-0 group-hover/bubble:opacity-100 transition mb-1 whitespace-nowrap flex items-center gap-1">
                        {msg.isEdited && <span className="text-[9px] uppercase font-bold tracking-wider text-slate-500 dark:text-zinc-500">(edited)</span>}
                        {formatMessageTime(msg.createdAt)}
                      </span>
                    )}

                    {/* ── THE BUBBLE CONTENT ── */}
                    <div className="flex flex-col items-end">
                      <div className={`relative max-w-full break-words shadow-sm ${
                        isCurrentUser 
                          ? 'bg-indigo-600 text-white rounded-2xl rounded-br-sm' 
                          : 'bg-white dark:bg-zinc-900 text-slate-900 dark:text-zinc-100 border border-slate-200/60 dark:border-zinc-800 rounded-2xl rounded-bl-sm'
                      } ${messageType === 'text' ? 'px-4 py-2.5 text-sm' : 'p-1'}`}>
                        
                        {/* Rendering Mode 1: Text Input Field (Editing) */}
                        {editingMsgId === msg._id ? (
                          <div className="flex flex-col gap-1.5 p-1 min-w-[200px]">
                            <input
                              type="text"
                              value={editText}
                              onChange={(e) => setEditText(e.target.value)}
                              className="w-full px-2 py-1.5 rounded-lg text-sm bg-white dark:bg-zinc-950 text-slate-900 dark:text-white border-none outline-none ring-1 ring-indigo-400 focus:ring-2"
                              autoFocus
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') handleSaveEdit(msg._id);
                                if (e.key === 'Escape') { setEditingMsgId(null); setEditText(''); }
                              }}
                            />
                            <div className="flex gap-1.5 justify-end">
                              <button 
                                onClick={() => { setEditingMsgId(null); setEditText(''); }}
                                className="text-[10px] font-bold px-2 py-1 rounded hover:bg-black/10 dark:hover:bg-white/10 transition cursor-pointer"
                              >
                                Cancel
                              </button>
                              <button 
                                onClick={() => handleSaveEdit(msg._id)}
                                className="text-[10px] font-bold bg-indigo-500 hover:bg-indigo-400 text-white px-2 py-1 rounded shadow-sm transition cursor-pointer"
                              >
                                Save
                              </button>
                            </div>
                          </div>
                        ) : (
                          <>
                            {/* Rendering Mode 2: Read-only Content Types */}
                            {messageType === 'text' && msg.content}
                            
                            {messageType === 'image' && msg.fileUrl && (
                              <div 
                                onClick={() => setLightboxUrl(msg.fileUrl || null)}
                                className="cursor-pointer overflow-hidden rounded-xl max-w-[260px] sm:max-w-xs relative group/img"
                              >
                                <img 
                                  src={msg.fileUrl} 
                                  alt={msg.content} 
                                  className="object-cover w-full h-auto max-h-60 bg-slate-100 dark:bg-zinc-800 hover:scale-[1.02] transition-all duration-300"
                                />
                                <div className="absolute inset-0 bg-black/30 opacity-0 group-hover/img:opacity-100 flex items-center justify-center transition-opacity duration-200">
                                  <span className="bg-white/20 backdrop-blur-md text-white text-xs font-bold px-3 py-1.5 rounded-full">Expand</span>
                                </div>
                              </div>
                            )}

                            {messageType === 'file' && msg.fileUrl && (
                              <a
                                href={msg.fileUrl}
                                download
                                className={`flex items-center gap-3 p-3 rounded-xl text-sm transition-all border select-none ${
                                  isCurrentUser
                                    ? 'bg-indigo-700/50 hover:bg-indigo-700 border-indigo-500/50 text-white'
                                    : 'bg-slate-50 hover:bg-slate-100 dark:bg-zinc-950 dark:hover:bg-zinc-800/80 border-slate-200 dark:border-zinc-800 text-slate-900 dark:text-white'
                                }`}
                              >
                                <div className={`p-2 rounded-lg flex-shrink-0 ${isCurrentUser ? 'bg-white/20 text-white' : 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400'}`}>
                                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                  </svg>
                                </div>
                                <div className="truncate text-left flex-1 max-w-[160px] sm:max-w-[200px]">
                                  <p className="font-bold text-xs truncate">{msg.content}</p>
                                  <p className="text-[10px] opacity-75 uppercase tracking-wider font-semibold mt-0.5">Download Attachment</p>
                                </div>
                              </a>
                            )}
                          </>
                        )}
                      </div>

                      {/* ── NESTED REACTIONS DISPLAY BLOCK ── */}
                      {msg.reactions && msg.reactions.length > 0 && (
                        <div className={`flex flex-wrap gap-1 mt-1 ${isCurrentUser ? 'justify-end' : 'justify-start'}`}>
                          {msg.reactions.map((r, rIdx) => {
                            if (r.users.length === 0) return null;
                            const activeReaction = r.users.includes(currentUserId);
                            return (
                              <button
                                key={rIdx}
                                onClick={() => msg._id && reactToMessage(msg._id, r.emoji)}
                                className={`flex items-center gap-1 px-1.5 py-0.5 rounded-full border text-xs font-bold transition hover:scale-105 cursor-pointer select-none ${
                                  activeReaction
                                    ? 'bg-indigo-50 border-indigo-200 text-indigo-600 dark:bg-indigo-950/30 dark:border-indigo-800 dark:text-indigo-400 shadow-sm'
                                    : 'bg-white border-slate-200 text-slate-600 dark:bg-zinc-900 dark:border-zinc-800 dark:text-zinc-400'
                                }`}
                                title={activeReaction ? "Remove reaction" : "Add reaction"}
                              >
                                <span>{r.emoji}</span>
                                <span className="text-[10px]">{r.users.length}</span>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {/* Time Stamp (Right) */}
                    {!isCurrentUser && (
                      <span className="text-[10px] text-slate-400 opacity-0 group-hover/bubble:opacity-100 transition mb-1 whitespace-nowrap flex items-center gap-1">
                        {formatMessageTime(msg.createdAt)}
                        {msg.isEdited && <span className="text-[9px] uppercase font-bold tracking-wider text-slate-500 dark:text-zinc-500">(edited)</span>}
                      </span>
                    )}

                    {/* ── LEFT-HOVER ACTIONS (Self Message: Edit / Delete / React) ── */}
                    {isCurrentUser && !editingMsgId && (
                      <div className="flex gap-0.5 items-center opacity-0 group-hover/bubble:opacity-100 transition-opacity duration-150 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 shadow-lg rounded-full px-1 py-0.5 z-10 -translate-x-2">
                        
                        {/* Emoji Quick Select */}
                        <div className="flex items-center px-1 border-r border-slate-100 dark:border-zinc-800 mr-0.5">
                          {QUICK_EMOJIS.slice(0, 3).map(e => (
                            <button 
                              key={e} 
                              onClick={() => msg._id && reactToMessage(msg._id, e)}
                              className={`hover:scale-125 text-xs p-0.5 transition cursor-pointer rounded-full ${userHasReacted(e) ? 'bg-indigo-50 dark:bg-indigo-950/50' : ''}`}
                            >
                              {e}
                            </button>
                          ))}
                        </div>

                        {/* Edit Trigger (Text Only) */}
                        {messageType === 'text' && (
                          <button 
                            onClick={() => { setEditingMsgId(msg._id); setEditText(msg.content); }}
                            className="p-1 text-slate-400 hover:text-indigo-500 rounded-full hover:bg-slate-50 dark:hover:bg-zinc-800 transition cursor-pointer"
                            title="Edit"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                            </svg>
                          </button>
                        )}

                        {/* Delete Trigger */}
                        <button 
                          onClick={() => msg._id && deleteMessage(msg._id)}
                          className="p-1 text-slate-400 hover:text-rose-500 rounded-full hover:bg-slate-50 dark:hover:bg-zinc-800 transition cursor-pointer"
                          title="Delete"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    )}

                  </div>
                </div>
              </div>
            );
          })
        )}

        {/* ── TYPING INDICATOR ── */}
        {typingUsers.length > 0 && (
          <div className="flex gap-3 items-center mt-2 ml-11 select-none">
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

      {/* 3. Bottom Action Inputs Form */}
      <div className="p-4 border-t border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 z-10">
        <form onSubmit={handleSend} className="flex gap-2 items-center max-w-5xl mx-auto">
          
          {/* Hidden browser native file input */}
          <input 
            type="file" 
            ref={fileInputRef}
            onChange={handleFileUpload}
            className="hidden"
            accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.zip,.txt"
          />

          {/* Plus/Paperclip icon trigger */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            className={`p-3.5 rounded-xl border bg-slate-50 hover:bg-slate-100 dark:bg-zinc-900 dark:hover:bg-zinc-800 dark:border-zinc-800 text-slate-500 dark:text-zinc-400 hover:text-indigo-500 transition cursor-pointer flex-shrink-0 shadow-sm ${isUploading ? 'opacity-50 cursor-wait' : ''}`}
            title="Upload media/file"
          >
            {isUploading ? (
              <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
            ) : (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4v16m8-8H4" />
              </svg>
            )}
          </button>

          <div className="flex-1 relative">
            <input
              type="text"
              placeholder="Type your message..."
              value={inputText}
              onChange={handleInputChange}
              disabled={isUploading}
              className="w-full px-4 py-3.5 bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-slate-900 dark:text-white rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition placeholder-slate-400 dark:placeholder-zinc-600 shadow-sm"
            />
          </div>

          <button
            type="submit"
            disabled={!inputText.trim() || isUploading}
            className="p-3.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-200 dark:disabled:bg-zinc-800 text-white disabled:text-slate-400 dark:disabled:text-zinc-600 rounded-xl shadow-md shadow-indigo-600/10 transition cursor-pointer flex-shrink-0"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
          </button>
        </form>
      </div>

      {/* 4. Full-Screen Image Lightbox Overlay */}
      {lightboxUrl && (
        <div 
          onClick={() => setLightboxUrl(null)}
          className="fixed inset-0 bg-black/90 backdrop-blur-md flex items-center justify-center z-50 p-4 animate-fade-in select-none cursor-zoom-out"
        >
          <button className="absolute top-4 right-4 bg-white/10 hover:bg-white/20 rounded-full p-2 text-white transition cursor-pointer">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          <img 
            src={lightboxUrl} 
            alt="Expanded View" 
            className="max-w-full max-h-full object-contain rounded shadow-2xl ring-1 ring-white/10 animate-zoom-in"
            onClick={(e) => e.stopPropagation()} 
          />
        </div>
      )}

    </div>
  );
}
