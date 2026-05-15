'use client';

import React, { useState, useEffect, useRef } from 'react';
import { signOut, useSession } from 'next-auth/react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import UserAvatar from './UserAvatar';
import { Room } from '@/types';
import { getSocket } from '@/lib/socket';

interface RoomListProps {
  initialRooms: Room[];
}

export default function RoomList({ initialRooms }: RoomListProps) {
  const { data: session } = useSession();
  const pathname = usePathname();
  const router = useRouter();
  const currentUserId = (session?.user as any)?.id;

  const [rooms, setRooms] = useState<Room[]>(initialRooms);
  const [roomSearchQuery, setRoomSearchQuery] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  
  // Global Online User Tracking Set
  const [globalOnlineUsers, setGlobalOnlineUsers] = useState<Set<string>>(new Set());
  
  // User search for DM provision state
  const [userSearchQuery, setUserSearchQuery] = useState('');
  const [userSearchResults, setUserSearchResults] = useState<any[]>([]);
  const [isSearchingUsers, setIsSearchingUsers] = useState(false);
  const [isUserDropdownOpen, setIsUserDropdownOpen] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  // Create room state
  const [newRoomName, setNewRoomName] = useState('');
  const [newRoomDesc, setNewRoomDesc] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState('');

  // 🌐 Global Online Presence Sockets Setup
  useEffect(() => {
    if (!currentUserId) return;
    
    const socket = getSocket();
    if (!socket.connected) socket.connect();
    
    // Register immediately with the Custom Server for global tracking
    socket.emit('presence:register', { userId: currentUserId });
    
    // Load initial online census
    socket.on('presence:initial', (userIds: string[]) => {
      setGlobalOnlineUsers(new Set(userIds));
    });
    
    // Track live logins/tab-opens
    socket.on('user:global_online', ({ userId }: { userId: string }) => {
      setGlobalOnlineUsers(prev => {
        const updated = new Set(prev);
        updated.add(userId);
        return updated;
      });
    });
    
    // Track live logouts/tab-closes
    socket.on('user:global_offline', ({ userId }: { userId: string }) => {
      setGlobalOnlineUsers(prev => {
        const updated = new Set(prev);
        updated.delete(userId);
        return updated;
      });
    });
    
    return () => {
      socket.off('presence:initial');
      socket.off('user:global_online');
      socket.off('user:global_offline');
    };
  }, [currentUserId]);

  // Re-fetch rooms to capture live additions
  const fetchRooms = async () => {
    try {
      const res = await fetch('/api/rooms');
      if (res.ok) {
        const data = await res.json();
        setRooms(data);
      }
    } catch (err) {
      console.error('Failed to refresh rooms:', err);
    }
  };

  // Watch external dropdown clicks
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setIsUserDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Debounced User Lookup
  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      if (userSearchQuery.trim()) {
        performUserSearch(userSearchQuery);
      } else {
        setUserSearchResults([]);
        setIsUserDropdownOpen(false);
      }
    }, 300);

    return () => clearTimeout(delayDebounceFn);
  }, [userSearchQuery]);

  const performUserSearch = async (q: string) => {
    setIsSearchingUsers(true);
    try {
      const res = await fetch(`/api/users?q=${encodeURIComponent(q)}`);
      if (res.ok) {
        const users = await res.json();
        setUserSearchResults(users);
        setIsUserDropdownOpen(true);
      }
    } catch (err) {
      console.error('User search error:', err);
    } finally {
      setIsSearchingUsers(false);
    }
  };

  const handleStartDM = async (targetUserId: string) => {
    setUserSearchQuery('');
    setIsUserDropdownOpen(false);
    
    try {
      const res = await fetch('/api/rooms/dm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetUserId }),
      });

      const data = await res.json();
      if (res.ok) {
        await fetchRooms();
        router.push(`/chat/${data._id}`);
      }
    } catch (err) {
      console.error('Failed to spawn DM room:', err);
    }
  };

  const handleCreateRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRoomName.trim()) return;
    
    setIsCreating(true);
    setError('');
    
    try {
      const res = await fetch('/api/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newRoomName, description: newRoomDesc }),
      });
      
      const data = await res.json();
      
      if (res.ok) {
        setNewRoomName('');
        setNewRoomDesc('');
        setIsModalOpen(false);
        await fetchRooms();
        router.push(`/chat/${data._id}`);
      } else {
        setError(data.error || 'Something went wrong');
      }
    } catch (err) {
      setError('Network error occurred.');
    } finally {
      setIsCreating(false);
    }
  };

  // ── Segmenting Public vs Private (DM) Rooms ───────────────────────────
  const activePublicRooms = rooms.filter(
    (r) => !r.isDM && !r.name.startsWith('dm:') && r.name.toLowerCase().includes(roomSearchQuery.toLowerCase())
  );
  const activeDMRooms = rooms.filter(
    (r) => r.isDM || r.name.startsWith('dm:')
  );

  // Resolves the remote partner information for a Direct Message room view
  const getDMDisplayData = (room: Room) => {
    if (!room.members || room.members.length === 0) {
      return { id: undefined, name: 'Direct Message', image: undefined };
    }
    
    // Filter for the member who ISN'T the currently authenticated user
    const partner = room.members.find(m => m._id !== currentUserId);
    if (!partner) {
      // If you are chatting with yourself, fallback gracefully
      const self = room.members[0];
      return { id: self?._id, name: self?.name || 'Private Chat', image: self?.image };
    }
    
    return {
      id: partner._id,
      name: partner.name,
      image: partner.image
    };
  };

  return (
    <div className="w-80 h-full flex flex-col border-r border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-900/90 relative z-10">
      
      {/* 1. Profile Strip */}
      <div className="p-4 flex items-center justify-between bg-white dark:bg-zinc-900 border-b border-slate-200 dark:border-zinc-800 shadow-sm">
        <div className="flex items-center gap-3 overflow-hidden">
          <UserAvatar 
            name={session?.user?.name || ''} 
            image={session?.user?.image || undefined} 
            size="md"
          />
          <div className="truncate flex flex-col">
            <span className="font-semibold text-slate-900 dark:text-white truncate text-sm">
              {session?.user?.name}
            </span>
            <span className="text-emerald-500 flex items-center gap-1 text-xs font-medium">
              <span className="w-2 h-2 bg-emerald-500 rounded-full inline-block animate-pulse"></span>
              Online
            </span>
          </div>
        </div>
        
        <button 
          onClick={() => signOut({ callbackUrl: '/' })}
          className="text-slate-400 hover:text-rose-500 p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-zinc-800 transition cursor-pointer"
          title="Logout"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
        </button>
      </div>

      {/* 2. Multi-Layered Search Block */}
      <div className="p-4 space-y-3 bg-slate-50 dark:bg-transparent border-b border-slate-100 dark:border-zinc-900">
        {/* Find Users (Autocomplete Dropdown Container) */}
        <div ref={searchRef} className="relative">
          <svg className="w-4 h-4 text-indigo-500 absolute left-3 top-1/2 transform -translate-y-1/2 z-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
          </svg>
          <input
            type="text"
            placeholder="Find or start conversation..."
            value={userSearchQuery}
            onChange={(e) => setUserSearchQuery(e.target.value)}
            onFocus={() => userSearchResults.length > 0 && setIsUserDropdownOpen(true)}
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-indigo-100 dark:border-indigo-950/30 bg-white dark:bg-zinc-950 text-slate-900 dark:text-white text-sm font-medium placeholder-slate-400 focus:ring-2 focus:ring-indigo-500 outline-none transition shadow-sm"
          />
          {isSearchingUsers && (
            <div className="absolute right-3 top-1/2 transform -translate-y-1/2 text-indigo-500">
              <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
            </div>
          )}

          {/* Dynamic Results Dropdown Overlay */}
          {isUserDropdownOpen && userSearchResults.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-2 bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-zinc-800 z-50 py-2 max-h-64 overflow-y-auto animate-fade-in animate-slide-in">
              <p className="px-4 py-1.5 text-xs font-bold text-slate-400 uppercase tracking-wider">Found Users</p>
              {userSearchResults.map((user) => (
                <button
                  key={user._id}
                  onClick={() => handleStartDM(user._id)}
                  className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-indigo-50 dark:hover:bg-zinc-800 text-left transition"
                >
                  <UserAvatar 
                    name={user.name} 
                    image={user.image} 
                    size="sm" 
                    status={globalOnlineUsers.has(user._id) ? 'online' : 'offline'} 
                  />
                  <div className="truncate">
                    <p className="text-sm font-bold text-slate-800 dark:text-slate-200 truncate">{user.name}</p>
                    <p className="text-xs text-slate-500 dark:text-zinc-400 truncate">{user.email}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Local room filter */}
        <div className="relative">
          <svg className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 transform -translate-y-1/2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Filter channels..."
            value={roomSearchQuery}
            onChange={(e) => setRoomSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 rounded-lg border border-slate-200 dark:border-zinc-800 bg-white/60 dark:bg-zinc-950/40 text-slate-700 dark:text-zinc-300 text-xs outline-none transition"
          />
        </div>
      </div>

      {/* 3. Split Scrollable Canvas */}
      <div className="flex-1 overflow-y-auto p-3 space-y-6 select-none">
        
        {/* ── GROUP A: CHANNELS ───────────────────────────────────────── */}
        <div className="space-y-1.5">
          <div className="px-2 py-1 flex items-center justify-between text-slate-500 dark:text-zinc-400 text-xs font-bold tracking-wider uppercase">
            <span>Public Channels ({activePublicRooms.length})</span>
            <button 
              onClick={() => setIsModalOpen(true)}
              className="text-indigo-500 hover:text-indigo-600 dark:text-indigo-400 dark:hover:text-indigo-300 cursor-pointer"
              title="New Public Room"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4v16m8-8H4" />
              </svg>
            </button>
          </div>

          {activePublicRooms.length === 0 ? (
            <p className="text-center py-3 text-xs text-slate-400 dark:text-zinc-500">No channels found.</p>
          ) : (
            activePublicRooms.map((room) => {
              const isActive = pathname === `/chat/${room._id}`;
              return (
                <Link
                  key={room._id}
                  href={`/chat/${room._id}`}
                  className={`group flex items-center gap-3 p-2.5 rounded-xl transition-all duration-200 border ${
                    isActive 
                      ? 'bg-indigo-600 border-indigo-700 text-white shadow-md shadow-indigo-600/10' 
                      : 'hover:bg-slate-200 dark:hover:bg-zinc-800 text-slate-700 dark:text-zinc-300 bg-white dark:bg-zinc-900/40 border-transparent shadow-sm'
                  }`}
                >
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 font-bold text-sm ${
                    isActive ? 'bg-white/20 text-white' : 'bg-indigo-100 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400'
                  }`}>
                    #
                  </div>
                  <div className="truncate flex-1">
                    <p className={`font-semibold truncate text-sm ${isActive ? 'text-white' : 'text-slate-900 dark:text-white'}`}>
                      {room.name}
                    </p>
                    <p className={`text-xs truncate ${isActive ? 'text-indigo-100' : 'text-slate-500 dark:text-zinc-500'}`}>
                      {room.description || 'Public Lounge'}
                    </p>
                  </div>
                </Link>
              );
            })
          )}
        </div>

        {/* ── GROUP B: DIRECT MESSAGES ─────────────────────────────────── */}
        <div className="space-y-1.5">
          <div className="px-2 py-1 text-slate-500 dark:text-zinc-400 text-xs font-bold tracking-wider uppercase">
            Direct Messages ({activeDMRooms.length})
          </div>

          {activeDMRooms.length === 0 ? (
            <div className="text-center py-6 px-4 border border-dashed border-slate-200 dark:border-zinc-800 rounded-xl">
              <p className="text-xs text-slate-400 dark:text-zinc-500 mb-1">No private chats started.</p>
              <p className="text-[10px] text-indigo-500 font-medium animate-pulse">Search a user above to begin!</p>
            </div>
          ) : (
            activeDMRooms.map((room) => {
              const isActive = pathname === `/chat/${room._id}`;
              const { id: partnerId, name, image } = getDMDisplayData(room);
              const isPartnerOnline = partnerId ? globalOnlineUsers.has(partnerId) : false;
              
              return (
                <Link
                  key={room._id}
                  href={`/chat/${room._id}`}
                  className={`group flex items-center gap-3 p-2.5 rounded-xl transition-all duration-200 border ${
                    isActive 
                      ? 'bg-indigo-600 border-indigo-700 text-white shadow-md shadow-indigo-600/10' 
                      : 'hover:bg-slate-200 dark:hover:bg-zinc-800 text-slate-700 dark:text-zinc-300 bg-white dark:bg-zinc-900/40 border-transparent shadow-sm'
                  }`}
                >
                  <div className="flex-shrink-0">
                    <UserAvatar 
                      name={name} 
                      image={image} 
                      size="sm" 
                      status={isPartnerOnline ? 'online' : 'offline'}
                    />
                  </div>
                  <div className="truncate flex-1">
                    <p className={`font-semibold truncate text-sm ${isActive ? 'text-white' : 'text-slate-900 dark:text-white'}`}>
                      {name}
                    </p>
                    <p className={`text-xs truncate flex items-center gap-1.5 ${isActive ? 'text-indigo-100' : 'text-slate-500 dark:text-zinc-500'}`}>
                      <span className={`w-1.5 h-1.5 rounded-full inline-block ${isPartnerOnline ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400 dark:bg-zinc-600'}`}></span>
                      {isPartnerOnline ? 'Online' : 'Offline'}
                    </p>
                  </div>
                </Link>
              );
            })
          )}
        </div>

      </div>

      {/* 4. Modal Overlay for Public Channel Creation */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="bg-white dark:bg-zinc-900 w-full max-w-md rounded-2xl shadow-2xl border border-slate-200 dark:border-zinc-800 p-6 space-y-6">
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-bold text-slate-900 dark:text-white">Create a New Room</h3>
              <button 
                onClick={() => { setIsModalOpen(false); setError(''); }}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-white transition cursor-pointer"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleCreateRoom} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 dark:text-zinc-400 uppercase mb-1 tracking-wider">Room Name</label>
                <input
                  type="text"
                  required
                  value={newRoomName}
                  onChange={(e) => setNewRoomName(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-950 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-zinc-600 focus:ring-2 focus:ring-indigo-500 outline-none transition"
                  placeholder="e.g. general-discussion"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 dark:text-zinc-400 uppercase mb-1 tracking-wider">Description (Optional)</label>
                <textarea
                  value={newRoomDesc}
                  onChange={(e) => setNewRoomDesc(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-950 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-zinc-600 focus:ring-2 focus:ring-indigo-500 outline-none transition resize-none h-24"
                  placeholder="Tell people what this channel is about"
                />
              </div>

              {error && (
                <p className="text-sm font-medium text-rose-500 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/30 p-3 rounded-xl">
                  {error}
                </p>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => { setIsModalOpen(false); setError(''); }}
                  className="flex-1 py-3 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-slate-700 dark:text-zinc-300 font-semibold transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isCreating || !newRoomName.trim()}
                  className="flex-1 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold shadow-lg shadow-indigo-600/20 dark:shadow-none transition disabled:opacity-50 cursor-pointer"
                >
                  {isCreating ? 'Creating...' : 'Create Room'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
