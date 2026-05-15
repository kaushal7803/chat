'use client';

import React, { useState, useEffect } from 'react';
import { signOut, useSession } from 'next-auth/react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import UserAvatar from './UserAvatar';
import { Room } from '@/types';

interface RoomListProps {
  initialRooms: Room[];
}

export default function RoomList({ initialRooms }: RoomListProps) {
  const { data: session } = useSession();
  const pathname = usePathname();
  const router = useRouter();
  
  const [rooms, setRooms] = useState<Room[]>(initialRooms);
  const [searchQuery, setSearchQuery] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  
  // Create room state
  const [newRoomName, setNewRoomName] = useState('');
  const [newRoomDesc, setNewRoomDesc] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState('');

  // Re-fetch rooms on load
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

  const filteredRooms = rooms.filter(room => 
    room.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="w-80 h-full flex flex-col border-r border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-900/90 relative z-10">
      
      {/* User Profile Header */}
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

      {/* Search & Filter */}
      <div className="p-4 bg-slate-50 dark:bg-transparent">
        <div className="relative">
          <svg className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 transform -translate-y-1/2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Search rooms..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-600 outline-none transition"
          />
        </div>
      </div>

      {/* Rooms List Header */}
      <div className="px-4 py-2 flex items-center justify-between text-slate-500 dark:text-zinc-400 text-xs font-bold tracking-wider uppercase">
        <span>Rooms ({filteredRooms.length})</span>
        <button 
          onClick={() => setIsModalOpen(true)}
          className="text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300 flex items-center gap-1 cursor-pointer normal-case text-sm font-semibold"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4v16m8-8H4" />
          </svg>
          New
        </button>
      </div>

      {/* Scrollable Rooms Area */}
      <div className="flex-1 overflow-y-auto p-3 space-y-1">
        {filteredRooms.length === 0 ? (
          <div className="text-center py-8 text-slate-400 dark:text-zinc-500 text-sm">
            {searchQuery ? 'No matching rooms.' : 'No rooms created yet.'}
          </div>
        ) : (
          filteredRooms.map((room) => {
            const isActive = pathname === `/chat/${room._id}`;
            return (
              <Link
                key={room._id}
                href={`/chat/${room._id}`}
                className={`group flex items-center gap-3 p-3 rounded-xl transition-all duration-200 select-none ${
                  isActive 
                    ? 'bg-indigo-600 text-white shadow-md' 
                    : 'hover:bg-slate-200 dark:hover:bg-zinc-800 text-slate-700 dark:text-zinc-300 bg-white dark:bg-zinc-900/50 border border-slate-200/50 dark:border-zinc-800/50'
                }`}
              >
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 font-bold ${
                  isActive ? 'bg-white/20 text-white' : 'bg-indigo-100 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400'
                }`}>
                  #
                </div>
                <div className="truncate flex-1">
                  <div className="flex items-center justify-between">
                    <span className={`font-semibold truncate text-sm ${isActive ? 'text-white' : 'text-slate-900 dark:text-white'}`}>
                      {room.name}
                    </span>
                  </div>
                  <p className={`text-xs truncate ${isActive ? 'text-indigo-100' : 'text-slate-500 dark:text-zinc-400'}`}>
                    {room.description || 'No description'}
                  </p>
                </div>
              </Link>
            );
          })
        )}
      </div>

      {/* Create Room Modal Overlay */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="bg-white dark:bg-zinc-900 w-full max-w-md rounded-2xl shadow-2xl border border-slate-200 dark:border-zinc-800 p-6 space-y-6">
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-bold text-slate-900 dark:text-white">Create a New Room</h3>
              <button 
                onClick={() => { setIsModalOpen(false); setError(''); }}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-white transition"
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
                  className="flex-1 py-3 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-slate-700 dark:text-zinc-300 font-semibold transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isCreating || !newRoomName.trim()}
                  className="flex-1 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold shadow-lg shadow-indigo-600/20 dark:shadow-none transition disabled:opacity-50"
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
